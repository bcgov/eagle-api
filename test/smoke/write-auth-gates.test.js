'use strict';

/**
 * Write endpoint auth gate tests.
 *
 * These tests verify that all write endpoints (POST/PUT/DELETE) properly
 * reject unauthenticated requests with a 401. No data is created or modified —
 * we intentionally send requests WITHOUT a token and assert the response is 401.
 */

const { API } = require('./helpers');
const request = require('supertest');

const unauth = (method, path, body) =>
  request(API)[method](path).set('Content-Type', 'application/json').send(body || {});

describe('WRITE ENDPOINT AUTH GATES (no token — all expect 401)', () => {
  describe('Project write endpoints', () => {
    it('POST /project — requires auth', async () => {
      await unauth('post', '/project').expect(401);
    });
    it('PUT /project/:projId — requires auth', async () => {
      await unauth('put', '/project/000000000000000000000000').expect(401);
    });
    it('DELETE /project/:projId — requires auth', async () => {
      await unauth('delete', '/project/000000000000000000000000').expect(401);
    });
    it('PUT /project/:projId/publish — requires auth', async () => {
      await unauth('put', '/project/000000000000000000000000/publish').expect(401);
    });
    it('PUT /project/:projId/unpublish — requires auth', async () => {
      await unauth('put', '/project/000000000000000000000000/unpublish').expect(401);
    });
    it('POST /project/:projId/pin — requires auth', async () => {
      await unauth('post', '/project/000000000000000000000000/pin').expect(401);
    });
    it('DELETE /project/:projId/pin/:pinId — requires auth', async () => {
      await unauth('delete', '/project/000000000000000000000000/pin/000000000000000000000001').expect(401);
    });
    it('PUT /project/:projId/pin/publish — requires auth', async () => {
      await unauth('put', '/project/000000000000000000000000/pin/publish').expect(401);
    });
    it('PUT /project/:projId/pin/unpublish — requires auth', async () => {
      await unauth('put', '/project/000000000000000000000000/pin/unpublish').expect(401);
    });
    it('POST /project/:projId/cac — requires auth', async () => {
      await unauth('post', '/project/000000000000000000000000/cac').expect(401);
    });
    it('PUT /project/:projId/cac — requires auth', async () => {
      await unauth('put', '/project/000000000000000000000000/cac').expect(401);
    });
    it('DELETE /project/:projId/cac — requires auth', async () => {
      await unauth('delete', '/project/000000000000000000000000/cac').expect(401);
    });
    it('PUT /project/:projId/cac/publish — requires auth', async () => {
      await unauth('put', '/project/000000000000000000000000/cac/publish').expect(401);
    });
    it('PUT /project/:projId/cac/unpublish — requires auth', async () => {
      await unauth('put', '/project/000000000000000000000000/cac/unpublish').expect(401);
    });
    it('POST /project/:projId/group — requires auth', async () => {
      await unauth('post', '/project/000000000000000000000000/group').expect(401);
    });
    it('POST /project/:projId/extension — requires auth', async () => {
      await unauth('post', '/project/000000000000000000000000/extension').expect(401);
    });
    it('PUT /project/:projId/extension — requires auth', async () => {
      await unauth('put', '/project/000000000000000000000000/extension').expect(401);
    });
    it('DELETE /project/:projId/extension — requires auth', async () => {
      await unauth('delete', '/project/000000000000000000000000/extension').query({ item: 'x' }).expect(401);
    });
  });

  describe('Document write endpoints', () => {
    it('POST /document — requires auth', async () => {
      await unauth('post', '/document').expect(401);
    });
    it('PUT /document/:docId — requires auth', async () => {
      await unauth('put', '/document/000000000000000000000000').expect(401);
    });
    it('DELETE /document/:docId — requires auth', async () => {
      await unauth('delete', '/document/000000000000000000000000').expect(401);
    });
    it('PUT /document/:docId/publish — requires auth', async () => {
      await unauth('put', '/document/000000000000000000000000/publish').expect(401);
    });
    it('PUT /document/:docId/unpublish — requires auth', async () => {
      await unauth('put', '/document/000000000000000000000000/unpublish').expect(401);
    });
    it('PUT /document/:docId/feature — requires auth', async () => {
      await unauth('put', '/document/000000000000000000000000/feature').expect(401);
    });
    it('PUT /document/:docId/unfeature — requires auth', async () => {
      await unauth('put', '/document/000000000000000000000000/unfeature').expect(401);
    });
  });

  describe('Comment write endpoints', () => {
    it('POST /comment — requires auth', async () => {
      await unauth('post', '/comment').expect(401);
    });
    it('PUT /comment/:commentId — requires auth', async () => {
      await unauth('put', '/comment/000000000000000000000000').expect(401);
    });
    it('PUT /comment/:commentId/status — requires auth', async () => {
      await unauth('put', '/comment/000000000000000000000000/status').expect(401);
    });
  });

  describe('Comment period write endpoints', () => {
    it('POST /commentperiod — requires auth', async () => {
      await unauth('post', '/commentperiod').query({ projectId: '000000000000000000000000' }).expect(401);
    });
    it('PUT /commentperiod/:id — requires auth', async () => {
      await unauth('put', '/commentperiod/000000000000000000000000').expect(401);
    });
    it('DELETE /commentperiod/:id — requires auth', async () => {
      await unauth('delete', '/commentperiod/000000000000000000000000').expect(401);
    });
    it('PUT /commentperiod/:id/publish — requires auth', async () => {
      await unauth('put', '/commentperiod/000000000000000000000000/publish').expect(401);
    });
    it('PUT /commentperiod/:id/unpublish — requires auth', async () => {
      await unauth('put', '/commentperiod/000000000000000000000000/unpublish').expect(401);
    });
  });

  describe('Organization write endpoints', () => {
    it('POST /organization — requires auth', async () => {
      await unauth('post', '/organization').expect(401);
    });
    it('PUT /organization/:orgId — requires auth', async () => {
      await unauth('put', '/organization/000000000000000000000000').expect(401);
    });
    it('PUT /organization/:orgId/publish — requires auth', async () => {
      await unauth('put', '/organization/000000000000000000000000/publish').expect(401);
    });
    it('PUT /organization/:orgId/unpublish — requires auth', async () => {
      await unauth('put', '/organization/000000000000000000000000/unpublish').expect(401);
    });
  });

  describe('Recent activity write endpoints', () => {
    it('POST /recentActivity — requires auth', async () => {
      await unauth('post', '/recentActivity').expect(401);
    });
    it('PUT /recentActivity/:id — requires auth', async () => {
      await unauth('put', '/recentActivity/000000000000000000000000').expect(401);
    });
    it('DELETE /recentActivity/:id — requires auth', async () => {
      await unauth('delete', '/recentActivity/000000000000000000000000').expect(401);
    });
    it('DELETE /recentActivity — requires auth (applicationID param)', async () => {
      await unauth('delete', '/recentActivity').query({ applicationID: '000000000000000000000000' }).expect(401);
    });
  });

  describe('User write endpoints', () => {
    it('POST /user — requires auth', async () => {
      await unauth('post', '/user').expect(401);
    });
    it('PUT /user/:userId — requires auth', async () => {
      await unauth('put', '/user/000000000000000000000000').expect(401);
    });
  });

  describe('Topic write endpoints', () => {
    it('POST /topic — requires auth', async () => {
      await unauth('post', '/topic').expect(401);
    });
    it('PUT /topic/:topicId — requires auth', async () => {
      await unauth('put', '/topic/000000000000000000000000').expect(401);
    });
    it('DELETE /topic/:topicId — requires auth', async () => {
      await unauth('delete', '/topic/000000000000000000000000').expect(401);
    });
  });

  describe('Valued component write endpoints', () => {
    it('POST /vc — requires auth', async () => {
      await unauth('post', '/vc').expect(401);
    });
    it('PUT /vc/:vcId — requires auth', async () => {
      await unauth('put', '/vc/000000000000000000000000').expect(401);
    });
    it('DELETE /vc/:vcId — requires auth', async () => {
      await unauth('delete', '/vc/000000000000000000000000').expect(401);
    });
  });

  describe('Project notification write endpoints', () => {
    it('POST /projectNotification — requires auth', async () => {
      await unauth('post', '/projectNotification').expect(401);
    });
    it('PUT /projectNotification/:id — requires auth', async () => {
      await unauth('put', '/projectNotification/000000000000000000000000').expect(401);
    });
  });

  describe('Task write endpoints', () => {
    it('POST /task — requires auth', async () => {
      await unauth('post', '/task').expect(401);
    });
  });

  describe('Inspection write endpoints', () => {
    it('POST /inspection — requires auth', async () => {
      await unauth('post', '/inspection').expect(401);
    });
    it('POST /inspection/:id/element — requires auth', async () => {
      await unauth('post', '/inspection/000000000000000000000000/element').expect(401);
    });
  });

  describe('V2 Project write endpoints', () => {
    it('POST /v2/Projects — requires auth', async () => {
      await unauth('post', '/v2/Projects').expect(401);
    });
    it('PUT /v2/projects/:projId — requires auth', async () => {
      await unauth('put', '/v2/projects/000000000000000000000000').expect(401);
    });
    it('DELETE /v2/projects/:projId — requires auth', async () => {
      await unauth('delete', '/v2/projects/000000000000000000000000').expect(401);
    });
    it('PUT /v2/projects/:projId/publish — requires auth', async () => {
      await unauth('put', '/v2/projects/000000000000000000000000/publish').expect(401);
    });
    it('PUT /v2/projects/:projId/unpublish — requires auth', async () => {
      await unauth('put', '/v2/projects/000000000000000000000000/unpublish').expect(401);
    });
    it('POST /v2/projects/:projId/pins — requires auth', async () => {
      await unauth('post', '/v2/projects/000000000000000000000000/pins').expect(401);
    });
    it('DELETE /v2/projects/:projId/pins/:pinId — requires auth', async () => {
      await unauth('delete', '/v2/projects/000000000000000000000000/pins/000000000000000000000001').expect(401);
    });
    it('PUT /v2/projects/:projId/pins/publish — requires auth', async () => {
      await unauth('put', '/v2/projects/000000000000000000000000/pins/publish').expect(401);
    });
    it('PUT /v2/projects/:projId/pins/unpublish — requires auth', async () => {
      await unauth('put', '/v2/projects/000000000000000000000000/pins/unpublish').expect(401);
    });
    it('POST /v2/projects/:projId/extensions — requires auth', async () => {
      await unauth('post', '/v2/projects/000000000000000000000000/extensions').expect(401);
    });
    it('POST /v2/projects/:projId/groups — requires auth', async () => {
      await unauth('post', '/v2/projects/000000000000000000000000/groups').expect(401);
    });
    it('DELETE /v2/projects/:projId/groups/:groupId — requires auth', async () => {
      await unauth('delete', '/v2/projects/000000000000000000000000/groups/000000000000000000000001').expect(401);
    });
    it('POST /v2/projects/:projId/groups/:groupId/members — requires auth', async () => {
      await unauth('post', '/v2/projects/000000000000000000000000/groups/000000000000000000000001/members').expect(401);
    });
    it('DELETE /v2/projects/:projId/groups/:groupId/members/:memberId — requires auth', async () => {
      await unauth('delete', '/v2/projects/000000000000000000000000/groups/000000000000000000000001/members/000000000000000000000002').expect(401);
    });
  });

  describe('V2 Document write endpoints', () => {
    it('POST /v2/documents — requires auth', async () => {
      await unauth('post', '/v2/documents').expect(401);
    });
    it('PUT /v2/documents/:docId — requires auth', async () => {
      await unauth('put', '/v2/documents/000000000000000000000000').expect(401);
    });
    it('DELETE /v2/documents/:docId — requires auth', async () => {
      await unauth('delete', '/v2/documents/000000000000000000000000').expect(401);
    });
    it('PUT /v2/documents/:docId/publish — requires auth', async () => {
      await unauth('put', '/v2/documents/000000000000000000000000/publish').expect(401);
    });
    it('PUT /v2/documents/:docId/unpublish — requires auth', async () => {
      await unauth('put', '/v2/documents/000000000000000000000000/unpublish').expect(401);
    });
    it('PUT /v2/documents/:docId/feature — requires auth', async () => {
      await unauth('put', '/v2/documents/000000000000000000000000/feature').expect(401);
    });
    it('PUT /v2/documents/:docId/unfeature — requires auth', async () => {
      await unauth('put', '/v2/documents/000000000000000000000000/unfeature').expect(401);
    });
  });
});
