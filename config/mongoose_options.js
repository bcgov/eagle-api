/*
 * Used by the main application
 * Used by the jest testing framework
 */

const mongooseOptions = {
  maxPoolSize: 10, // Maintain up to 10 socket connections
  connectTimeoutMS: 10000, // Give up initial connection after 10 seconds
  socketTimeoutMS: 45000, // Close sockets after 45 seconds of inactivity
  authSource: process.env.MONGODB_AUTHSOURCE || 'admin'
};
exports.mongooseOptions = mongooseOptions;
