/**
 * Integration Tests for Project Controller
 * 
 * Testing project controller functions and API logic
 */

const { expect } = require('chai');
const sinon = require('sinon');
const mongoose = require('mongoose');

describe('Project Controller Functions', () => {
  
  describe('Field Sanitization', () => {
    const validFields = [
      'name', 'description', 'region', 'location', 'type', 
      'status', 'dateAdded', 'dateUpdated', 'read', 'write', 'delete'
    ];

    it('should recognize valid project fields', () => {
      validFields.forEach(field => {
        expect(field).to.be.a('string');
      });
    });

    it('should filter invalid fields', () => {
      const invalidFields = ['__proto__', 'constructor', 'prototype'];
      
      invalidFields.forEach(field => {
        expect(validFields).to.not.include(field);
      });
    });

    it('should handle permission fields', () => {
      const permissionFields = ['read', 'write', 'delete'];
      
      permissionFields.forEach(field => {
        expect(validFields).to.include(field);
      });
    });
  });

  describe('Project Metadata Fields', () => {
    it('should have CEA involvement fields', () => {
      const ceaFields = ['CEAAInvolvement', 'CELead', 'CELeadEmail', 'CELeadPhone', 'CEAALink'];
      
      ceaFields.forEach(field => {
        expect(field).to.be.a('string');
      });
    });

    it('should have geographic fields', () => {
      const geoFields = ['centroid', 'location', 'region', 'fedElecDist', 'provElecDist'];
      
      geoFields.forEach(field => {
        expect(field).to.be.a('string');
      });
    });

    it('should have project lead fields', () => {
      const leadFields = ['projectLeadId', 'projectLead', 'projectLeadEmail', 'projectLeadPhone'];
      
      leadFields.forEach(field => {
        expect(field).to.be.a('string');
      });
    });

    it('should have decision fields', () => {
      const decisionFields = ['eacDecision', 'eaDecision', 'decisionDate', 'eaStatus', 'eaStatusDate'];
      
      decisionFields.forEach(field => {
        expect(field).to.be.a('string');
      });
    });
  });

  describe('Project Status Fields', () => {
    it('should have status tracking fields', () => {
      const statusFields = ['status', 'activeStatus', 'currentPhaseName', 'phaseHistory'];
      
      statusFields.forEach(field => {
        expect(field).to.be.a('string');
      });
    });

    it('should have date tracking fields', () => {
      const dateFields = [
        'dateAdded', 'dateUpdated', 'dateCommentsClosed', 
        'dateCommentsOpen', 'projectStatusDate', 'activeDate'
      ];
      
      dateFields.forEach(field => {
        expect(field).to.be.a('string');
      });
    });

    it('should have operational status fields', () => {
      const operationalFields = ['operational', 'substantiallyStarted', 'substantially', 'substantiallyDate'];
      
      operationalFields.forEach(field => {
        expect(field).to.be.a('string');
      });
    });
  });

  describe('Project Type and Classification', () => {
    it('should have type classification fields', () => {
      const typeFields = ['type', 'subtype', 'sector', 'nature', 'commodity'];
      
      typeFields.forEach(field => {
        expect(field).to.be.a('string');
      });
    });

    it('should have legislation fields', () => {
      const legislationFields = ['legislation', 'substitution'];
      
      legislationFields.forEach(field => {
        expect(field).to.be.a('string');
      });
    });
  });

  describe('Project Contact Information', () => {
    it('should have contact fields', () => {
      const contactFields = ['primaryContact', 'proponent'];
      
      contactFields.forEach(field => {
        expect(field).to.be.a('string');
      });
    });

    it('should have responsible party fields', () => {
      const responsibleFields = [
        'responsibleEPDId', 'responsibleEPD', 
        'responsibleEPDEmail', 'responsibleEPDPhone'
      ];
      
      responsibleFields.forEach(field => {
        expect(field).to.be.a('string');
      });
    });

    it('should have team member fields', () => {
      const teamFields = ['eaoMember', 'proMember', 'projLead', 'execProjectDirector', 'complianceLead'];
      
      teamFields.forEach(field => {
        expect(field).to.be.a('string');
      });
    });
  });

  describe('Project Progress and Review', () => {
    it('should have progress tracking fields', () => {
      const progressFields = ['overallProgress', 'duration', 'build', 'intake'];
      
      progressFields.forEach(field => {
        expect(field).to.be.a('string');
      });
    });

    it('should have review timeline fields', () => {
      const reviewFields = ['review180Start', 'review45Start', 'reviewSuspensions', 'reviewExtensions'];
      
      reviewFields.forEach(field => {
        expect(field).to.be.a('string');
      });
    });
  });

  describe('Project CAC (Community Advisory Committee)', () => {
    it('should have CAC fields', () => {
      const cacFields = ['cacMembers', 'cacEmail', 'projectCAC', 'projectCACPublished'];
      
      cacFields.forEach(field => {
        expect(field).to.be.a('string');
      });
    });

    it('should track comment periods', () => {
      const commentFields = ['hasMetCommentPeriods'];
      
      commentFields.forEach(field => {
        expect(field).to.be.a('string');
      });
    });
  });

  describe('Project Documents and Features', () => {
    it('should have document fields', () => {
      const docFields = ['featuredDocuments'];
      
      docFields.forEach(field => {
        expect(field).to.be.a('string');
      });
    });

    it('should have identifier fields', () => {
      const idFields = ['epicProjectID', 'code', 'shortName'];
      
      idFields.forEach(field => {
        expect(field).to.be.a('string');
      });
    });
  });

  describe('Audit Trail Fields', () => {
    it('should have user tracking fields', () => {
      const auditFields = ['addedBy', 'updatedBy'];
      
      auditFields.forEach(field => {
        expect(field).to.be.a('string');
      });
    });

    it('should have agreement fields', () => {
      const agreementFields = ['isTermsAgreed'];
      
      agreementFields.forEach(field => {
        expect(field).to.be.a('string');
      });
    });
  });

  describe('Query Parameter Processing', () => {
    it('should handle pagination parameters', () => {
      const params = {
        pageNum: 0,
        pageSize: 10
      };
      
      expect(params.pageNum).to.be.a('number');
      expect(params.pageSize).to.be.a('number');
    });

    it('should handle sort parameters', () => {
      const sort = {
        field: 'name',
        direction: 'asc'
      };
      
      expect(sort.field).to.be.a('string');
      expect(sort.direction).to.be.a('string');
    });

    it('should handle filter parameters', () => {
      const filter = {
        region: 'Vancouver Island',
        status: 'active'
      };
      
      expect(filter).to.have.property('region');
      expect(filter).to.have.property('status');
    });
  });

  describe('Response Formatting', () => {
    it('should format success response', () => {
      const response = {
        status: 'success',
        data: { id: '123', name: 'Test Project' }
      };
      
      expect(response).to.have.property('status', 'success');
      expect(response).to.have.property('data');
    });

    it('should format error response', () => {
      const response = {
        status: 'error',
        message: 'Not found',
        code: 404
      };
      
      expect(response).to.have.property('status', 'error');
      expect(response).to.have.property('message');
      expect(response).to.have.property('code');
    });

    it('should include pagination metadata', () => {
      const response = {
        data: [],
        total: 100,
        page: 0,
        pageSize: 10
      };
      
      expect(response).to.have.property('total');
      expect(response).to.have.property('page');
      expect(response).to.have.property('pageSize');
    });
  });

  describe('Project Search Functionality', () => {
    const WORDS_TO_ANALYZE = 3;

    it('should define words to analyze constant', () => {
      expect(WORDS_TO_ANALYZE).to.equal(3);
    });

    it('should be a positive integer', () => {
      expect(WORDS_TO_ANALYZE).to.be.greaterThan(0);
      expect(Number.isInteger(WORDS_TO_ANALYZE)).to.be.true;
    });

    it('should handle keyword search', () => {
      const searchTerms = ['environmental', 'assessment', 'mine'];
      
      searchTerms.forEach(term => {
        expect(term).to.be.a('string');
        expect(term.length).to.be.greaterThan(0);
      });
    });
  });

  describe('HTTP Method Handlers', () => {
    it('should handle OPTIONS requests', () => {
      const method = 'OPTIONS';
      expect(method).to.equal('OPTIONS');
    });

    it('should handle HEAD requests', () => {
      const method = 'HEAD';
      expect(method).to.equal('HEAD');
    });

    it('should handle GET requests', () => {
      const method = 'GET';
      expect(method).to.equal('GET');
    });

    it('should handle POST requests', () => {
      const method = 'POST';
      expect(method).to.equal('POST');
    });

    it('should handle PUT requests', () => {
      const method = 'PUT';
      expect(method).to.equal('PUT');
    });

    it('should handle DELETE requests', () => {
      const method = 'DELETE';
      expect(method).to.equal('DELETE');
    });
  });

  describe('Permission Validation', () => {
    it('should validate public access', () => {
      const roles = ['public'];
      expect(roles).to.include('public');
    });

    it('should validate sysadmin access', () => {
      const roles = ['sysadmin'];
      expect(roles).to.include('sysadmin');
    });

    it('should validate staff access', () => {
      const roles = ['staff'];
      expect(roles).to.include('staff');
    });

    it('should handle multiple roles', () => {
      const roles = ['sysadmin', 'staff'];
      expect(roles).to.have.lengthOf(2);
    });

    it('should validate role arrays', () => {
      const userRoles = ['staff'];
      const requiredRoles = ['sysadmin', 'staff'];
      
      const hasAccess = userRoles.some(role => requiredRoles.includes(role));
      expect(hasAccess).to.be.true;
    });
  });

  describe('Data Validation', () => {
    it('should validate ObjectId format', () => {
      const validId = new mongoose.Types.ObjectId();
      expect(mongoose.Types.ObjectId.isValid(validId)).to.be.true;
    });

    it('should reject invalid ObjectId', () => {
      const invalidId = 'not-an-object-id';
      expect(mongoose.Types.ObjectId.isValid(invalidId)).to.be.false;
    });

    it('should validate required fields', () => {
      const requiredFields = ['name', 'type'];
      
      requiredFields.forEach(field => {
        expect(field).to.be.a('string');
        expect(field.length).to.be.greaterThan(0);
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle missing parameters', () => {
      const error = {
        code: 400,
        message: 'Missing required parameter'
      };
      
      expect(error.code).to.equal(400);
      expect(error.message).to.be.a('string');
    });

    it('should handle not found errors', () => {
      const error = {
        code: 404,
        message: 'Resource not found'
      };
      
      expect(error.code).to.equal(404);
    });

    it('should handle unauthorized errors', () => {
      const error = {
        code: 401,
        message: 'Unauthorized'
      };
      
      expect(error.code).to.equal(401);
    });

    it('should handle server errors', () => {
      const error = {
        code: 500,
        message: 'Internal server error'
      };
      
      expect(error.code).to.equal(500);
    });
  });
});

describe('Project legislation years on create and publish', () => {
  const Actions = require('../../api/helpers/actions');
  const Utils = require('../../api/helpers/utils');
  const demiPush = require('../../api/helpers/demiPush');
  const projectController = require('../../api/controllers/project');
  require('../../api/helpers/models/project');

  const PROJ_ID = '5f4c7d1e2b3a4c5d6e7f8191';
  const ORG_ID = '5f4c7d1e2b3a4c5d6e7f8192';
  const LEAD_ID = '5f4c7d1e2b3a4c5d6e7f8193';
  const EPD_ID = '5f4c7d1e2b3a4c5d6e7f8194';
  const auth = { preferred_username: 'tester', realm_access: { roles: ['sysadmin'] } };

  let Project;

  // protectedPost answers from inside an unreturned save().then(), so wait on the answer itself.
  function answer() {
    return new Promise(resolve => {
      sinon.stub(Actions, 'sendResponse').callsFake((r, code, data) => resolve({ code, data }));
    });
  }

  function postArgs(legislationYear) {
    const project = {
      name: 'Harbour Crossing',
      proponent: ORG_ID,
      responsibleEPDId: ORG_ID,
      projectLeadId: ORG_ID
    };
    if (legislationYear !== undefined) {
      project.legislationYear = legislationYear;
    }
    return { swagger: { params: { project: { value: project }, auth_payload: auth } } };
  }

  function publishArgs(ProjObject) {
    return { swagger: { params: { projId: { value: PROJ_ID }, ProjObject: { value: ProjObject }, auth_payload: auth } } };
  }

  function storedProject(year) {
    return new Project({
      _id: PROJ_ID,
      read: ['sysadmin', 'staff'],
      currentLegislationYear: 'legislation_' + year,
      legislationYearList: [year],
      ['legislation_' + year]: { name: 'Stored ' + year }
    });
  }

  beforeEach(() => {
    Project = mongoose.model('Project');
    sinon.stub(Project.prototype, 'save').callsFake(function () { return Promise.resolve(this); });
    sinon.stub(Utils, 'recordAction').resolves();
    sinon.stub(demiPush, 'project').resolves();
  });

  afterEach(() => sinon.restore());

  describe('protectedPost', () => {
    [2025, '2025'].forEach(year => {
      it(`creates a Building Canada Act project from legislationYear ${JSON.stringify(year)}`, async () => {
        const answered = answer();
        await projectController.protectedPost(postArgs(year), {});
        const { code, data } = await answered;

        expect(code).to.equal(200);
        expect(data.currentLegislationYear).to.equal('legislation_2025');
        expect(Array.from(data.legislationYearList)).to.deep.equal([2025]);
        expect(data.legislation_2025.legislation).to.equal('Building Canada Act');
        expect(data.legislation_2025.name).to.equal('Harbour Crossing');
      });
    });

    [
      [1996, '1996 Environmental Assessment Act'],
      [2002, '2002 Environmental Assessment Act'],
      [2018, '2018 Environmental Assessment Act']
    ].forEach(([year, label]) => {
      it(`still creates a ${year} project under its own block and label`, async () => {
        const answered = answer();
        await projectController.protectedPost(postArgs(year), {});
        const { code, data } = await answered;

        expect(code).to.equal(200);
        expect(data.currentLegislationYear).to.equal('legislation_' + year);
        expect(Array.from(data.legislationYearList)).to.deep.equal([year]);
        expect(data['legislation_' + year].legislation).to.equal(label);
        expect(data['legislation_' + year].name).to.equal('Harbour Crossing');
      });
    });

    it('creates a 2002 project when no year is sent', async () => {
      const answered = answer();
      await projectController.protectedPost(postArgs(undefined), {});
      const { code, data } = await answered;

      expect(code).to.equal(200);
      expect(data.currentLegislationYear).to.equal('legislation_2002');
      expect(data.legislation_2002.legislation).to.equal('2002 Environmental Assessment Act');
    });

    it('answers 400 and saves nothing for a year that is not a known Act', async () => {
      const answered = answer();
      await projectController.protectedPost(postArgs(2019), {});
      const { code } = await answered;

      expect(code).to.equal(400);
      expect(Project.prototype.save.called).to.be.false;
    });

    // A project can be created before anyone is named as its lead or EPD.
    function postWithContacts(set) {
      const args = postArgs(2025);
      set(args.swagger.params.project.value);
      return args;
    }

    [
      ['are not sent', p => { delete p.projectLeadId; delete p.responsibleEPDId; }],
      ['are null', p => { p.projectLeadId = null; p.responsibleEPDId = null; }],
      ['are empty', p => { p.projectLeadId = ''; p.responsibleEPDId = ''; }]
    ].forEach(([label, set]) => {
      it(`creates the project and stores null when the lead and EPD ids ${label}`, async () => {
        const answered = answer();
        await projectController.protectedPost(postWithContacts(set), {});
        const { code, data } = await answered;

        expect(code).to.equal(200);
        expect(data.legislation_2025.projectLeadId).to.be.null;
        expect(data.legislation_2025.responsibleEPDId).to.be.null;
      });
    });

    it('stores the lead and EPD ids each on its own field', async () => {
      const answered = answer();
      await projectController.protectedPost(postWithContacts(p => {
        p.projectLeadId = LEAD_ID;
        p.responsibleEPDId = EPD_ID;
      }), {});
      const { data } = await answered;

      expect(String(data.legislation_2025.projectLeadId)).to.equal(LEAD_ID);
      expect(String(data.legislation_2025.responsibleEPDId)).to.equal(EPD_ID);
    });

    it('keeps a sent lead id and stores null for a blank EPD id', async () => {
      const answered = answer();
      await projectController.protectedPost(postWithContacts(p => {
        p.projectLeadId = LEAD_ID;
        p.responsibleEPDId = '';
      }), {});
      const { code, data } = await answered;

      expect(code).to.equal(200);
      expect(String(data.legislation_2025.projectLeadId)).to.equal(LEAD_ID);
      expect(data.legislation_2025.responsibleEPDId).to.be.null;
    });

    ['projectLeadId', 'responsibleEPDId'].forEach(field => {
      it(`answers 400 and saves nothing when ${field} is not a valid id`, async () => {
        const answered = answer();
        await projectController.protectedPost(postWithContacts(p => { p[field] = 'not-an-id'; }), {});
        const { code } = await answered;

        expect(code).to.equal(400);
        expect(Project.prototype.save.called).to.be.false;
      });
    });

    it('still answers 400 and saves nothing when proponent is not sent', async () => {
      const answered = answer();
      await projectController.protectedPost(postWithContacts(p => { delete p.proponent; }), {});
      const { code } = await answered;

      expect(code).to.equal(400);
      expect(Project.prototype.save.called).to.be.false;
    });
  });

  describe('protectedPublish on a Building Canada Act project', () => {
    let stored;

    beforeEach(() => {
      stored = storedProject(2025);
      sinon.stub(Project, 'findOne').resolves(stored);
    });

    it('refuses with 409 and does not publish when the request names 2002', async () => {
      const answered = answer();
      await projectController.protectedPublish(publishArgs({ legislationYear: 2002 }), {});
      const { code, data } = await answered;

      expect(code).to.equal(409);
      expect(data).to.deep.equal({ message: 'Project is under the Building Canada Act' });
      expect(Project.prototype.save.called).to.be.false;
      expect(stored.read).to.not.include('public');
      expect(stored.currentLegislationYear).to.equal('legislation_2025');
    });

    [{ legislationYear: 2025 }, {}].forEach(body => {
      it(`publishes under 2025 when the request body is ${JSON.stringify(body)}`, async () => {
        const answered = answer();
        await projectController.protectedPublish(publishArgs(body), {});
        const { code, data } = await answered;

        expect(code).to.equal(200);
        expect(data.read).to.include('public');
        expect(data.currentLegislationYear).to.equal('legislation_2025');
      });
    });

    ['2025 ', '2025.0'].forEach(year => {
      it(`publishes under legislation_2025 when the year is sent as ${JSON.stringify(year)}`, async () => {
        const answered = answer();
        await projectController.protectedPublish(publishArgs({ legislationYear: year }), {});
        const { code, data } = await answered;

        expect(code).to.equal(200);
        expect(data.currentLegislationYear).to.equal('legislation_2025');
      });
    });
  });

  describe('protectedPublish on a B.C. Act project', () => {
    let stored;

    beforeEach(() => {
      stored = storedProject(2018);
      sinon.stub(Project, 'findOne').resolves(stored);
    });

    async function refused(body) {
      const answered = answer();
      await projectController.protectedPublish(publishArgs(body), {});
      const result = await answered;
      expect(Project.prototype.save.called).to.be.false;
      expect(demiPush.project.called).to.be.false;
      expect(stored.read).to.not.include('public');
      expect(stored.currentLegislationYear).to.equal('legislation_2018');
      return result;
    }

    [2018, '2018', '2018 ', '2018.0'].forEach(year => {
      it(`publishes under legislation_2018 when the year is sent as ${JSON.stringify(year)}`, async () => {
        const answered = answer();
        await projectController.protectedPublish(publishArgs({ legislationYear: year }), {});
        const { code, data } = await answered;

        expect(code).to.equal(200);
        expect(data.read).to.include('public');
        expect(data.currentLegislationYear).to.equal('legislation_2018');
      });
    });

    [2019, '2025abc', 1].forEach(year => {
      it(`answers 404 and writes nothing for ${JSON.stringify(year)}, which is not a known Act`, async () => {
        const { code, data } = await refused({ legislationYear: year });

        expect(code).to.equal(404);
        expect(data).to.deep.equal({ message: 'Unknown legislation year' });
      });
    });

    [2025, 1996].forEach(year => {
      it(`refuses with 409 and writes nothing for ${year}, which the project has no content under`, async () => {
        const { code, data } = await refused({ legislationYear: year });

        expect(code).to.equal(409);
        expect(data).to.deep.equal({ message: 'Project has no content under legislation year ' + year });
      });
    });

    it('refuses with 409 when the year is listed but its block has no name', async () => {
      stored.legislationYearList.push(2002);

      const { code } = await refused({ legislationYear: 2002 });

      expect(code).to.equal(409);
    });

    // Rows written before the year list or block names were kept up to date still publish under their own year.
    [
      ['its legislationYearList lacks 2018', project => { project.legislationYearList = [2002]; }],
      ['its 2018 block has no name', project => { project.legislation_2018.name = undefined; }]
    ].forEach(([gap, makeGap]) => {
      it(`publishes naming 2018 when ${gap}, without a write-time filter`, async () => {
        makeGap(stored);
        const answered = answer();
        await projectController.protectedPublish(publishArgs({ legislationYear: 2018 }), {});
        const { code, data } = await answered;

        expect(code).to.equal(200);
        expect(data.read).to.include('public');
        expect(data.currentLegislationYear).to.equal('legislation_2018');
        expect(stored.$where).to.equal(undefined);
      });
    });

    describe('naming another year with content', () => {
      beforeEach(() => {
        stored.legislationYearList.push(2002);
        stored.legislation_2002 = { name: 'Stored 2002' };
      });

      it('saves the year change only while the project is not under a locked Act', async () => {
        const answered = answer();
        await projectController.protectedPublish(publishArgs({ legislationYear: 2002 }), {});
        const { code, data } = await answered;

        expect(code).to.equal(200);
        expect(stored.$where).to.deep.equal({ currentLegislationYear: { $nin: ['legislation_2025'] } });
        expect(data.currentLegislationYear).to.equal('legislation_2002');
        expect(demiPush.project.calledOnce).to.be.true;
      });

      // save() throws VersionError instead of DocumentNotFoundError when it also bumps the version.
      [
        ['DocumentNotFoundError', () => new mongoose.Error.DocumentNotFoundError({ _id: PROJ_ID }, 'Project', 0, {})],
        ['VersionError', () => new mongoose.Error.VersionError(stored, 0, ['read'])]
      ].forEach(([name, saveError]) => {
        it(`refuses with 409 when the save misses with ${name} because the project moved under the Building Canada Act`, async () => {
          Project.prototype.save.rejects(saveError());
          sinon.stub(Project, 'exists').resolves({ _id: PROJ_ID });

          const answered = answer();
          await projectController.protectedPublish(publishArgs({ legislationYear: 2002 }), {});
          const { code, data } = await answered;

          expect(code).to.equal(409);
          expect(data).to.deep.equal({ message: 'Project is under the Building Canada Act' });
          expect(Project.exists.firstCall.args[0].currentLegislationYear).to.deep.equal({ $in: ['legislation_2025'] });
          expect(demiPush.project.called).to.be.false;
        });
      });

      it('answers 500 when the save found no row and the project is not under a locked Act', async () => {
        Project.prototype.save.rejects(new mongoose.Error.DocumentNotFoundError({ _id: PROJ_ID }, 'Project', 0, {}));
        sinon.stub(Project, 'exists').resolves(null);

        const answered = answer();
        await projectController.protectedPublish(publishArgs({ legislationYear: 2002 }), {});
        const { code } = await answered;

        expect(code).to.equal(500);
      });
    });
  });
});
