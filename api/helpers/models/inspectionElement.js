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

  // Meta
  title       : { type: String, default: '' },
  requirement : { type: String, default: '' },
  description : { type: String, default: '' },
  timestamp   : { type: Date, default: Date.now() },
  // Items
  items: [{ type:'ObjectId', ref:'InspectionItems', default:null }],
  elementId: { type:'String', index: true }

}, 'epic');
