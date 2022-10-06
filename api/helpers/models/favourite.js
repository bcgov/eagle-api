module.exports = require('../models')('Favourite', {
    userId              : { type: String, default:'' },
    type                : { type: String, default:'' },
    objId               : { type: 'ObjectId', default: null, index: true },
    read                : [{ type: String, trim: true, default: 'sysadmin' }],
    write               : [{ type: String, trim: true, default: 'sysadmin' }],
    indexes__           : [{fields: {userId: 1, type: 1, objId: 1}, options: {name: "favouritesIndex"}}],
    options__           : {timestamps: true}
  }, 'epic');