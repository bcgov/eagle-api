const sinon = require('sinon');

/**
 * Shared fixtures for the specs that drive write controllers against stubbed mongoose models and
 * check what they push to DEMI and how they answer.
 */

const OID = '5f4c7d1e2b3a4c5d6e7f8091';
const p = value => ({ value });
const auth = { preferred_username: 'tester', realm_access: { roles: ['sysadmin'] } };
const upfile = { size: 10, mimetype: 'application/pdf', buffer: Buffer.from('x'), originalname: 'a.pdf' };

// Body of the 502 when a DEMI push did not land. Written out, not read from Actions, so drift fails.
const NOT_MIRRORED = {
  saved: true,
  mirrored: false,
  message: 'Saved, but the record could not be mirrored to DEMI; retry or run a re-push.'
};

const NULLABLE = ['documentFileName', 'internalOriginalName', 'legislation', 'documentSource', 'displayName',
  'eaoStatus', 'publish', 'milestone', 'type', 'documentAuthor', 'documentAuthorType', 'dateUploaded',
  'datePosted', 'description', 'projectPhase', 'keywords', 'sortOrder'];

const docArgs = () => {
  const params = { docId: p(OID), project: p(OID), _comment: p(OID), upfile: p(upfile), auth_payload: auth };
  NULLABLE.forEach(k => { params[k] = p(null); });
  return { swagger: { params }, body: { documentAuthor: 'A', documentAuthorType: OID } };
};

const projArgs = () => {
  const obj = { legislationYear: 2002, name: 'X', proponent: OID, responsibleEPDId: OID, projectLeadId: OID, intake: {} };
  return { swagger: { params: { projId: p(OID), project: p(obj), ProjObject: p(obj), auth_payload: auth } } };
};

const pinArgs = () => ({
  swagger: { params: { projId: p(OID), pins: p([OID]), pinId: p(OID), auth_payload: auth } }
});

const raObj = () => ({ active: true, headline: 'Decision issued', type: 'News', project: OID });

const raArgs = () => ({
  swagger: {
    operation: { 'x-security-scopes': ['sysadmin'] },
    params: { recentActivityId: p(OID), recentActivity: p(raObj()), RecentActivityObject: p(raObj()), auth_payload: auth }
  }
});

const cpObj = () => ({ project: OID, milestone: OID, isPublished: true, openHouses: [], relatedDocuments: [] });

const cpArgs = () => ({
  swagger: { params: { commentPeriodId: p(OID), period: p(cpObj()), cp: p(cpObj()), auth_payload: auth } }
});

const commentObj = () => ({
  period: OID, documents: [], valuedComponents: [], eaoStatus: 'Published',
  author: 'Jane Public', comment: 'Body text', isAnonymous: false
});

const commentArgs = () => ({
  swagger: {
    params: {
      commentId: p(OID), comment: p(commentObj()), period: p(OID),
      status: p({ status: 'Published' }), auth_payload: auth
    }
  }
});

const orgArgs = () => ({
  swagger: { params: { orgId: p(OID), org: p({ name: 'Org', companyType: 'Proponent' }), auth_payload: auth } }
});

// publish stays false: the controller pushes onto the array it was handed, and the stub model does
// not copy it the way a mongoose schema path would.
const pnArgs = () => ({
  swagger: {
    params: {
      projectNotificationId: p(OID), projectNotification: p({ name: 'N', type: 'T' }),
      publish: p(false), auth_payload: auth
    }
  }
});

const userArgs = () => ({
  swagger: { params: { userId: p(OID), user: p({ firstName: 'Jane', orgName: 'Acme' }), auth_payload: auth } }
});

const groupArgs = () => ({
  swagger: {
    params: {
      projId: p(OID), groupId: p(OID), memberId: p(OID), group: p({ group: 'Advisory' }),
      groupObject: p({ name: 'Renamed' }), members: p([OID]), auth_payload: auth
    }
  }
});

const inspArgs = () => ({
  swagger: { params: { inspId: p(OID), inspection: p({ inspectionId: 'mobile-1', project: OID }), auth_payload: auth } }
});

const itemArgs = file => ({
  swagger: {
    params: {
      upfile: p(file), itemId: p(OID), project: p(OID), elementId: p(OID), type: p('photo'),
      timestamp: p(null), caption: p('c'), text: p('"note"'), geo: p('[1,2]'), auth_payload: auth
    }
  }
});

/**
 * A mongoose model stand-in. `saved()` is read per call, so a spec can swap the write result in its
 * beforeEach and every save and findOneAndUpdate hands that back.
 */
function stubModel(modelName, saved) {
  const M = function (init) { Object.assign(this, init || {}); this.legislationYearList = this.legislationYearList || []; };
  M.modelName = modelName;
  M.prototype.save = () => Promise.resolve(saved());
  // dateCompleted keeps comment.unProtectedPost inside the period; read[] is what publish toggles.
  // project.protectedPublish only switches to a year the project lists and has a named block for.
  const stored = () => new M({
    _id: OID, project: OID, read: [], dateCompleted: new Date(Date.now() + 86400000),
    legislation_2002: { name: 'X', phaseHistory: '' }, currentLegislationYear: 'legislation_2002', legislationYearList: [2002]
  });
  // recentActivity.protectedPut reads the stored row with .lean() before validating the merge
  M.findOne = sinon.stub().callsFake(() => {
    const query = Promise.resolve(stored());
    query.lean = () => Promise.resolve({ ...stored() });
    return query;
  });
  M.findById = sinon.stub().callsFake(() => Promise.resolve(stored()));
  // organization.protectedPut calls .exec() on the query; pins awaits it directly
  M.findOneAndUpdate = sinon.stub().callsFake(() => {
    const query = Promise.resolve(saved());
    query.exec = () => Promise.resolve(saved());
    return query;
  });
  M.findOneAndDelete = sinon.stub().callsFake(() => Promise.resolve(stored()));
  M.updateMany = sinon.stub().resolves({});
  M.countDocuments = sinon.stub().resolves(0);
  M.updateOne = sinon.stub().resolves({});
  M.find = sinon.stub().returns({ lean: () => Promise.resolve([{ _id: OID, active: true }]) });
  M.deleteMany = sinon.stub().resolves({ deletedCount: 1 });
  return M;
}

/** Sets env vars (undefined deletes one) and returns a function that puts the old values back. */
function setEnv(vars) {
  const before = {};
  Object.keys(vars).forEach(name => {
    before[name] = process.env[name];
    if (vars[name] === undefined) { delete process.env[name]; } else { process.env[name] = vars[name]; }
  });
  return () => Object.keys(before).forEach(name => {
    if (before[name] === undefined) { delete process.env[name]; } else { process.env[name] = before[name]; }
  });
}

module.exports = {
  OID, p, auth, upfile, NOT_MIRRORED, stubModel, setEnv,
  docArgs, projArgs, pinArgs, raArgs, cpArgs, commentArgs, orgArgs, pnArgs, userArgs, groupArgs, inspArgs, itemArgs
};
