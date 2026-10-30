const express = require('express');
const fs = require('fs');
const os = require('os');
const path = require('path');
const request = require('supertest');
const { expect } = require('chai');

const createRouter = require('../../api/middleware/swagger-router');

// Controller tests pass params already typed; this checks the router types the raw query strings.
const SPEC = {
  paths: {
    '/echo/{pageNum}': {
      'x-swagger-router-controller': 'echo',
      get: {
        operationId: 'echo',
        parameters: [
          { name: 'pageNum', in: 'path', type: 'integer' },
          { name: 'count', in: 'query', type: 'boolean' },
          { name: 'pageSize', in: 'query', type: 'integer' },
          { name: 'fields', in: 'query', type: 'array', items: { type: 'string' } }
        ],
        responses: {}
      }
    }
  }
};

describe('swagger router query and path params', () => {
  let dir;
  let app;

  before(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'swagger-params-'));
    fs.writeFileSync(
      path.join(dir, 'echo.js'),
      'exports.echo = (req, res) => res.json(Object.fromEntries(Object.entries(req.swagger.params).map(([k, p]) => [k, p.value])));\n'
    );
    app = express();
    app.use('/api', createRouter(SPEC, [dir]));
  });

  after(() => { fs.rmSync(dir, { recursive: true, force: true }); });

  [
    ['boolean count=false', '?count=false', 'count', false],
    ['boolean count=true', '?count=true', 'count', true],
    ['integer pageSize=25', '?pageSize=25', 'pageSize', 25],
    ['csv array fields=name,type', '?fields=name,type', 'fields', ['name', 'type']]
  ].forEach(([label, query, name, expected]) => {
    it(`hands the controller ${label} as ${JSON.stringify(expected)}`, async () => {
      const res = await request(app).get('/api/echo/2' + query);

      expect(res.status).to.equal(200);
      expect(res.body[name]).to.deep.equal(expected);
    });
  });

  it('hands the controller an integer path param as a number', async () => {
    const res = await request(app).get('/api/echo/2');

    expect(res.body.pageNum).to.equal(2);
  });
});
