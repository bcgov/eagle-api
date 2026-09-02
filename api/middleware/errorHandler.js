'use strict';

const defaultLog = require('winston').loggers.get('default');

// Last-resort handler: logs message+stack only, never the raw error (body-parser sets err.body
// to the request bytes, which for /api/login/token is a password).
module.exports = function errorHandler(err, req, res, next) {
  const status = err.status || err.statusCode || 500;
  const logMeta = { message: err.message, stack: err.stack };

  if (status < 500) {
    defaultLog.warn(`${req.method} ${req.originalUrl} ${status}`, logMeta);
  } else {
    defaultLog.error(`${req.method} ${req.originalUrl}`, logMeta);
  }

  if (res.headersSent) {
    return next(err);
  }

  res.status(status).json(
    status < 500
      ? { message: err.message || 'Bad request' }
      : { message: 'Internal server error' }
  );
};
