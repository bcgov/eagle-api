/**
 * Clock-stamped date defaults must read the clock per document, not once at module load.
 */

const { expect } = require('chai');
const sinon = require('sinon');

// Project is the ref target Document validates against; registered so the model loads cleanly.
require('../../api/helpers/models/project');

// [model file, date paths whose default is "now"]
const CLOCK_DEFAULTS = [
  ['organization', ['dateAdded', 'dateUpdated']],
  ['recentActivity', ['dateAdded', 'dateUpdated']],
  ['comment', ['dateAdded', 'datePosted', 'dateUpdated']],
  ['document', ['_createdDate', '_updatedDate', 'dateUploaded', 'datePosted']],
  ['inspection', ['_createdDate', '_updatedDate', 'startDate', 'endDate']],
  ['inspectionElement', ['_createdDate', '_updatedDate', 'timestamp']],
  ['inspectionItem', ['_createdDate', '_updatedDate', 'timestamp']],
  ['audit', ['timestamp']]
];

const T0 = Date.parse('2026-10-07T12:00:00.000Z');

describe('Model date defaults', () => {
  let clock;

  beforeEach(() => {
    clock = sinon.useFakeTimers({ now: T0, toFake: ['Date'] });
  });

  afterEach(() => {
    clock.restore();
  });

  CLOCK_DEFAULTS.forEach(([file, paths]) => {
    const Model = require(`../../api/helpers/models/${file}`);

    paths.forEach(path => {
      it(`${Model.modelName}.${path} takes the time each document is built`, () => {
        const first = new Model();
        clock.tick(5000);
        const second = new Model();

        expect(first[path].getTime()).to.equal(T0);
        expect(second[path].getTime()).to.equal(T0 + 5000);
      });
    });
  });
});
