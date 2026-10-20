'use strict';

/**
 * job.js — Async Jobs Controller
 *
 * Read-only API over background jobs already in the Agenda queue.
 * Sysadmin may read any job regardless of owner; others only their own.
 *
 * Flow:
 *   GET    /api/jobs/:jobId          – owner or sysadmin
 *   GET    /api/jobs/:jobId/download – owner or sysadmin
 */

const { ObjectId } = require('mongodb');
const defaultLog = require('winston').loggers.get('default');
const { getAgenda } = require('../helpers/jobQueue');

function hasRole(authPayload, role) {
  return Array.isArray(authPayload?.realm_access?.roles)
    && authPayload.realm_access.roles.includes(role);
}

function hasSysadmin(authPayload) {
  return hasRole(authPayload, 'sysadmin');
}


exports.protectedOptions = function (args, res) {
  res.status(200).send();
};

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Maps an Agenda job document to a safe API-response shape.
 * @param {object} job - Agenda Job instance
 */
function formatJob(job) {
  const a = job.attrs;

  let status = 'queued';
  if (a.failedAt)            status = 'failed';
  else if (a.lastFinishedAt) status = 'completed';
  else if (a.lockedAt)       status = 'running';

  const result = {
    jobId:       a._id,
    type:        a.name,
    status,
    requestedBy: a.data?.requestedBy,
    createdAt:   a.data?.requestedAt,
    startedAt:   a.lockedAt        || null,
    completedAt: a.lastFinishedAt  || null,
    // progress is updated in-flight by the job handler; null until running
    progress:    a.data?.progress  || null,
    hasResult:   status === 'completed' && !!a.data?.result,
    error:       a.failReason      || null,
  };

  // Type-specific fields
  if (a.name === 'project-doc-export') {
    result.projectId  = a.data?.projectId;
    result.includeAll = a.data?.includeAll;
    result.filename   = status === 'completed' ? (a.data?.result?.filename || null) : null;
  }

  return result;
}

function userId(authPayload) {
  // Prefer Keycloak sub (stable UUID) over username (may change)
  return authPayload?.sub || authPayload?.preferred_username || 'unknown';
}

// ── Endpoints ────────────────────────────────────────────────────────────────

/**
 * GET /api/jobs/:jobId
 *
 * Returns current status of a single job.
 */
exports.getJobStatus = async function (args, res) {
  const authPayload = args.swagger.params.auth_payload;
  const jobId = args.swagger.params.jobId.value;
  const requestedBy = userId(authPayload);

  let jobObjId;
  try {
    jobObjId = new ObjectId(jobId);
  } catch {
    return res.status(400).json({ message: 'Invalid jobId.' });
  }

  try {
    const agenda = getAgenda();
    const jobs = await agenda.jobs({ _id: jobObjId });

    // Owner always sees their job; sysadmin sees any job.
    if (!jobs.length || (jobs[0].attrs.data?.requestedBy !== requestedBy && !hasSysadmin(authPayload))) {
      return res.status(404).json({ message: 'Job not found.' });
    }

    return res.json(formatJob(jobs[0]));
  } catch (err) {
    defaultLog.error(`[job] getJobStatus error: ${err.message}`);
    return res.status(500).json({ message: 'Failed to get job status.' });
  }
};

/**
 * GET /api/jobs/:jobId/download
 *
 * Streams the CSV result for a completed job.
 */
exports.downloadJobResult = async function (args, res) {
  const authPayload = args.swagger.params.auth_payload;
  const jobId = args.swagger.params.jobId.value;
  const requestedBy = userId(authPayload);

  let jobObjId;
  try {
    jobObjId = new ObjectId(jobId);
  } catch {
    return res.status(400).json({ message: 'Invalid jobId.' });
  }

  try {
    const agenda = getAgenda();
    const jobs = await agenda.jobs({ _id: jobObjId });

    // Owner always sees their job; sysadmin sees any job.
    if (!jobs.length || (jobs[0].attrs.data?.requestedBy !== requestedBy && !hasSysadmin(authPayload))) {
      return res.status(404).json({ message: 'Job not found.' });
    }

    const job = jobs[0];
    const a = job.attrs;

    if (a.failedAt) {
      return res.status(422).json({ message: 'Job failed.', error: a.failReason || null });
    }

    if (!a.lastFinishedAt) {
      const status = a.lockedAt ? 'running' : 'queued';
      return res.status(202).json({ message: 'Job not yet complete.', status });
    }

    const result = a.data?.result;
    if (!result) {
      return res.status(500).json({ message: 'Job result unavailable.' });
    }



    // project-doc-export → CSV
    if (!result.csv) {
      return res.status(500).json({ message: 'Export result unavailable.' });
    }
    const filename = result.filename || `job-${jobId}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.send(result.csv);
  } catch (err) {
    defaultLog.error(`[job] downloadJobResult error: ${err.message}`);
    return res.status(500).json({ message: 'Failed to retrieve job result.' });
  }
};

