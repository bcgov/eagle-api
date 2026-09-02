'use strict';

const defaultLog = require('winston').loggers.get('default');

// Last-resort handler: anything a route throws is logged with its stack (format.errors in
// app_helper) so Application Insights sees it, and the caller gets a generic 500.
module.exports = function errorHandler(err, req, res, next) {
  defaultLog.error(err);
  if (res.headersSent) {
    return next(err);
  }
  res.status(500).json({ message: 'Internal server error' });
};
