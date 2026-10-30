const { expect } = require('chai');
const constants = require('../../api/helpers/constants');

describe('Legislation registry', () => {
  const fs = require('fs');
  const path = require('path');
  const YAML = require('js-yaml');
  const mongoose = require('mongoose');
  require('../../api/helpers/models/project');

  const {
    LEGISLATIONS, LEGISLATION_KEYS, DEFAULT_LEGISLATION_YEAR, LOCKED_KEYS,
    legislationKey, legislationYearOf, legislationSwitch, defaultLegislationYear
  } = constants;
  const YEARS = Object.keys(LEGISLATIONS).map(Number);

  // eagle-public matches projects to its own Act registry on these strings.
  it('holds exactly these labels', () => {
    const labels = Object.fromEntries(YEARS.map(year => [year, LEGISLATIONS[year].label]));
    expect(labels).to.deep.equal({
      1996: '1996 Environmental Assessment Act',
      2002: '2002 Environmental Assessment Act',
      2018: '2018 Environmental Assessment Act',
      2025: 'Building Canada Act'
    });
  });

  it('is frozen, entries included', () => {
    expect(Object.isFrozen(LEGISLATIONS)).to.be.true;
    YEARS.forEach(year => expect(Object.isFrozen(LEGISLATIONS[year]), String(year)).to.be.true);
    expect(Object.isFrozen(LEGISLATION_KEYS)).to.be.true;
    expect(Object.isFrozen(LOCKED_KEYS)).to.be.true;
  });

  it('has exactly one default entry, 2002', () => {
    expect(YEARS.filter(year => LEGISLATIONS[year].isDefault)).to.deep.equal([2002]);
    expect(DEFAULT_LEGISLATION_YEAR).to.equal(2002);
  });

  it('refuses a registry without exactly one default entry', () => {
    expect(defaultLegislationYear({ 2002: {}, 2018: { isDefault: true } })).to.equal(2018);
    expect(() => defaultLegislationYear({ 2002: {}, 2018: {} })).to.throw('found 0');
    expect(() => defaultLegislationYear({ 2002: { isDefault: true }, 2018: { isDefault: true } })).to.throw('found 2');
  });

  it('locks only the Building Canada Act', () => {
    expect(YEARS.filter(year => LEGISLATIONS[year].locked)).to.deep.equal([2025]);
    expect(LOCKED_KEYS).to.deep.equal(['legislation_2025']);
  });

  it('derives one block key per registry year, in year order', () => {
    expect(LEGISLATION_KEYS).to.deep.equal(['legislation_1996', 'legislation_2002', 'legislation_2018', 'legislation_2025']);
  });

  describe('legislationKey', () => {
    [[2018, 'legislation_2018'], ['2025', 'legislation_2025'], [1996, 'legislation_1996']].forEach(([year, key]) => {
      it(`maps ${JSON.stringify(year)} to ${key}`, () => {
        expect(legislationKey(year)).to.equal(key);
      });
    });

    [2019, '02018', '2018 ', NaN, null, undefined, '', 'toString', '__proto__'].forEach(year => {
      it(`answers null for ${String(JSON.stringify(year))}`, () => {
        expect(legislationKey(year)).to.equal(null);
      });
    });
  });

  describe('legislationYearOf', () => {
    LEGISLATION_KEYS.forEach(key => {
      it(`round-trips ${key}`, () => {
        const year = legislationYearOf(key);
        expect(year).to.be.a('number');
        expect(legislationKey(year)).to.equal(key);
      });
    });

    ['legislation_2019', 'legislation_02018', 'legislation_2018x', 'xlegislation_2018', 'legislation_', '2018', null, undefined, 2018].forEach(key => {
      it(`answers null for ${String(JSON.stringify(key))}`, () => {
        expect(legislationYearOf(key)).to.equal(null);
      });
    });
  });

  it('legislationSwitch falls back to the default year block', () => {
    expect(legislationSwitch().$switch.default).to.equal('$legislation_' + DEFAULT_LEGISLATION_YEAR);
    expect(legislationSwitch('project.').$switch.branches.map(b => b.then))
      .to.deep.equal(LEGISLATION_KEYS.map(key => '$project.' + key));
  });

  describe('guards: every registry Act reaches the code that needs it', () => {
    LEGISLATION_KEYS.forEach(key => {
      it(`${key} has a Project schema block`, () => {
        expect(mongoose.model('Project').schema.path(key + '.name'), key).to.exist;
      });
    });

    const spec = YAML.load(fs.readFileSync(path.join(__dirname, '../../api/swagger/swagger.yaml'), 'utf8'));
    [['POST /project', spec.paths['/project'].post], ['PUT /project/{projId}/publish', spec.paths['/project/{projId}/publish'].put]]
      .forEach(([name, op]) => {
        it(`${name} description names every registry year`, () => {
          YEARS.forEach(year => expect(op.description, `${name} omits ${year}`).to.include(String(year)));
        });
      });
  });
});
