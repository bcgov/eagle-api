/*
 * Used by the main application
 * Used by the jest testing framework
 */

const mongooseOptions = {
  maxPoolSize: 10, // Maintain up to 10 socket connections (renamed from poolSize)
  // If not connected, return errors immediately rather than waiting for reconnect
  bufferMaxEntries: 0,
  keepAlive: true, // Attempt to keep the socket active (changed from 1 to true)
  connectTimeoutMS: 10000, // Give up initial connection after 10 seconds
  socketTimeoutMS: 45000 // Close sockets after 45 seconds of inactivity
};
exports.mongooseOptions = mongooseOptions;
