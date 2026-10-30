# Test Suite

Simple test suite for the Eagle API.

## Running Tests

```bash
# Run all tests
yarn test

# Watch mode (re-run on file changes)
yarn test:watch

# Tests that need a real MongoDB (aggregation behaviour). Not part of `yarn test`.
yarn db:up && yarn test:db
```

`db:up` publishes the docker-compose.yml MongoDB on 27017 as a single-member replica set, so
`test:db` defaults to a direct connection (`?directConnection=true`) rather than replica-set
discovery. Set `MONGODB_TEST_URI` to point it at a different server.

A plain standalone MongoDB also works, with no replica set needed:

```bash
docker run -d --rm -p 27017:27017 mongo:8.2
```

CI runs `test:db` as its own step against a MongoDB service container.

## Writing Tests

Add a test only when breaking the behaviour turns no existing test red. Break the code, run `yarn test`, then restore it.

A test calls production code and asserts what a caller sees:

```javascript
const { expect } = require('chai');
const { legislationKey } = require('../../api/helpers/constants');

describe('legislationKey', () => {
  it('maps a year to its project block key', () => {
    expect(legislationKey(2018)).to.equal('legislation_2018');
  });
});
```

For a route, drive the real router over HTTP with `supertest`, as `test/helpers/anonymousRouting.test.js` does. Stub only what leaves the process: MongoDB, MinIO, DEMI and other HTTP services.

## Resources

- [Mocha Documentation](https://mochajs.org/)
- [Chai Assertions](https://www.chaijs.com/)
- [Sinon Mocks](https://sinonjs.org/)
