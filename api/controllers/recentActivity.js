var defaultLog = require('winston').loggers.get('default');
var mongoose = require('mongoose');
var Actions = require('../helpers/actions');
var Utils = require('../helpers/utils');
var demiPush = require('../helpers/demiPush');
var parentRead = require('../helpers/parentRead');
var constants = require('../helpers/constants');
var updateRules = require('../helpers/updateRules');
const updateImages = require('../helpers/updateImages');

const IMAGE_PUBLISH_FAILED = 'Could not publish the Update images; the Update was not saved.';


exports.protectedOptions = function (args, res) {
  res.status(200).send();
};

exports.publicGet = async function (args, res) {
  try {
    var RecentActivity = mongoose.model('RecentActivity');

    // This route only ever answers the public, which is what the $redact below assumes. Resolved
    // once here rather than per row; a failure throws instead of dropping the gate.
    const unreadableParents = await parentRead.unreadableParentIds(constants.PUBLIC_ROLES);

    // Build a focused pipeline that sorts and limits BEFORE running $lookups.
    // The old approach ran 3 $lookups on all 2,462 active items and then
    // discarded all but 4.  Moving $sort+$limit up front means the $lookups
    // only process 4 documents — cutting response time from ~1.7 s to ~300 ms.
    var projection = {
      _id: 1, _schemaName: 1, dateUpdated: 1, dateAdded: 1, pinned: 1,
      documentUrl: 1, contentUrl: 1, type: 1, notificationName: 1,
      projectNotification: 1, pcp: 1, active: 1, project: 1,
      content: 1, headline: 1, complianceAndEnforcement: 1,
      code: 1, proponent: 1, tags: 1, read: 1,
      category: 1, shortHeadline: 1, summary: 1, featuredImage: 1, images: 1, attachments: 1,
      regions: 1, location: 1, engagementUrl: 1, subject: 1, status: 1, publishDate: 1
    };
    const now = new Date();

    function buildPipeline(pinnedValue) {
      return [
        { $match: { _schemaName: 'RecentActivity', active: true, pinned: pinnedValue, ...updateRules.publicVisibleMatch(now) } },
        // An activity's own read[] says nothing about its project, so an active row under an
        // unpublished project would otherwise reach the public. Ahead of the $limit so a hidden
        // row does not eat one of the four slots.
        ...parentRead.parentReadMatch(unreadableParents),
        { $sort: { publishDate: -1, dateAdded: -1 } },
        { $limit: 4 },
        // --- lookups now run on at most 4 docs ---
        { $lookup: { from: 'epic', localField: 'project', foreignField: '_id', as: 'project' } },
        { $unwind: { path: '$project', preserveNullAndEmptyArrays: true } },
        { $lookup: { from: 'epic', localField: 'pcp', foreignField: '_id', as: 'pcp' } },
        { $unwind: { path: '$pcp', preserveNullAndEmptyArrays: true } },
        { $lookup: { from: 'epic', localField: 'project._id', foreignField: '_id', as: 'projectNotification' } },
        { $unwind: { path: '$projectNotification', preserveNullAndEmptyArrays: true } },
        // Unpack legislation data into the populated project
        { $addFields: { 'project.default': { $switch: {
          branches: [
            { case: { $eq: ['$project.currentLegislationYear', 'legislation_1996'] }, then: '$project.legislation_1996' },
            { case: { $eq: ['$project.currentLegislationYear', 'legislation_2002'] }, then: '$project.legislation_2002' },
            { case: { $eq: ['$project.currentLegislationYear', 'legislation_2018'] }, then: '$project.legislation_2018' }
          ],
          default: '$project.legislation_2002'
        }}}},
        { $addFields: {
          'project.default._id': '$project._id',
          'project.default.read': '$project.read',
          'project.default.pins': '$project.pins',
          'project.default.pinsHistory': '$project.pinsHistory',
          'project.default.pinsRead': '$project.pinsRead'
        }},
        { $addFields: { project: '$project.default' } },
        // Field selection — match the old runDataQuery projection
        { $project: projection },
        // Role-based access control
        { $redact: { $cond: {
          if: { $and: [
            { $cond: { if: '$read', then: true, else: false } },
            { $anyElementTrue: { $map: {
              input: '$read', as: 'fieldTag',
              in: { $setIsSubset: [['$$fieldTag'], ['public']] }
            }}}
          ]},
          then: '$$KEEP',
          else: { $cond: { if: '$read', then: '$$PRUNE', else: '$$PRUNE' } }
        }}}
      ];
    }

    var collation = { locale: 'en', strength: 2 };
    const [pinned, unpinned] = await Promise.all([
      RecentActivity.aggregate(buildPipeline(true)).collation(collation).exec(),
      RecentActivity.aggregate(buildPipeline(false)).collation(collation).exec()
    ]);

    // Fill up to 4 items: pinned first, then unpinned as needed.
    const data = [...pinned, ...unpinned.slice(0, Math.max(0, 4 - pinned.length))];

    // Nullify empty project objects — occurs when the recentActivity references an
    // orphaned project ID; the lookup finds nothing, but the aggregation pipeline
    // still produces {} instead of null.
    data.forEach(item => {
      if (item.project && typeof item.project === 'object' && !Array.isArray(item.project) && !item.project._id) {
        item.project = null;
      }
    });

    Utils.recordAction('Get', 'RecentActivity', 'public');
    return Actions.sendResponse(res, 200, data);

  } catch (e) {
    defaultLog.error(`Error: ${e.message}`);
    return Actions.sendResponse(res, 400, e);
  }
};

exports.protectedDelete = async function (args, res) {
  defaultLog.info('Deleting a RecentActivity(s)');
  defaultLog.info('args.swagger.params:', args.swagger.operation['x-security-scopes']);

  var RecentActivity = mongoose.model('RecentActivity');
  var query = {};
  // Build match query if on recentActivityId route
  if (args.swagger.params.recentActivityId) {
    query = Utils.buildQuery('_id', args.swagger.params.recentActivityId.value, { _schemaName: 'RecentActivity' });
  }

  if (!query._id) {
    // Don't allow unilateral delete.
    return Actions.sendResponse(res, 400, 'Can\'t delete entire collection.');
  }

  // Archive, never delete: a published Update keeps its public URL answerable ("no longer available").
  try {
    const rec = await RecentActivity.findOneAndUpdate(query, {
      $set: {
        status: 'archived',
        active: false,
        dateUpdated: new Date(),
        _updatedBy: args.swagger.params.auth_payload.preferred_username
      },
      $pull: { read: 'public' }
    }, { upsert: false, returnDocument: 'after' });
    if (!rec) {
      return Actions.sendResponse(res, 404, { message: 'RecentActivity not found' });
    }
    demiPush.recentActivity(rec);
    await updateImages.release(updateRules.imageDocumentIds(rec), rec._id, args.swagger.params.auth_payload.preferred_username);
    Utils.recordAction('Archive', 'RecentActivity', args.swagger.params.auth_payload.preferred_username, rec._id);
    defaultLog.info('Archived RecentActivity object:', rec._id);
    return Actions.sendResponse(res, 200, rec);
  } catch (err) {
    defaultLog.error(`Error archiving RecentActivity: ${err.message}`);
    return Actions.sendResponse(res, 400, err);
  }
};

//  Create a new RecentActivity
exports.protectedPost = async function (args, res) {
  var obj = args.swagger.params.recentActivity.value;
  defaultLog.info('Incoming new object:', obj);

  var RecentActivity = mongoose.model('RecentActivity');
  delete obj._id;
  // Set once by the send, never by a client.
  delete obj.notifiedAt;
  // Security tags come from status, not the client.
  delete obj.read;

  updateRules.applyStatus(obj, obj);

  try {
    const errors = await updateRules.check(obj);
    if (errors.length) {
      defaultLog.warn('Rejected new RecentActivity:', errors);
      return Actions.sendResponse(res, 400, { message: errors.join('; '), errors });
    }
  } catch (e) {
    defaultLog.error(`Error checking new RecentActivity: ${e.message}`);
    return Actions.sendResponse(res, 400, e);
  }

  const username = args.swagger.params.auth_payload.preferred_username;
  let publishedImages = [];
  if (obj.status === 'published') {
    try {
      publishedImages = await updateImages.publishFor(obj, username);
    } catch {
      return Actions.sendResponse(res, 500, { message: IMAGE_PUBLISH_FAILED });
    }
  }

  var recentActivity = new RecentActivity(obj);

  recentActivity.pinned = false;

  recentActivity.dateAdded = new Date();
  recentActivity._addedBy = args.swagger.params.auth_payload.preferred_username;

  if (recentActivity.type !== updateRules.PN_PCP_TYPE) {
    recentActivity.notificationName = null;
  }

  try {
    var rec = await recentActivity.save();
    Utils.recordAction('Post', 'RecentActivity', args.swagger.params.auth_payload.preferred_username, rec._id);
    demiPush.recentActivity(rec);
    if (rec.status === 'published') {
      await updateImages.republish(rec, username);
    }
    defaultLog.info('Saved new RecentActivity object:', rec);
    return Actions.sendResponse(res, 200, rec);
  } catch (e) {
    defaultLog.error(`Error: ${e.message}`);
    await updateImages.revert(publishedImages, username);
    return Actions.sendResponse(res, 400, e);
  }
};

// Update an existing RecentActivity
exports.protectedPut = async function (args, res) {
  var objId = args.swagger.params.recentActivityId.value;
  defaultLog.info('ObjectID:', args.swagger.params.recentActivityId.value);

  var obj = args.swagger.params.RecentActivityObject.value;
  // Strip security tags - these will not be updated on this route.
  defaultLog.info('Incoming updated object:', obj);
  // Normalize active — defend against frontend boolean coercion bugs (false → null)
  obj.active = obj.active === true;
  delete obj.notifiedAt;
  delete obj.read;
  // TODO sanitize/update audits.
  obj._updatedBy = args.swagger.params.auth_payload.preferred_username;

  if (obj.type !== updateRules.PN_PCP_TYPE) {
    obj.notificationName = null;
  }

  var RecentActivity = require('mongoose').model('RecentActivity');
  let publishedImages = [];
  try {
    if ( obj.project && Object.keys(obj.project).length === 0 && obj.project.constructor === Object){
      obj.project = null;
    }

    const existing = await RecentActivity.findOne({ _id: objId, _schemaName: 'RecentActivity' }).lean();
    if (!existing) {
      return Actions.sendResponse(res, 404, { message: 'RecentActivity not found' });
    }
    // A client that only sends `active` must not carry a stale status over the new value; an
    // archived Update stays archived until a status says otherwise.
    const deriveStatus = obj.status === undefined && existing.status !== 'archived';
    // The admin sends null to mean "stamp it when it goes live"; the stored date must not be lost to it.
    if (obj.publishDate === null || obj.publishDate === '') {
      delete obj.publishDate;
    }
    const merged = { ...existing, ...(deriveStatus ? { status: null } : {}), ...obj };
    updateRules.applyStatus(obj, merged, { wasLive: updateRules.isLive(existing) });
    const updated = { ...merged, ...obj };
    const errors = await updateRules.check(updated);
    if (errors.length) {
      defaultLog.warn(`Rejected RecentActivity ${objId} update:`, errors);
      return Actions.sendResponse(res, 400, { message: errors.join('; '), errors });
    }
    const publishing = updated.status === 'published';
    if (publishing) {
      try {
        publishedImages = await updateImages.publishFor(updated, obj._updatedBy);
      } catch {
        return Actions.sendResponse(res, 500, { message: IMAGE_PUBLISH_FAILED });
      }
    }

    // Conditional on the version the client loaded (else the row read above), so a concurrent edit
    // is refused rather than overwritten.
    const loaded = obj.dateUpdated ? new Date(obj.dateUpdated) : (existing.dateUpdated || null);
    obj.dateUpdated = new Date();
    const rec = await RecentActivity.findOneAndUpdate(
      { _id: objId, _schemaName: 'RecentActivity', dateUpdated: loaded },
      obj,
      { upsert: false, returnDocument: 'after' }
    );
    if (!rec) {
      defaultLog.warn(`RecentActivity ${objId} changed since it was read; update refused`);
      await updateImages.revert(publishedImages, obj._updatedBy);
      return Actions.sendResponse(res, 409, { message: 'RecentActivity was changed by someone else; reload and try again' });
    }
    Utils.recordAction('Put', 'RecentActivity', args.swagger.params.auth_payload.preferred_username, rec._id);
    demiPush.recentActivity(rec);
    // Live: only images it dropped may go private. Not live: none of its images need to stay public.
    const shownBefore = updateRules.imageDocumentIds(existing);
    const shownAfter = updateRules.imageDocumentIds(updated);
    const released = publishing
      ? shownBefore.filter(id => !shownAfter.includes(id))
      : [...new Set([...shownBefore, ...shownAfter])];
    await updateImages.release(released, rec._id, obj._updatedBy);
    if (publishing) {
      await updateImages.republish(rec, obj._updatedBy);
    }
    defaultLog.info('Updated RecentActivity object:', rec._id);
    return Actions.sendResponse(res, 200, rec);
  } catch (e) {
    defaultLog.error(`Error: ${e.message}`);
    await updateImages.revert(publishedImages, obj._updatedBy);
    return Actions.sendResponse(res, 400, e);
  }
};
