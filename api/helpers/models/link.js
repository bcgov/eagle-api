module.exports = require('../models')('Link', 
{
    rel:    { type: String, default: null },
    title:  { type: String, default: null },
    method: { type: String, default: null },
    href:   { type: String, default: null }

}, 'epic');