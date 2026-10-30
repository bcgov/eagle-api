const { expect } = require('chai');
const sinon = require('sinon');
const mongoose = require('mongoose');

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
