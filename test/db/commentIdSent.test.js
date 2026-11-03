// A comment create that carries commentId keeps it and only raises its period's counter.
// Run with: yarn db:up && yarn test:db

'use strict';

const { expect } = require('chai');
const sinon = require('sinon');
const mongoose = require('mongoose');

require('../../app_helper');

const Utils = require('../../api/helpers/utils');
const demiPush = require('../../api/helpers/demiPush');
const commentController = require('../../api/controllers/comment');
const { TEST_URI, id, capture } = require('./parentReadFixtures');

const PERIOD = id('58990017d334ee001d60fe01');

const send = async commentId => {
  const comment = { period: String(PERIOD), author: 'Jane', comment: 'Body', eaoStatus: 'Pending', commentId };
  const { res, body } = capture();
  await commentController.protectedPost({
    swagger: { params: { comment: { value: comment }, auth_payload: { preferred_username: 'tester' } } }
  }, res);
  return body;
};

const post = async commentId => {
  const body = await send(commentId);
  expect(body.code).to.equal(200);
  return body.data.commentId;
};

describe('Comment create with a sent commentId (MongoDB)', () => {
  const epic = () => mongoose.connection.collection('epic');
  const cleanUp = () => epic().deleteMany({ $or: [{ _id: PERIOD }, { period: PERIOD }] });
  const counter = async () => (await epic().findOne({ _id: PERIOD })).commentIdCount;

  before(() => mongoose.connect(TEST_URI));

  beforeEach(async () => {
    await cleanUp();
    await epic().insertOne({ _id: PERIOD, _schemaName: 'CommentPeriod', commentIdCount: 5 });
    sinon.stub(Utils, 'recordAction').resolves();
    sinon.stub(demiPush, 'comment').resolves(true);
  });

  afterEach(() => sinon.restore());

  after(async () => {
    await cleanUp();
    await mongoose.disconnect();
  });

  it('keeps a commentId above the counter and numbers the next unnumbered comment after it', async () => {
    expect(await post(42)).to.equal(42);
    expect(await counter()).to.equal(42);
    expect(await post(undefined)).to.equal(43);
  });

  it('keeps an unused commentId below the counter without lowering the counter', async () => {
    expect(await post(3)).to.equal(3);
    expect(await counter()).to.equal(5);
    expect(await post(null)).to.equal(6);
  });

  it('answers 409 to a commentId already used in the period and saves no second comment', async () => {
    await post(3);

    expect((await send(3)).code).to.equal(409);
    expect(await epic().countDocuments({ _schemaName: 'Comment', period: PERIOD, commentId: 3 })).to.equal(1);
  });
});
