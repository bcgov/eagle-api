var mongoose = require('mongoose');
var Mixed = mongoose.Schema.Types.Mixed;

module.exports = require ('../models')('Inspection', {
    // Tracking
    _schemaName: { type: String, default: 'Inspection' },
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
    name      : { type:String, default:'' },
    label     : { type:String, default:'' },
    case      : { type:String, default:'' },
    email     : { type:String, default:'' },
    startDate : { type: Date, default: Date.now() },
    endDate   : { type: Date, default: Date.now() },
    elements  : [{ type: Mixed, default: {} }],
    project   : { type:'ObjectId', ref:'Project', default:null }

}, 'epic');
