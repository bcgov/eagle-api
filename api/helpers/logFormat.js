'use strict';

const winston = require('winston');

const { format } = winston;

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

/** Console-only logger fixed at info, for lines that must show whatever LOG_LEVEL is (prod runs error). */
function infoConsoleLogger(name) {
  return winston.loggers.get(name, {
    level: 'info',
    transports: [new winston.transports.Console({ level: 'info', format: consoleFormat() })]
  });
}

module.exports = { consoleFormat, infoConsoleLogger };
