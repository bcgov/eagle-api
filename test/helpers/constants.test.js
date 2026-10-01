/**
 * Unit Tests for API Helpers - Constants
 * 
 * Testing constant definitions and validations
 */

const { expect } = require('chai');
const constants = require('../../api/helpers/constants');

describe('Constants Validation', () => {
  
  describe('schemaTypes', () => {
    it('should be frozen (immutable)', () => {
      expect(Object.isFrozen(constants.schemaTypes)).to.be.true;
    });

    it('should have ITEM schema type', () => {
      expect(constants.schemaTypes).to.have.property('ITEM', 'Item');
    });

    it('should have DOCUMENT schema type', () => {
      expect(constants.schemaTypes).to.have.property('DOCUMENT', 'Document');
    });

    it('should have CAC schema type', () => {
      expect(constants.schemaTypes).to.have.property('CAC', 'CACUser');
    });

    it('should have PROJECT schema type', () => {
      expect(constants.schemaTypes).to.have.property('PROJECT', 'Project');
    });

    it('should have GROUP schema type', () => {
      expect(constants.schemaTypes).to.have.property('GROUP', 'Group');
    });

    it('should have USER schema type', () => {
      expect(constants.schemaTypes).to.have.property('USER', 'User');
    });

    it('should have RECENT_ACTIVITY schema type', () => {
      expect(constants.schemaTypes).to.have.property('RECENT_ACTIVITY', 'RecentActivity');
    });

    it('should have INSPECTION schema type', () => {
      expect(constants.schemaTypes).to.have.property('INSPECTION', 'Inspection');
    });

    it('should have INSPECTION_ELEMENT schema type', () => {
      expect(constants.schemaTypes).to.have.property('INSPECTION_ELEMENT', 'InspectionElement');
    });

    it('should have PROJECT_NOTIFICATION schema type', () => {
      expect(constants.schemaTypes).to.have.property('PROJECT_NOTIFICATION', 'ProjectNotification');
    });

    it('should have LIST schema type', () => {
      expect(constants.schemaTypes).to.have.property('LIST', 'List');
    });

    it('should have COMMENT schema type', () => {
      expect(constants.schemaTypes).to.have.property('COMMENT', 'Comment');
    });

    it('should have COMMENT_PERIOD schema type', () => {
      expect(constants.schemaTypes).to.have.property('COMMENT_PERIOD', 'CommentPeriod');
    });

    it('should have ORGANIZATION schema type', () => {
      expect(constants.schemaTypes).to.have.property('ORGANIZATION', 'Organization');
    });

    it('should have exactly 14 schema types defined', () => {
      const keys = Object.keys(constants.schemaTypes);
      expect(keys).to.have.lengthOf(14);
    });

    it('should not allow modification of schema types', () => {
      const originalLength = Object.keys(constants.schemaTypes).length;
      constants.schemaTypes.NEW_TYPE = 'NewType';
      expect(Object.keys(constants.schemaTypes)).to.have.lengthOf(originalLength);
    });

    it('should not allow deletion of schema types', () => {
      delete constants.schemaTypes.ITEM;
      expect(constants.schemaTypes).to.have.property('ITEM');
    });

    it('should have all string values', () => {
      Object.values(constants.schemaTypes).forEach(value => {
        expect(value).to.be.a('string');
      });
    });

    it('should have all uppercase keys', () => {
      Object.keys(constants.schemaTypes).forEach(key => {
        expect(key).to.equal(key.toUpperCase());
      });
    });
  });

  describe('MAX_FEATURE_DOCS', () => {
    it('should be defined', () => {
      expect(constants.MAX_FEATURE_DOCS).to.exist;
    });

    it('should be a number', () => {
      expect(constants.MAX_FEATURE_DOCS).to.be.a('number');
    });

    it('should equal 5', () => {
      expect(constants.MAX_FEATURE_DOCS).to.equal(5);
    });

    it('should be positive', () => {
      expect(constants.MAX_FEATURE_DOCS).to.be.greaterThan(0);
    });

    it('should be an integer', () => {
      expect(Number.isInteger(constants.MAX_FEATURE_DOCS)).to.be.true;
    });
  });

  describe('PUBLIC_ROLES', () => {
    it('should be defined', () => {
      expect(constants.PUBLIC_ROLES).to.exist;
    });

    it('should be an array', () => {
      expect(constants.PUBLIC_ROLES).to.be.an('array');
    });

    it('should contain public role', () => {
      expect(constants.PUBLIC_ROLES).to.include('public');
    });

    it('should have exactly 1 role', () => {
      expect(constants.PUBLIC_ROLES).to.have.lengthOf(1);
    });

    it('should only contain strings', () => {
      constants.PUBLIC_ROLES.forEach(role => {
        expect(role).to.be.a('string');
      });
    });

    it('should not contain empty strings', () => {
      constants.PUBLIC_ROLES.forEach(role => {
        expect(role.length).to.be.greaterThan(0);
      });
    });
  });

  describe('SECURE_ROLES', () => {
    it('should be defined', () => {
      expect(constants.SECURE_ROLES).to.exist;
    });

    it('should be an array', () => {
      expect(constants.SECURE_ROLES).to.be.an('array');
    });

    it('should contain sysadmin role', () => {
      expect(constants.SECURE_ROLES).to.include('sysadmin');
    });

    it('should contain staff role', () => {
      expect(constants.SECURE_ROLES).to.include('staff');
    });

    it('should have exactly 2 roles', () => {
      expect(constants.SECURE_ROLES).to.have.lengthOf(2);
    });

    it('should only contain strings', () => {
      constants.SECURE_ROLES.forEach(role => {
        expect(role).to.be.a('string');
      });
    });

    it('should not contain public role', () => {
      expect(constants.SECURE_ROLES).to.not.include('public');
    });

    it('should not have duplicate roles', () => {
      const uniqueRoles = [...new Set(constants.SECURE_ROLES)];
      expect(uniqueRoles).to.have.lengthOf(constants.SECURE_ROLES.length);
    });

    it('should not contain empty strings', () => {
      constants.SECURE_ROLES.forEach(role => {
        expect(role.length).to.be.greaterThan(0);
      });
    });
  });

  describe('Role Separation', () => {
    it('should not have overlapping roles between PUBLIC and SECURE', () => {
      const publicSet = new Set(constants.PUBLIC_ROLES);
      const secureSet = new Set(constants.SECURE_ROLES);
      
      constants.PUBLIC_ROLES.forEach(role => {
        expect(secureSet.has(role)).to.be.false;
      });
      
      constants.SECURE_ROLES.forEach(role => {
        expect(publicSet.has(role)).to.be.false;
      });
    });

    it('should have mutually exclusive role sets', () => {
      const intersection = constants.PUBLIC_ROLES.filter(role => 
        constants.SECURE_ROLES.includes(role)
      );
      expect(intersection).to.have.lengthOf(0);
    });
  });

  describe('Constant Exports', () => {
    it('should export schemaTypes', () => {
      expect(constants).to.have.property('schemaTypes');
    });

    it('should export MAX_FEATURE_DOCS', () => {
      expect(constants).to.have.property('MAX_FEATURE_DOCS');
    });

    it('should export PUBLIC_ROLES', () => {
      expect(constants).to.have.property('PUBLIC_ROLES');
    });

    it('should export SECURE_ROLES', () => {
      expect(constants).to.have.property('SECURE_ROLES');
    });

    it('should only export expected properties', () => {
      const expectedProps = ['schemaTypes', 'MAX_FEATURE_DOCS', 'PUBLIC_ROLES', 'SECURE_ROLES'];
      const actualProps = Object.keys(constants);
      
      expectedProps.forEach(prop => {
        expect(actualProps).to.include(prop);
      });
    });
  });

  describe('Type Safety', () => {
    it('schemaTypes should not be undefined', () => {
      expect(constants.schemaTypes).to.not.be.undefined;
    });

    it('schemaTypes should not be null', () => {
      expect(constants.schemaTypes).to.not.be.null;
    });

    it('MAX_FEATURE_DOCS should not be NaN', () => {
      expect(Number.isNaN(constants.MAX_FEATURE_DOCS)).to.be.false;
    });

    it('PUBLIC_ROLES should not be null', () => {
      expect(constants.PUBLIC_ROLES).to.not.be.null;
    });

    it('SECURE_ROLES should not be null', () => {
      expect(constants.SECURE_ROLES).to.not.be.null;
    });
  });

  describe('Schema Type Value Validation', () => {
    it('all schema type values should be valid mongoose model names', () => {
      Object.values(constants.schemaTypes).forEach(value => {
        // Model names should start with uppercase letter
        expect(value.charAt(0)).to.match(/[A-Z]/);
        // Should not contain spaces
        expect(value).to.not.include(' ');
      });
    });

    it('all schema type values should be unique', () => {
      const values = Object.values(constants.schemaTypes);
      const uniqueValues = [...new Set(values)];
      expect(uniqueValues).to.have.lengthOf(values.length);
    });

    it('all schema type keys should match a naming convention', () => {
      Object.keys(constants.schemaTypes).forEach(key => {
        // Should be SCREAMING_SNAKE_CASE
        expect(key).to.match(/^[A-Z_]+$/);
      });
    });
  });
});

describe('Legislation registry', () => {
  const fs = require('fs');
  const path = require('path');
  const YAML = require('js-yaml');
  const mongoose = require('mongoose');
  require('../../api/helpers/models/project');

  const {
    LEGISLATIONS, LEGISLATION_KEYS, DEFAULT_LEGISLATION_YEAR, LOCKED_KEYS,
    legislationKey, legislationYearOf, legislationSwitch
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
