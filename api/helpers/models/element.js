var mongoose = require('mongoose');
var Mixed = mongoose.Schema.Types.Mixed;

module.exports = require ('../models')('InspectionElement', {
    // Tracking
    _schemaName: { type: String, default: 'InspectionElement' },
    _createdDate    : { type: Date, default: Date.now() },
    _updatedDate    : { type: Date, default: Date.now() },
    _addedBy        : { type:String, default:'system' },
    _updatedBy      : { type:String, default:'system' },
    _deletedBy      : { type:String, default:'system' },

    // Note: Default on tag property is purely for display only, they have no real effect on the model
    // This must be done in the code.
    read             : [{ type: String, trim: true, default: 'sysadmin' }],
    write            : [{ type: String, trim: true, default: 'sysadmin' }],
    delete           : [{ type: String, trim: true, default: 'sysadmin' }],

    // Not editable
    type : { type:String, default:'' },
    uri  : { type:String, default:'' },
    geo  : { type: Mixed, default: {} },

    // Only used for text elements
    text : { type: Mixed, default: {} },

    // Minio handler
    internalURL      : { type:String, default:'' },
    internalExt      : { type:String, default:'' },
    internalSize     : { type:String, default:'' },
    internalMime     : { type:String, default:'' },

}, 'epic');
