# Test Suite

Simple test suite for the Eagle API.

## Running Tests

```bash
# Run all tests
npm test

# Watch mode (re-run on file changes)
npm run test:watch

# Tests that need a real MongoDB (aggregation behaviour). Not part of `npm test`.
npm run db:up && npm run test:db
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

### Basic Example

```javascript
const { expect } = require('chai');

describe('Feature Name', () => {
  it('should do something specific', () => {
    const result = 1 + 1;
    expect(result).to.equal(2);
  });
});
```

### Testing Async Code

```javascript
it('should handle promises', async () => {
  const result = await Promise.resolve(42);
  expect(result).to.equal(42);
});
```

### Using Sinon for Mocking

```javascript
const sinon = require('sinon');

it('should call dependency', () => {
  const mockFn = sinon.stub().returns('mocked');
  const result = mockFn();
  
  expect(mockFn.calledOnce).to.be.true;
  expect(result).to.equal('mocked');
});
```

## Resources

- [Mocha Documentation](https://mochajs.org/)
- [Chai Assertions](https://www.chaijs.com/)
- [Sinon Mocks](https://sinonjs.org/)
