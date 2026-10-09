'use strict';

const defaultLog = require('winston').loggers.get('default');
var mongoose = require ('mongoose');
const { pushedSchema, PENDING_FIELDS } = require('./demiPushKinds');

// Drops the pending fields from one update document or pipeline stage, in place.
function stripPending(target) {
  if (!target || typeof target !== 'object') {
    return;
  }
  for (const key of Object.keys(target)) {
    const value = target[key];
    if (PENDING_FIELDS.includes(key)) {
      delete target[key];
    } else if (key === '$unset' && (typeof value === 'string' || Array.isArray(value))) {
      // Pipeline form: { $unset: 'field' } or { $unset: ['field', ...] }
      const kept = [].concat(value).filter(field => !PENDING_FIELDS.includes(field));
      if (kept.length) {
        target[key] = kept;
      } else {
        delete target[key];
      }
    } else if (key.startsWith('$') && value && typeof value === 'object') {
      for (const field of PENDING_FIELDS) {
        delete value[field];
      }
      if (Object.keys(value).length === 0) {
        delete target[key];
      }
    }
  }
}

// Only demiPush writes the pending fields, passing demiPushInternal. A client body that reaches a write
// would otherwise clear the sweep's flag or forge one.
function guardPendingFields(schema) {
  schema.pre('save', function (options) {
    if (options && options.demiPushInternal) {
      return;
    }
    for (const field of PENDING_FIELDS) {
      if (this.isNew) {
        this.set(field, undefined);
      } else if (this.isModified(field)) {
        this.unmarkModified(field);
      }
    }
  });
  schema.pre(['updateOne', 'updateMany', 'findOneAndUpdate'], function () {
    if (this.getOptions().demiPushInternal) {
      return;
    }
    const update = this.getUpdate();
    for (const stage of [].concat(update || [])) {
      stripPending(stage);
    }
  });
}

var genSchema = function (name, definition) {
  //
  // ensure
  //
  definition.methods__ = definition.methods__ || {};
  definition.virtuals__ = definition.virtuals__ || [];
  definition.indexes__ = definition.indexes__ || [];
  definition.statics__ = definition.statics__ || {};
  definition.presave__ = definition.presave__ || null;
  //
  // put aside the stuff that must happen post schema creation
  //
  var m = definition.methods__;
  var virtuals = definition.virtuals__;
  var s = definition.statics__;
  var pre = definition.presave__;
  var post = definition.postsave__;
  definition.methods__ = null;
  definition.virtuals__ = null;
  definition.indexes__ = null;
  definition.statics__ = null;
  definition.presave__ = null;
  delete definition.methods__;
  delete definition.virtuals__;
  delete definition.indexes__;
  delete definition.statics__;
  delete definition.presave__;

  var options;
  if (virtuals) {
    // http://mongoosejs.com/docs/2.7.x/docs/virtuals.html
    options = {
      toObject: {
        virtuals: true
      },
      toJSON: {
        virtuals: true
      }
    };
  }
  //
  // let every model know its schema name in the real world, this is bound
  // to come in handy somewhere, likely with permission setting since the
  // ids are unbound from their model types
  //
  definition._schemaName = {type:String, default:name, index: true};

  // Add audit fields if it's not the Audit model itself
  if (name !== 'Audit') {
    definition._updatedBy = { type: String, default: 'system' };
    definition._addedBy = { type: String, default: 'system' };
    definition._deletedBy = { type: String, default: 'system' };
  }

  // Set when a DEMI push did not land; demi-push-sweep re-pushes these rows and clears them.
  if (pushedSchema(name)) {
    definition.demiPushPending = { type: Boolean, index: { sparse: true } };
    definition.demiPushFailedAt = Date;
    definition.demiPushError = String;
  }

  //
  // create the schema
  //
  var schema = new mongoose.Schema (definition, options);
  //
  // perform post process stuff
  //
  // Postsave hook
  if (pre) {
    schema.pre('save', pre);
  }
  if (pushedSchema(name)) {
    guardPendingFields(schema);
  }
  schema.pre('findOneAndUpdate', function() {
    const update = this.getUpdate();
    if (update.__v != null) {
      delete update.__v;
    }
    const keys = ['$set', '$setOnInsert'];
    for (const key of keys) {
      if (update[key] != null && update[key].__v != null) {
        delete update[key].__v;
        if (Object.keys(update[key]).length === 0) {
          delete update[key];
        }
      }
    }
    update.$inc = update.$inc || {};
    update.$inc.__v = 1;
  });
  if (post) {
    schema.post ('save', post);
  } else {
    // Default - no save hook for audit
    if (name !== 'Audit') {
      schema.post('save', function (doc) {
        var Audit = mongoose.model('Audit');
        var audit = new Audit({
          _objectSchema: doc._schemaName,
          objId: doc._id,
          updatedBy: doc._updatedBy,
          addedBy: doc._addedBy
        });
        audit.save();
      });
    }
  }
  if (s) Object.assign (schema.statics, s);
  if (m) Object.assign (schema.methods, m);
  // if (i) _.each (i, function (d) { schema.index (d); });
  if (virtuals) {
    // http://mongoosejs.com/docs/2.7.x/docs/virtuals.html
    virtuals.forEach(function(virtual){
      var v = schema.virtual(virtual.name);
      if(virtual.get) v.get(virtual.get);
      if(virtual.set) v.set(virtual.set);
    });
  }

  // Enable FTS on documents
  // if (schema.obj._schemaName.default === "Document") {
  //     schema.index({"$**":"text"});
  // }

  return schema;
};

module.exports = function (name, definition, collection) {
  if (!name || !definition) {
    defaultLog.error('No name or definition supplied when building schema');
    return;
  }
  return mongoose.model (name, genSchema  (name, definition), collection);
};