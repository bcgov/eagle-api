'use strict';

const mongoose = require('mongoose');

module.exports = function projectRedirectMiddleware() {
  const OBJECTID_REGEX = /^[0-9a-fA-F]{24}$/;

  return async function (req, res, next) {
    const segments = req.path.split('/');
    const legacyIdIndex = segments.findIndex(seg => OBJECTID_REGEX.test(seg));

    if (legacyIdIndex !== -1) {
      const legacyId = segments[legacyIdIndex];
      try {
        const Project = mongoose.model('Project');
        const project = await Project.findById(legacyId).select('trackProjectId').lean();
        if (project && project.trackProjectId) {
          segments[legacyIdIndex] = project.trackProjectId.toString();
          const newPath = segments.join('/');
          const queryStr = req.url.includes('?') ? req.url.substring(req.url.indexOf('?')) : '';

          if (req.method === 'GET') {
            return res.redirect(301, newPath + queryStr);
          } else {
            req.url = newPath + queryStr; // Transparent rewrite for POST/PUT/DELETE
          }
        }
      } catch (err) {
        // Fail silent, proceed to default handler
      }
    }
    next();
  };
};
