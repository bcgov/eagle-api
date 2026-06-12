'use strict';

/**
 * job.js — Async Jobs Controller
 *
 * Role-gated API for queuing and monitoring background jobs.
 * Authorization is per job type (see JOB_PERMISSIONS below).
 * Sysadmin may read/cancel any job regardless of owner.
 *
 * Flow:
 *   POST   /api/jobs                 – queue job, return 202 { jobId }
 *   GET    /api/jobs                 – sysadmin: all jobs; others: own jobs only
 *   GET    /api/jobs/:jobId          – owner or sysadmin
 *   GET    /api/jobs/:jobId/download – owner or sysadmin
 *   DELETE /api/jobs/:jobId          – owner or sysadmin
 *
 * Adding a new job type:
 *   1. Define the handler in jobQueue.js (agenda.define)
 *   2. Add an entry to JOB_PERMISSIONS below
 *   3. Add the body/validation logic to createJob
 */

const { ObjectId } = require('mongodb');
const defaultLog = require('winston').loggers.get('default');
const { getAgenda } = require('../helpers/jobQueue');

// ── Permissions ──────────────────────────────────────────────────────────────

/**
 * Maps each job type to the Keycloak roles allowed to CREATE that job.
 * Sysadmin can always READ/CANCEL any job regardless of this map.
 *
 * To add a new type:
 *   'batch-document-download': ['sysadmin', 'public']
 */
const JOB_PERMISSIONS = {
  'project-doc-export': ['sysadmin'],
  // demi-extract is queued via POST /demi/extract (file upload intake),
  // not via the generic POST /api/jobs. Listed here for documentation and
  // so canCreateJob() can gate future direct job creation if needed.
  'demi-extract': ['sysadmin'],
};

function hasRole(authPayload, role) {
  return Array.isArray(authPayload?.realm_access?.roles)
    && authPayload.realm_access.roles.includes(role);
}

function hasSysadmin(authPayload) {
  return hasRole(authPayload, 'sysadmin');
}

function canCreateJob(authPayload, type) {
  const allowedRoles = JOB_PERMISSIONS[type];
  if (!allowedRoles) return false;
  return allowedRoles.some(role => hasRole(authPayload, role));
}

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

  if (a.name === 'demi-extract') {
    result.docId            = a.data?.docId;
    result.projectId        = a.data?.project;
    result.originalFilename = a.data?.originalFilename;
    result.fileSize         = a.data?.fileSize;
    result.filename         = status === 'completed' ? (a.data?.result?.filename || null) : null;
  }

  return result;
}

function userId(authPayload) {
  // Prefer Keycloak sub (stable UUID) over username (may change)
  return authPayload?.sub || authPayload?.preferred_username || 'unknown';
}

// ── Endpoints ────────────────────────────────────────────────────────────────

/**
 * POST /api/jobs
 *
 * Body: { type: 'project-doc-export', projectId: string, includeAll?: boolean }
 * Response 202: { jobId: string }
 */
exports.createJob = async function (args, res) {
  const authPayload = args.swagger.params.auth_payload;
  const body = args.swagger.params.body?.value || {};
  const { type, projectId, includeAll } = body;

  if (!JOB_PERMISSIONS[type]) {
    return res.status(400).json({ message: `Unknown job type: ${type}. Allowed: ${Object.keys(JOB_PERMISSIONS).join(', ')}` });
  }

  if (!canCreateJob(authPayload, type)) {
    return res.status(403).json({ message: `Insufficient permissions to create job type: ${type}` });
  }

  if (!projectId || typeof projectId !== 'string') {
    return res.status(400).json({ message: 'projectId is required.' });
  }

  if (!ObjectId.isValid(projectId)) {
    return res.status(400).json({ message: 'projectId must be a valid MongoDB ObjectId.' });
  }

  const requestedBy = userId(authPayload);

  try {
    const agenda = getAgenda();
    const job = await agenda.now(type, {
      projectId,
      includeAll: !!includeAll,
      requestedBy,
      requestedAt: new Date().toISOString(),
    });

    defaultLog.info(`[job] queued ${type} ${job.attrs._id} for ${requestedBy}`);
    return res.status(202).json({ jobId: job.attrs._id });
  } catch (err) {
    defaultLog.error(`[job] createJob error: ${err.message}`);
    return res.status(500).json({ message: 'Failed to queue job.' });
  }
};

/**
 * GET /api/jobs
 *
 * Returns the 20 most recent jobs for the authenticated user.
 */
exports.listJobs = async function (args, res) {
  const authPayload = args.swagger.params.auth_payload;

  // Sysadmin sees ALL jobs; everyone else sees only their own.
  const isSysadmin = hasSysadmin(authPayload);
  const requestedBy = userId(authPayload);
  const filter = isSysadmin ? {} : { 'data.requestedBy': requestedBy };

  try {
    const agenda = getAgenda();
    const jobs = await agenda.jobs(
      filter,
      { _id: -1 },
      20,
      0
    );

    return res.json(jobs.map(formatJob));
  } catch (err) {
    defaultLog.error(`[job] listJobs error: ${err.message}`);
    return res.status(500).json({ message: 'Failed to list jobs.' });
  }
};

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

    // demi-extract → markdown file on disk
    if (job.attrs.name === 'demi-extract') {
      const resultPath = result.resultPath;
      if (!resultPath) {
        return res.status(500).json({ message: 'Extraction result unavailable.' });
      }

      const fs = require('fs');
      if (!fs.existsSync(resultPath)) {
        return res.status(404).json({ message: 'Result file not found (pod may have restarted and cleared /tmp).' });
      }

      const filename = result.filename || `${jobId}.md`;
      res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      // Stream from disk — avoids loading potentially large markdown into RAM
      return fs.createReadStream(resultPath).pipe(res);
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

/**
 * DELETE /api/jobs/:jobId
 *
 * Cancels a queued job or removes a finished/failed job record.
 */
exports.cancelJob = async function (args, res) {
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

    await agenda.cancel({ _id: jobObjId });
    return res.status(204).send();
  } catch (err) {
    defaultLog.error(`[job] cancelJob error: ${err.message}`);
    return res.status(500).json({ message: 'Failed to cancel job.' });
  }
};
