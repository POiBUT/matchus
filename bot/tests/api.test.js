// Mock express module directly with factory function
jest.mock('express', () => {
  const mockRouter = {
    get: jest.fn(),
    post: jest.fn(),
    use: jest.fn()
  };

  return {
    Router: jest.fn(() => mockRouter),
    json: jest.fn(() => (req, res, next) => next())
  };
});

const SessionStore = require('../session-store');
const SessionAPI = require('../api/session-api');

// Mock Express req/res objects
function createMockReqRes() {
  const req = {
    params: {},
    body: {},
    query: {}
  };

  const res = {
    statusCode: 200,
    jsonData: null,
    status: function(code) {
      this.statusCode = code;
      return this;
    },
    json: function(data) {
      this.jsonData = data;
      return this;
    }
  };

  return { req, res };
}

describe('SessionAPI', () => {
  let store;
  let api;

  beforeEach(() => {
    store = new SessionStore();
    store.sessions.clear();
    api = new SessionAPI(store, { someConfig: 'test' });
  });

  afterEach(() => {
    if (store.cleanupInterval) {
      clearInterval(store.cleanupInterval);
    }
  });

  describe('GET /api/session/:id - validateSession', () => {
    test('should return session data for valid session', () => {
      const session = store.createSession({
        initiatorId: 123456,
        partnerId: 789012,
        chatId: 111111
      });

      const { req, res } = createMockReqRes();
      req.params.id = session.sessionId;

      api.validateSession(req, res);

      expect(res.statusCode).toBe(200);
      expect(res.jsonData).toHaveProperty('sessionId', session.sessionId);
      expect(res.jsonData).toHaveProperty('initiatorId', 123456);
      expect(res.jsonData).toHaveProperty('partnerId', 789012);
      expect(res.jsonData).toHaveProperty('status', 'pending');
    });

    test('should return 404 for invalid session ID', () => {
      const { req, res } = createMockReqRes();
      req.params.id = 'nonexistent-session-id';

      api.validateSession(req, res);

      expect(res.statusCode).toBe(404);
      expect(res.jsonData).toHaveProperty('error', 'Session not found or expired');
      expect(res.jsonData).toHaveProperty('code', 'SESSION_NOT_FOUND');
    });

    test('should return 404 for expired session', () => {
      const session = store.createSession({
        initiatorId: 123456,
        partnerId: 789012,
        chatId: 111111
      });

      // Expire the session
      session.expiresAt = new Date(Date.now() - 1000);
      store.sessions.set(session.sessionId, session);

      const { req, res } = createMockReqRes();
      req.params.id = session.sessionId;

      api.validateSession(req, res);

      expect(res.statusCode).toBe(404);
      expect(res.jsonData).toHaveProperty('code', 'SESSION_NOT_FOUND');
    });
  });

  describe('POST /api/session/:id/file - uploadFileId', () => {
    test('should store file_id for valid request', async () => {
      const session = store.createSession({
        initiatorId: 123456,
        partnerId: 789012,
        chatId: 111111
      });
      store.updateStatus(session.sessionId, 'approved');

      const { req, res } = createMockReqRes();
      req.params.id = session.sessionId;
      req.body = {
        fileId: 'telegram-file-id-123',
        userId: '789012' // partnerId
      };

      await api.uploadFileId(req, res);

      expect(res.statusCode).toBe(200);
      expect(res.jsonData).toHaveProperty('success', true);
      expect(res.jsonData).toHaveProperty('status', 'file_uploaded');

      // Verify file_id was stored
      const updatedSession = store.getSession(session.sessionId);
      expect(updatedSession.fileId).toBe('telegram-file-id-123');
    });

    test('should return 400 for missing fileId', async () => {
      const session = store.createSession({
        initiatorId: 123456,
        partnerId: 789012,
        chatId: 111111
      });

      const { req, res } = createMockReqRes();
      req.params.id = session.sessionId;
      req.body = {
        userId: '789012'
        // missing fileId
      };

      await api.uploadFileId(req, res);

      expect(res.statusCode).toBe(400);
      expect(res.jsonData).toHaveProperty('error', 'fileId is required');
      expect(res.jsonData).toHaveProperty('code', 'MISSING_FILE_ID');
    });

    test('should return 400 for missing userId', async () => {
      const session = store.createSession({
        initiatorId: 123456,
        partnerId: 789012,
        chatId: 111111
      });

      const { req, res } = createMockReqRes();
      req.params.id = session.sessionId;
      req.body = {
        fileId: 'telegram-file-id-123'
        // missing userId
      };

      await api.uploadFileId(req, res);

      expect(res.statusCode).toBe(400);
      expect(res.jsonData).toHaveProperty('error', 'userId is required');
      expect(res.jsonData).toHaveProperty('code', 'MISSING_USER_ID');
    });

    test('should return 404 for invalid session', async () => {
      const { req, res } = createMockReqRes();
      req.params.id = 'nonexistent-session-id';
      req.body = {
        fileId: 'telegram-file-id-123',
        userId: '789012'
      };

      await api.uploadFileId(req, res);

      expect(res.statusCode).toBe(404);
      expect(res.jsonData).toHaveProperty('code', 'SESSION_NOT_FOUND');
    });

    test('should return 403 for unauthorized user (not partner)', async () => {
      const session = store.createSession({
        initiatorId: 123456,
        partnerId: 789012,
        chatId: 111111
      });
      store.updateStatus(session.sessionId, 'approved');

      const { req, res } = createMockReqRes();
      req.params.id = session.sessionId;
      req.body = {
        fileId: 'telegram-file-id-123',
        userId: '999999' // Not the partner
      };

      await api.uploadFileId(req, res);

      expect(res.statusCode).toBe(403);
      expect(res.jsonData).toHaveProperty('error', 'Only the partner can upload files to this session');
      expect(res.jsonData).toHaveProperty('code', 'UNAUTHORIZED_USER');
    });

    test('should return 400 for invalid session status', async () => {
      const session = store.createSession({
        initiatorId: 123456,
        partnerId: 789012,
        chatId: 111111
      });
      // Status is 'pending', not 'approved'

      const { req, res } = createMockReqRes();
      req.params.id = session.sessionId;
      req.body = {
        fileId: 'telegram-file-id-123',
        userId: '789012'
      };

      await api.uploadFileId(req, res);

      expect(res.statusCode).toBe(400);
      expect(res.jsonData).toHaveProperty('code', 'INVALID_SESSION_STATUS');
    });
  });

  describe('GET /api/session/:id/file - getFileId', () => {
    test('should return file_id for initiator', () => {
      const session = store.createSession({
        initiatorId: 123456,
        partnerId: 789012,
        chatId: 111111
      });
      store.setFileId(session.sessionId, 'telegram-file-id-123');

      const { req, res } = createMockReqRes();
      req.params.id = session.sessionId;
      req.query.userId = '123456'; // initiatorId

      api.getFileId(req, res);

      expect(res.statusCode).toBe(200);
      expect(res.jsonData).toHaveProperty('success', true);
      expect(res.jsonData).toHaveProperty('fileId', 'telegram-file-id-123');
    });

    test('should return 400 for missing userId', () => {
      const session = store.createSession({
        initiatorId: 123456,
        partnerId: 789012,
        chatId: 111111
      });

      const { req, res } = createMockReqRes();
      req.params.id = session.sessionId;
      // missing userId in query

      api.getFileId(req, res);

      expect(res.statusCode).toBe(400);
      expect(res.jsonData).toHaveProperty('error', 'userId query parameter is required');
      expect(res.jsonData).toHaveProperty('code', 'MISSING_USER_ID');
    });

    test('should return 404 for invalid session', () => {
      const { req, res } = createMockReqRes();
      req.params.id = 'nonexistent-session-id';
      req.query.userId = '123456';

      api.getFileId(req, res);

      expect(res.statusCode).toBe(404);
      expect(res.jsonData).toHaveProperty('code', 'SESSION_NOT_FOUND');
    });

    test('should return 403 for unauthorized user (not initiator)', () => {
      const session = store.createSession({
        initiatorId: 123456,
        partnerId: 789012,
        chatId: 111111
      });
      store.setFileId(session.sessionId, 'telegram-file-id-123');

      const { req, res } = createMockReqRes();
      req.params.id = session.sessionId;
      req.query.userId = '999999'; // Not the initiator

      api.getFileId(req, res);

      expect(res.statusCode).toBe(403);
      expect(res.jsonData).toHaveProperty('error', 'Only the initiator can download files from this session');
      expect(res.jsonData).toHaveProperty('code', 'UNAUTHORIZED_USER');
    });

    test('should return 404 if file not yet uploaded', () => {
      const session = store.createSession({
        initiatorId: 123456,
        partnerId: 789012,
        chatId: 111111
      });
      // No file_id set

      const { req, res } = createMockReqRes();
      req.params.id = session.sessionId;
      req.query.userId = '123456';

      api.getFileId(req, res);

      expect(res.statusCode).toBe(404);
      expect(res.jsonData).toHaveProperty('error', 'File not yet uploaded by partner');
      expect(res.jsonData).toHaveProperty('code', 'FILE_NOT_UPLOADED');
    });
  });

  describe('GET /api/health - healthCheck', () => {
    test('should return health status', () => {
      const { req, res } = createMockReqRes();

      api.healthCheck(req, res);

      expect(res.statusCode).toBe(200);
      expect(res.jsonData).toHaveProperty('status', 'ok');
      expect(res.jsonData).toHaveProperty('service', 'matchus-bot-api');
      expect(res.jsonData).toHaveProperty('activeSessions');
    });
  });
});
