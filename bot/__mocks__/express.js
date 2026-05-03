// Manual mock for express module
const mockRouter = {
  get: jest.fn(),
  post: jest.fn(),
  use: jest.fn()
};

module.exports = {
  Router: jest.fn(() => mockRouter),
  json: jest.fn(() => (req, res, next) => next())
};
