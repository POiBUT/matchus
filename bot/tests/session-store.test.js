const SessionStore = require('../session-store');

// Mock crypto.randomBytes to return predictable session IDs
jest.mock('crypto', () => {
  const actual = jest.requireActual('crypto');
  return {
    ...actual,
    randomBytes: jest.fn((size) => ({
      toString: jest.fn(() => 'a'.repeat(size * 2)) // 64-char hex string for 32 bytes
    }))
  };
});

describe('SessionStore', () => {
  let store;

  beforeEach(() => {
    // Create a new store for each test
    store = new SessionStore();
    // Clear the sessions map
    store.sessions.clear();
    // Clear any intervals
    jest.clearAllMocks();
  });

  afterEach(() => {
    // Clean up any intervals
    if (store.cleanupInterval) {
      clearInterval(store.cleanupInterval);
    }
  });

  describe('generateSessionId', () => {
    test('should generate a 64-character hex string (32 bytes)', () => {
      const crypto = require('crypto');
      crypto.randomBytes.mockReturnValue({
        toString: () => 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2'
      });

      const id = store.generateSessionId();
      expect(id).toHaveLength(64);
      expect(/^[0-9a-f]+$/.test(id)).toBe(true);
    });

    test('should generate unique session IDs', () => {
      const crypto = require('crypto');
      let callCount = 0;
      crypto.randomBytes.mockImplementation((size) => ({
        toString: () => {
          callCount++;
          return callCount.toString().padStart(64, '0');
        }
      }));

      const id1 = store.generateSessionId();
      const id2 = store.generateSessionId();
      expect(id1).not.toBe(id2);
    });
  });

  describe('createSession', () => {
    test('should create session with valid data', () => {
      const session = store.createSession({
        initiatorId: 123456,
        partnerId: 789012,
        chatId: 111111
      });

      expect(session).toHaveProperty('sessionId');
      expect(session.initiatorId).toBe(123456);
      expect(session.partnerId).toBe(789012);
      expect(session.chatId).toBe(111111);
      expect(session.status).toBe('pending');
      expect(session.fileId).toBeNull();
      expect(session.createdAt).toBeInstanceOf(Date);
      expect(session.expiresAt).toBeInstanceOf(Date);
    });

    test('should store session in the sessions map', () => {
      const session = store.createSession({
        initiatorId: 123456,
        partnerId: 789012,
        chatId: 111111
      });

      expect(store.sessions.has(session.sessionId)).toBe(true);
    });

    test('should set expiration to 1 hour from creation', () => {
      const before = new Date();
      const session = store.createSession({
        initiatorId: 123456,
        partnerId: 789012,
        chatId: 111111
      });
      const after = new Date();

      const expectedMin = new Date(before.getTime() + 60 * 60 * 1000);
      const expectedMax = new Date(after.getTime() + 60 * 60 * 1000);

      expect(session.expiresAt.getTime()).toBeGreaterThanOrEqual(expectedMin.getTime());
      expect(session.expiresAt.getTime()).toBeLessThanOrEqual(expectedMax.getTime());
    });
  });

  describe('getSession', () => {
    test('should return session by ID', () => {
      const created = store.createSession({
        initiatorId: 123456,
        partnerId: 789012,
        chatId: 111111
      });

      const retrieved = store.getSession(created.sessionId);
      expect(retrieved).not.toBeNull();
      expect(retrieved.sessionId).toBe(created.sessionId);
    });

    test('should return null for non-existent session', () => {
      const result = store.getSession('nonexistent-id');
      expect(result).toBeNull();
    });

    test('should return null for expired session', () => {
      const session = store.createSession({
        initiatorId: 123456,
        partnerId: 789012,
        chatId: 111111
      });

      // Manually expire the session
      session.expiresAt = new Date(Date.now() - 1000);
      store.sessions.set(session.sessionId, session);

      const result = store.getSession(session.sessionId);
      expect(result).toBeNull();
      // Session should be removed from store
      expect(store.sessions.has(session.sessionId)).toBe(false);
    });
  });

  describe('updateStatus', () => {
    test('should update session status', () => {
      const session = store.createSession({
        initiatorId: 123456,
        partnerId: 789012,
        chatId: 111111
      });

      const updated = store.updateStatus(session.sessionId, 'approved');
      expect(updated).not.toBeNull();
      expect(updated.status).toBe('approved');
    });

    test('should return null for non-existent session', () => {
      const result = store.updateStatus('nonexistent-id', 'approved');
      expect(result).toBeNull();
    });
  });

  describe('setFileId', () => {
    test('should set file_id and update status to file_uploaded', () => {
      const session = store.createSession({
        initiatorId: 123456,
        partnerId: 789012,
        chatId: 111111
      });

      const updated = store.setFileId(session.sessionId, 'telegram-file-id-123');
      expect(updated).not.toBeNull();
      expect(updated.fileId).toBe('telegram-file-id-123');
      expect(updated.status).toBe('file_uploaded');
    });

    test('should return null for non-existent session', () => {
      const result = store.setFileId('nonexistent-id', 'file-id');
      expect(result).toBeNull();
    });
  });

  describe('deleteSession', () => {
    test('should delete session', () => {
      const session = store.createSession({
        initiatorId: 123456,
        partnerId: 789012,
        chatId: 111111
      });

      expect(store.sessions.has(session.sessionId)).toBe(true);
      store.deleteSession(session.sessionId);
      expect(store.sessions.has(session.sessionId)).toBe(false);
    });

    test('should not throw for non-existent session', () => {
      expect(() => store.deleteSession('nonexistent-id')).not.toThrow();
    });
  });

  describe('getAllSessions', () => {
    test('should return all valid sessions', () => {
      const session1 = store.createSession({
        initiatorId: 123456,
        partnerId: 789012,
        chatId: 111111
      });
      const session2 = store.createSession({
        initiatorId: 222222,
        partnerId: 333333,
        chatId: 444444
      });

      const allSessions = store.getAllSessions();
      expect(allSessions).toHaveLength(2);
    });

    test('should not return expired sessions', () => {
      const session1 = store.createSession({
        initiatorId: 123456,
        partnerId: 789012,
        chatId: 111111
      });

      // Expire session1
      session1.expiresAt = new Date(Date.now() - 1000);
      store.sessions.set(session1.sessionId, session1);

      const session2 = store.createSession({
        initiatorId: 222222,
        partnerId: 333333,
        chatId: 444444
      });

      const allSessions = store.getAllSessions();
      expect(allSessions).toHaveLength(1);
      expect(allSessions[0].sessionId).toBe(session2.sessionId);
    });
  });

  describe('cleanupExpiredSessions', () => {
    test('should remove expired sessions', () => {
      const session1 = store.createSession({
        initiatorId: 123456,
        partnerId: 789012,
        chatId: 111111
      });

      const session2 = store.createSession({
        initiatorId: 222222,
        partnerId: 333333,
        chatId: 444444
      });

      // Expire session1
      session1.expiresAt = new Date(Date.now() - 1000);
      store.sessions.set(session1.sessionId, session1);

      expect(store.sessions.size).toBe(2);
      store.cleanupExpiredSessions();
      expect(store.sessions.size).toBe(1);
      expect(store.sessions.has(session2.sessionId)).toBe(true);
    });

    test('should not remove valid sessions', () => {
      const session = store.createSession({
        initiatorId: 123456,
        partnerId: 789012,
        chatId: 111111
      });

      store.cleanupExpiredSessions();
      expect(store.sessions.has(session.sessionId)).toBe(true);
    });
  });

  describe('session expiration (1 hour)', () => {
    test('should expire sessions after 1 hour', () => {
      const SESSION_TTL_MS = 60 * 60 * 1000; // 1 hour

      const session = store.createSession({
        initiatorId: 123456,
        partnerId: 789012,
        chatId: 111111
      });

      // Verify session is valid now
      expect(store.getSession(session.sessionId)).not.toBeNull();

      // Simulate expiration by setting expiresAt to 1 hour + 1 ms ago
      session.expiresAt = new Date(Date.now() - SESSION_TTL_MS - 1);
      store.sessions.set(session.sessionId, session);

      expect(store.getSession(session.sessionId)).toBeNull();
    });
  });
});
