module.exports = require('../models')('Project', {
  currentProjectData      : { legislation: 'ObjectId' },
  projectData         : [{ 1996: 'ObjectId', 2002: 'ObjectId', 2018: 'ObjectId'}],
}, 'epic');