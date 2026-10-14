/**
 * Unit Tests for Comment Controller
 *
 * ponytail: Fully mocked unit tests for Comment controller verifying status updates, post limits, and export streaming.
 */

'use strict';

const { expect } = require('chai');
const sinon      = require('sinon');
const mongoose   = require('mongoose');
const { DateTime } = require('luxon');
const Utils      = require('../../api/helpers/utils');
const Actions    = require('../../api/helpers/actions');
const defaultLog = require('winston').loggers.get('default');

const commentController = require('../../api/controllers/comment');

describe('Comment Controller', () => {
  const VALID_CP_ID   = '507f1f77bcf86cd799439011';
  const VALID_COMM_ID = '507f1f77bcf86cd799439022';
  const VALID_PROJ_ID = '507f1f77bcf86cd799439033';
  const VALID_DOC_ID  = '507f1f77bcf86cd799439044';

  let res;
  let commentModel;
  let cpModel;
  let docModel;
  let projModel;

  function makeArgs(paramOverrides = {}) {
    return {
      swagger: {
        params: {
          commentId:   { value: VALID_COMM_ID },
          period:      { value: VALID_CP_ID },
          periodId:    { value: VALID_CP_ID },
          fields:      { value: ['author', 'comment', 'eaoStatus'] },
          sortBy:      { value: ['-dateAdded'] },
          pageSize:    { value: 10 },
          pageNum:     { value: 0 },
          count:       { value: false },
          populateNextComment: { value: false },
          pending:     { value: false },
          published:   { value: false },
          deferred:    { value: false },
          rejected:    { value: false },
          format:      { value: 'staff' },
          comment: {
            value: {
              author: 'John Doe',
              comment: 'Test comment content',
              period: VALID_CP_ID,
              isAnonymous: false,
              eaoStatus: 'Pending',
              valuedComponents: [],
              documents: []
            }
          },
          status: {
            value: { status: 'Published' }
          },
          auth_payload: {
            realm_access:        { roles: ['sysadmin'] },
            preferred_username:  'testuser'
          },
          ...paramOverrides
        },
        operation: {
          'x-security-scopes': ['sysadmin']
        }
      },
      protocol: 'http',
      host: 'localhost:3000'
    };
  }

  beforeEach(() => {
    const { Writable } = require('stream');
    res = new Writable({
      write(chunk, encoding, callback) {
        callback();
      }
    });
    res.status = sinon.stub().returnsThis();
    res.json = sinon.stub();
    res.send = sinon.stub();
    res.setHeader = sinon.stub();
    res.writeHead = sinon.stub();
    res.flushHeaders = sinon.stub();

    commentModel = {
      findOne: sinon.stub(),
      // the DEMI mirror re-reads the comment after an update
      findById: sinon.stub().resolves(null),
      updateOne: sinon.stub(),
      aggregate: sinon.stub(),
      save: sinon.stub()
    };

    cpModel = {
      findOneAndUpdate: sinon.stub(),
      findOne: sinon.stub()
    };

    docModel = {
      findOne: sinon.stub()
    };

    projModel = {
      findOne: sinon.stub()
    };

    sinon.stub(mongoose, 'model').callsFake(name => {
      if (name === 'Comment') return commentModel;
      if (name === 'CommentPeriod') return cpModel;
      if (name === 'Document') return docModel;
      if (name === 'Project') return projModel;
      return {};
    });

    sinon.stub(Utils, 'runDataQuery');
    sinon.stub(Utils, 'recordAction').resolves();
    sinon.stub(Utils, 'buildQuery').callsFake((prop, val, q) => {
      q[prop] = val;
      return q;
    });
    sinon.stub(Utils, 'getSkipLimitParameters').returns({ skip: 0, limit: 10 });
    sinon.stub(Utils, 'getBasePath').returns('http://localhost:3000');

    sinon.stub(Actions, 'sendResponse').callsFake((r, code, data) => {
      r.status(code).json(data);
      return data;
    });

    sinon.stub(defaultLog, 'info');
    sinon.stub(defaultLog, 'error');
  });

  afterEach(() => sinon.restore());

  describe('publicHead', () => {
    it('returns public count headers successfully', async () => {
      const args = makeArgs();
      Utils.runDataQuery.resolves([{ total_items: 12 }]);

      await commentController.publicHead(args, res);
      expect(res.setHeader.calledWith('x-total-count', 12)).to.be.true;
    });

    it('never reads the staff review fields for a public caller', async () => {
      const args = makeArgs({ fields: { value: ['comment', 'eaoNotes', 'eaoStatus', 'proponentNotes', 'rejectedNotes', 'rejectedReason'] } });
      Utils.runDataQuery.resolves([{ total_items: 1 }]);

      await commentController.publicHead(args, res);

      expect(Utils.runDataQuery.firstCall.args[3]).to.deep.equal(['comment']);
    });
  });

  describe('publicGet', () => {
    const STORED = [
      { _id: VALID_COMM_ID, read: ['public'], author: 'Jane', comment: 'Hi', isAnonymous: true, eaoNotes: 'staff only' },
      { _id: VALID_CP_ID, read: ['public'], author: 'Sam', comment: 'Yo', isAnonymous: false, eaoNotes: 'staff only' }
    ];
    // Stored before isAnonymous existed; the model default makes it anonymous.
    const OLD_ROW = { _id: VALID_DOC_ID, read: ['public'], author: 'Kim', comment: 'Old' };
    // Answers like runDataQuery with count: a facet, holding only _id, read and the fields asked for.
    const answerFrom = rows => Utils.runDataQuery.callsFake(async (model, roles, query, fields) => [{
      total_items: rows.length,
      results: rows.map(row => Object.fromEntries(Object.entries(row).filter(([k]) => ['_id', 'read', ...fields].includes(k))))
    }]);
    const fieldsAsked = () => Utils.runDataQuery.firstCall.args[3];
    const listArgs = (overrides = {}) => {
      const args = makeArgs(overrides);
      delete args.swagger.params.commentId;
      return args;
    };

    it('lists a period as the count facet when no count is asked, without anonymous authors', async () => {
      answerFrom(STORED);

      await commentController.publicGet(listArgs({ fields: { value: ['author', 'comment'] } }), res);

      expect(res.status.firstCall.args[0]).to.equal(200);
      expect(res.json.firstCall.args[0]).to.deep.equal([{ total_items: 2, results: [
        { _id: VALID_COMM_ID, read: ['public'], comment: 'Hi' },
        { _id: VALID_CP_ID, read: ['public'], author: 'Sam', comment: 'Yo' }
      ] }]);
    });

    it('lists a period with its total count when asked', async () => {
      answerFrom(STORED);

      await commentController.publicGet(listArgs({ count: { value: true }, fields: { value: ['comment', 'isAnonymous'] } }), res);

      expect(res.setHeader.calledWith('x-total-count', 2)).to.be.true;
      expect(res.json.firstCall.args[0]).to.deep.equal([
        { _id: VALID_COMM_ID, read: ['public'], comment: 'Hi', isAnonymous: true },
        { _id: VALID_CP_ID, read: ['public'], comment: 'Yo', isAnonymous: false }
      ]);
    });

    it('hides anonymous authors in a counted list, and drops isAnonymous when not asked for', async () => {
      answerFrom([...STORED, OLD_ROW]);

      await commentController.publicGet(listArgs({ count: { value: true }, fields: { value: ['author', 'comment'] } }), res);

      expect(res.json.firstCall.args[0]).to.deep.equal([
        { _id: VALID_COMM_ID, read: ['public'], comment: 'Hi' },
        { _id: VALID_CP_ID, read: ['public'], author: 'Sam', comment: 'Yo' },
        { _id: VALID_DOC_ID, read: ['public'], comment: 'Old' }
      ]);
    });

    it('never reads the staff review fields for a public caller', async () => {
      answerFrom(STORED);

      await commentController.publicGet(listArgs({ fields: { value: ['comment', 'eaoNotes', 'eaoStatus', 'proponentNotes', 'rejectedNotes', 'rejectedReason'] } }), res);

      expect(fieldsAsked()).to.deep.equal(['comment']);
    });

    describe('by id, where the route declares no count parameter', () => {
      const byIdArgs = fields => ({
        swagger: { params: { commentId: { value: VALID_COMM_ID }, fields: { value: fields } } }
      });

      it('answers an array of the one comment, reading isAnonymous to hide the author, then dropping it', async () => {
        answerFrom([STORED[0]]);

        await commentController.publicGet(byIdArgs(['author', 'comment']), res);

        expect(fieldsAsked()).to.include.members(['author', 'comment', 'isAnonymous']);
        expect(res.status.firstCall.args[0]).to.equal(200);
        expect(res.json.firstCall.args[0]).to.deep.equal([{ _id: VALID_COMM_ID, read: ['public'], comment: 'Hi' }]);
        expect(Utils.recordAction.calledWith('Get', 'Comment', 'public', VALID_COMM_ID)).to.be.true;
      });

      it('keeps the author of a named comment, and isAnonymous when asked for', async () => {
        answerFrom([STORED[1]]);

        await commentController.publicGet(byIdArgs(['author', 'isAnonymous']), res);

        expect(res.json.firstCall.args[0]).to.deep.equal([{ _id: VALID_CP_ID, read: ['public'], author: 'Sam', isAnonymous: false }]);
      });

      [['an empty facet', [{ results: [], total_items: 0 }]], ['nothing', []]].forEach(([label, answer]) => {
        it(`answers an empty array and records nothing when the query returns ${label}`, async () => {
          Utils.runDataQuery.resolves(answer);

          await commentController.publicGet(byIdArgs(['comment']), res);

          expect(res.status.firstCall.args[0]).to.equal(200);
          expect(res.json.firstCall.args[0]).to.deep.equal([]);
          expect(Utils.recordAction.called).to.be.false;
        });
      });
    });
  });

  describe('protectedGet', () => {
    it('allows filtering by eaoStatus', async () => {
      const args = makeArgs({ pending: { value: true }, published: { value: true } });
      Utils.runDataQuery.resolves([{ _id: VALID_COMM_ID }]);

      await commentController.protectedGet(args, res);
      expect(Utils.runDataQuery.calledOnce).to.be.true;
      const queryObj = Utils.runDataQuery.firstCall.args[2];
      expect(queryObj.$or).to.have.deep.members([{ eaoStatus: 'Pending' }, { eaoStatus: 'Published' }]);
    });
  });

  describe('protectedPost', () => {
    it('creates comment and increments ID via CommentPeriod', async () => {
      const args = makeArgs();
      cpModel.findOneAndUpdate.resolves({ commentIdCount: 5 });

      function MockComment(obj) {
        Object.assign(this, obj);
        this.save = sinon.stub().resolves({ _id: VALID_COMM_ID });
      }
      mongoose.model.restore();
      sinon.stub(mongoose, 'model').callsFake(name => {
        if (name === 'Comment') return MockComment;
        if (name === 'CommentPeriod') return cpModel;
        return {};
      });

      await commentController.protectedPost(args, res);
      expect(cpModel.findOneAndUpdate.calledOnce).to.be.true;
      expect(res.status.calledWith(200)).to.be.true;
    });
  });

  describe('unProtectedPost', () => {
    it('accepts comment before end date', async () => {
      const args = makeArgs();
      // Future date completion
      const futureDate = DateTime.now().plus({ days: 2 }).toJSDate();
      cpModel.findOne.resolves({ dateCompleted: futureDate });
      cpModel.findOneAndUpdate.resolves({ commentIdCount: 15 });

      function MockComment(obj) {
        Object.assign(this, obj);
        this.save = sinon.stub().resolves({ _id: VALID_COMM_ID });
      }
      mongoose.model.restore();
      sinon.stub(mongoose, 'model').callsFake(name => {
        if (name === 'Comment') return MockComment;
        if (name === 'CommentPeriod') return cpModel;
        return {};
      });

      await commentController.unProtectedPost(args, res);
      expect(res.status.calledWith(200)).to.be.true;
    });

    it('rejects comment after end date', async () => {
      const args = makeArgs();
      // Past date completion
      const pastDate = DateTime.now().minus({ days: 2 }).toJSDate();
      cpModel.findOne.resolves({ dateCompleted: pastDate });

      await commentController.unProtectedPost(args, res);
      expect(res.status.calledWith(400)).to.be.true;
    });
  });

  describe('protectedPut', () => {
    it('updates comment values', async () => {
      const args = makeArgs();
      commentModel.updateOne.resolves({ nModified: 1 });

      await commentController.protectedPut(args, res);
      expect(commentModel.updateOne.calledOnce).to.be.true;
      expect(res.status.calledWith(200)).to.be.true;
    });
  });

  describe('protectedStatus', () => {
    it('updates comment status permissions', async () => {
      const args = makeArgs();
      commentModel.updateOne.resolves({ nModified: 1 });

      await commentController.protectedStatus(args, res);
      expect(commentModel.updateOne.calledOnce).to.be.true;
      expect(res.status.calledWith(200)).to.be.true;
    });
  });

  describe('protectedExport', () => {
    it('aggregates data and pipes to res', async () => {
      const args = makeArgs();
      cpModel.findOne.resolves({ instructions: 'Period Instruct', project: VALID_PROJ_ID });
      projModel.findOne.resolves({ name: 'Project Name' });
      commentModel.aggregate.resolves([{
        commentId: 1,
        dateAdded: new Date(),
        isAnonymous: false,
        author: 'Jane Doe',
        read: ['public']
      }]);

      await commentController.protectedExport(args, res);
      expect(commentModel.aggregate.calledOnce).to.be.true;
      expect(res.setHeader.calledWith('Content-disposition', 'attachment; filename=export.csv')).to.be.true;
    });
  });
});
