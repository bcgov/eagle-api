'use strict';

const mongoose = require('mongoose');

// A hard delete whose DEMI push did not land. The row is gone, so the body that delete pushed is
// kept here for demi-push-sweep to resend; DEMI needs it whole (parent id, read[]) to file the delete.
const schema = new mongoose.Schema({
  kind: { type: String, required: true },
  targetId: { type: mongoose.Schema.Types.ObjectId, required: true },
  failedAt: Date,
  error: String,
  body: { type: mongoose.Schema.Types.Mixed, required: true }
}, { timestamps: { createdAt: true, updatedAt: false } });

schema.index({ kind: 1, targetId: 1 }, { unique: true });

module.exports = mongoose.model('DemiPushTombstone', schema, 'demi_push_tombstones');
