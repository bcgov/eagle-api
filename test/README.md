# Test Suite

Simple test suite for the Eagle API.

## Running Tests

```bash
# Run all tests
npm test

# Watch mode (re-run on file changes)
npm run test:watch
```

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
