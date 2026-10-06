'use strict';

const { format } = require('winston');

/** Console line format shared by every winston logger the app registers. */
function consoleFormat() {
  return format.combine(
    format.errors({ stack: true }),
    format.splat(),
    format.colorize(),
    format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    format.printf(({ timestamp, level, message, stack }) =>
      stack
        ? `${timestamp} ${level}: ${message}\n${stack}`
        : `${timestamp} ${level}: ${message}`
    )
  );
}

module.exports = { consoleFormat };
