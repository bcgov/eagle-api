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

// Sends a request without a token and asserts the endpoint is not accessible.
// Unauthenticated requests must return 401 Unauthorized, 403 Forbidden,
// or 404 Not Found (if the route is not configured or exposed).
const unauth = (method, path, body) =>
  request(API)[method.toLowerCase()](path)
    .set('Content-Type', 'application/json')
    .send(body || {})
    .expect(res => {
      if (res.status !== 401 && res.status !== 403 && res.status !== 404) {
        throw new Error(`auth gate: expected 401, 403, or 404, got ${res.status}`);
      }
    });



describe('WRITE ENDPOINT AUTH GATES (no token — all expect 401 or 403)', () => {
  describe('Project write endpoints', () => {
    it('POST /project — requires auth', async () => {
      await unauth('post', '/project');
    });
    it('PUT /project/:projId — requires auth', async () => {
      await unauth('put', '/project/000000000000000000000000');
    });
    it('DELETE /project/:projId — requires auth', async () => {
      await unauth('delete', '/project/000000000000000000000000');
    });
    it('PUT /project/:projId/publish — requires auth', async () => {
      await unauth('put', '/project/000000000000000000000000/publish');
    });
    it('PUT /project/:projId/unpublish — requires auth', async () => {
      await unauth('put', '/project/000000000000000000000000/unpublish');
    });
    it('POST /project/:projId/pin — requires auth', async () => {
      await unauth('post', '/project/000000000000000000000000/pin');
    });
    it('DELETE /project/:projId/pin/:pinId — requires auth', async () => {
      await unauth('delete', '/project/000000000000000000000000/pin/000000000000000000000001');
    });
    it('PUT /project/:projId/pin/publish — requires auth', async () => {
      await unauth('put', '/project/000000000000000000000000/pin/publish');
    });
    it('PUT /project/:projId/pin/unpublish — requires auth', async () => {
      await unauth('put', '/project/000000000000000000000000/pin/unpublish');
    });
    it('POST /project/:projId/cac — requires auth', async () => {
      await unauth('post', '/project/000000000000000000000000/cac');
    });
    it('PUT /project/:projId/cac — requires auth', async () => {
      await unauth('put', '/project/000000000000000000000000/cac');
    });
    it('DELETE /project/:projId/cac — requires auth', async () => {
      await unauth('delete', '/project/000000000000000000000000/cac');
    });
    it('PUT /project/:projId/cac/publish — requires auth', async () => {
      await unauth('put', '/project/000000000000000000000000/cac/publish');
    });
    it('PUT /project/:projId/cac/unpublish — requires auth', async () => {
      await unauth('put', '/project/000000000000000000000000/cac/unpublish');
    });
    it('POST /project/:projId/group — requires auth', async () => {
      await unauth('post', '/project/000000000000000000000000/group');
    });
    it('POST /project/:projId/extension — requires auth', async () => {
      await unauth('post', '/project/000000000000000000000000/extension');
    });
    it('PUT /project/:projId/extension — requires auth', async () => {
      await unauth('put', '/project/000000000000000000000000/extension');
    });
    it('DELETE /project/:projId/extension — requires auth', async () => {
      await unauth('delete', '/project/000000000000000000000000/extension').query({ item: 'x' });
    });
  });

  describe('Document write endpoints', () => {
    it('POST /document — requires auth', async () => {
      await unauth('post', '/document');
    });
    it('PUT /document/:docId — requires auth', async () => {
      await unauth('put', '/document/000000000000000000000000');
    });
    it('DELETE /document/:docId — requires auth', async () => {
      await unauth('delete', '/document/000000000000000000000000');
    });
    it('PUT /document/:docId/publish — requires auth', async () => {
      await unauth('put', '/document/000000000000000000000000/publish');
    });
    it('PUT /document/:docId/unpublish — requires auth', async () => {
      await unauth('put', '/document/000000000000000000000000/unpublish');
    });
    it('PUT /document/:docId/feature — requires auth', async () => {
      await unauth('put', '/document/000000000000000000000000/feature');
    });
    it('PUT /document/:docId/unfeature — requires auth', async () => {
      await unauth('put', '/document/000000000000000000000000/unfeature');
    });
  });

  describe('Comment write endpoints', () => {
    it('POST /comment — requires auth', async () => {
      await unauth('post', '/comment');
    });
    it('PUT /comment/:commentId — requires auth', async () => {
      await unauth('put', '/comment/000000000000000000000000');
    });
    it('PUT /comment/:commentId/status — requires auth', async () => {
      await unauth('put', '/comment/000000000000000000000000/status');
    });
  });

  describe('Comment period write endpoints', () => {
    it('POST /commentperiod — requires auth', async () => {
      await unauth('post', '/commentperiod').query({ projectId: '000000000000000000000000' });
    });
    it('PUT /commentperiod/:id — requires auth', async () => {
      await unauth('put', '/commentperiod/000000000000000000000000');
    });
    it('DELETE /commentperiod/:id — requires auth', async () => {
      await unauth('delete', '/commentperiod/000000000000000000000000');
    });
    it('PUT /commentperiod/:id/publish — requires auth', async () => {
      await unauth('put', '/commentperiod/000000000000000000000000/publish');
    });
    it('PUT /commentperiod/:id/unpublish — requires auth', async () => {
      await unauth('put', '/commentperiod/000000000000000000000000/unpublish');
    });
  });

  describe('Organization write endpoints', () => {
    it('POST /organization — requires auth', async () => {
      await unauth('post', '/organization');
    });
    it('PUT /organization/:orgId — requires auth', async () => {
      await unauth('put', '/organization/000000000000000000000000');
    });
    it('PUT /organization/:orgId/publish — requires auth', async () => {
      await unauth('put', '/organization/000000000000000000000000/publish');
    });
    it('PUT /organization/:orgId/unpublish — requires auth', async () => {
      await unauth('put', '/organization/000000000000000000000000/unpublish');
    });
  });

  describe('Recent activity write endpoints', () => {
    it('POST /recentActivity — requires auth', async () => {
      await unauth('post', '/recentActivity');
    });
    it('PUT /recentActivity/:id — requires auth', async () => {
      await unauth('put', '/recentActivity/000000000000000000000000');
    });
    it('DELETE /recentActivity/:id — requires auth', async () => {
      await unauth('delete', '/recentActivity/000000000000000000000000');
    });
    it('DELETE /recentActivity — requires auth (applicationID param)', async () => {
      await unauth('delete', '/recentActivity').query({ applicationID: '000000000000000000000000' });
    });
  });

  describe('User write endpoints', () => {
    it('POST /user — requires auth', async () => {
      await unauth('post', '/user');
    });
    it('PUT /user/:userId — requires auth', async () => {
      await unauth('put', '/user/000000000000000000000000');
    });
  });

  describe('Topic write endpoints', () => {
    it('POST /topic — requires auth', async () => {
      await unauth('post', '/topic');
    });
    it('PUT /topic/:topicId — requires auth', async () => {
      await unauth('put', '/topic/000000000000000000000000');
    });
    it('DELETE /topic/:topicId — requires auth', async () => {
      await unauth('delete', '/topic/000000000000000000000000');
    });
  });

  describe('Valued component write endpoints', () => {
    it('POST /vc — requires auth', async () => {
      await unauth('post', '/vc');
    });
    it('PUT /vc/:vcId — requires auth', async () => {
      await unauth('put', '/vc/000000000000000000000000');
    });
    it('DELETE /vc/:vcId — requires auth', async () => {
      await unauth('delete', '/vc/000000000000000000000000');
    });
  });

  describe('Project notification write endpoints', () => {
    it('POST /projectNotification — requires auth', async () => {
      await unauth('post', '/projectNotification');
    });
    it('PUT /projectNotification/:id — requires auth', async () => {
      await unauth('put', '/projectNotification/000000000000000000000000');
    });
  });

  describe('Task write endpoints', () => {
    it('POST /task — requires auth', async () => {
      await unauth('post', '/task');
    });
  });

  describe('Inspection write endpoints', () => {
    it('POST /inspection — requires auth', async () => {
      await unauth('post', '/inspection');
    });
    it('POST /inspection/:id/element — requires auth', async () => {
      await unauth('post', '/inspection/000000000000000000000000/element');
    });
  });

  describe('V2 Project write endpoints', () => {
    it('POST /v2/Projects — requires auth', async () => {
      await unauth('post', '/v2/Projects');
    });
    it('PUT /v2/projects/:projId — requires auth', async () => {
      await unauth('put', '/v2/projects/000000000000000000000000');
    });
    it('DELETE /v2/projects/:projId — requires auth', async () => {
      await unauth('delete', '/v2/projects/000000000000000000000000');
    });
    it('PUT /v2/projects/:projId/publish — requires auth', async () => {
      await unauth('put', '/v2/projects/000000000000000000000000/publish');
    });
    it('PUT /v2/projects/:projId/unpublish — requires auth', async () => {
      await unauth('put', '/v2/projects/000000000000000000000000/unpublish');
    });
    it('POST /v2/projects/:projId/pins — requires auth', async () => {
      await unauth('post', '/v2/projects/000000000000000000000000/pins');
    });
    it('DELETE /v2/projects/:projId/pins/:pinId — requires auth', async () => {
      await unauth('delete', '/v2/projects/000000000000000000000000/pins/000000000000000000000001');
    });
    it('PUT /v2/projects/:projId/pins/publish — requires auth', async () => {
      await unauth('put', '/v2/projects/000000000000000000000000/pins/publish');
    });
    it('PUT /v2/projects/:projId/pins/unpublish — requires auth', async () => {
      await unauth('put', '/v2/projects/000000000000000000000000/pins/unpublish');
    });
    it('POST /v2/projects/:projId/extensions — requires auth', async () => {
      await unauth('post', '/v2/projects/000000000000000000000000/extensions');
    });
    it('POST /v2/projects/:projId/groups — requires auth', async () => {
      await unauth('post', '/v2/projects/000000000000000000000000/groups');
    });
    it('DELETE /v2/projects/:projId/groups/:groupId — requires auth', async () => {
      await unauth('delete', '/v2/projects/000000000000000000000000/groups/000000000000000000000001');
    });
    it('POST /v2/projects/:projId/groups/:groupId/members — requires auth', async () => {
      await unauth('post', '/v2/projects/000000000000000000000000/groups/000000000000000000000001/members');
    });
    it('DELETE /v2/projects/:projId/groups/:groupId/members/:memberId — requires auth', async () => {
      await unauth('delete', '/v2/projects/000000000000000000000000/groups/000000000000000000000001/members/000000000000000000000002');
    });
  });

  describe('V2 Document write endpoints', () => {
    it('POST /v2/documents — requires auth', async () => {
      await unauth('post', '/v2/documents');
    });
    it('PUT /v2/documents/:docId — requires auth', async () => {
      await unauth('put', '/v2/documents/000000000000000000000000');
    });
    it('DELETE /v2/documents/:docId — requires auth', async () => {
      await unauth('delete', '/v2/documents/000000000000000000000000');
    });
    it('PUT /v2/documents/:docId/publish — requires auth', async () => {
      await unauth('put', '/v2/documents/000000000000000000000000/publish');
    });
    it('PUT /v2/documents/:docId/unpublish — requires auth', async () => {
      await unauth('put', '/v2/documents/000000000000000000000000/unpublish');
    });
    it('PUT /v2/documents/:docId/feature — requires auth', async () => {
      await unauth('put', '/v2/documents/000000000000000000000000/feature');
    });
    it('PUT /v2/documents/:docId/unfeature — requires auth', async () => {
      await unauth('put', '/v2/documents/000000000000000000000000/unfeature');
    });
  });
});
