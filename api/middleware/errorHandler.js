'use strict';

const defaultLog = require('winston').loggers.get('default');

// Last-resort handler: anything a route throws is logged with its stack (format.errors in
// app_helper) so Application Insights sees it. Errors carrying their own status — body-parser's
// 400 on malformed JSON, 413 on an oversized body — keep it and their message; everything else
// is ours to hide behind a generic 500.
module.exports = function errorHandler(err, req, res, next) {
  const status = err.status || err.statusCode || 500;

  if (status < 500) {
    defaultLog.warn(err);
  } else {
    defaultLog.error(err);
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
