const crypto = require('crypto');

/**
 * In-memory session store for comparison sessions
 * Sessions auto-expire after 1 hour (3600000 ms)
 */

const SESSION_TTL_MS = 60 * 60 * 1000; // 1 hour
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

class SessionStore {
  constructor() {
    this.sessions = new Map();
    this.startCleanupInterval();
  }

  /**
   * Generate a unique session ID (32-byte random hex)
   * @returns {string} 64-character hex string
   */
  generateSessionId() {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Create a new comparison session
   * @param {object} params - Session parameters
   * @param {number} params.initiatorId - User A Telegram ID
   * @param {number} params.partnerId - User B Telegram ID
   * @param {number} params.chatId - Group/chat ID where comparison was requested
   * @returns {object} Created session object
   */
  createSession({ initiatorId, partnerId, chatId }) {
    const sessionId = this.generateSessionId();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);

    const session = {
      sessionId,
      initiatorId,
      partnerId,
      status: 'pending', // pending | approved | file_uploaded | completed
      fileId: null,
      chatId,
      createdAt: now,
      expiresAt
    };

    this.sessions.set(sessionId, session);
    console.log(`[SessionStore] Created session ${sessionId} for users ${initiatorId} and ${partnerId}`);
    return session;
  }

  /**
   * Get session by ID
   * @param {string} sessionId
   * @returns {object|null} Session object or null if not found/expired
   */
  getSession(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return null;
    }

    // Check if session has expired
    if (new Date() > session.expiresAt) {
      this.sessions.delete(sessionId);
      console.log(`[SessionStore] Session ${sessionId} expired, removed`);
      return null;
    }

    return session;
  }

  /**
   * Update session status
   * @param {string} sessionId
   * @param {string} status - New status
   * @returns {object|null} Updated session or null if not found
   */
  updateStatus(sessionId, status) {
    const session = this.getSession(sessionId);
    if (!session) {
      return null;
    }

    session.status = status;
    this.sessions.set(sessionId, session);
    console.log(`[SessionStore] Session ${sessionId} status updated to: ${status}`);
    return session;
  }

  /**
   * Set file_id for a session
   * @param {string} sessionId
   * @param {string} fileId - Telegram file_id string
   * @returns {object|null} Updated session or null if not found
   */
  setFileId(sessionId, fileId) {
    const session = this.getSession(sessionId);
    if (!session) {
      return null;
    }

    session.fileId = fileId;
    session.status = 'file_uploaded';
    this.sessions.set(sessionId, session);
    console.log(`[SessionStore] Session ${sessionId} file_id set`);
    return session;
  }

  /**
   * Delete a session
   * @param {string} sessionId
   */
  deleteSession(sessionId) {
    this.sessions.delete(sessionId);
    console.log(`[SessionStore] Session ${sessionId} deleted`);
  }

  /**
   * Get all sessions (for debugging)
   * @returns {Array} Array of session objects
   */
  getAllSessions() {
    const now = new Date();
    const validSessions = [];
    for (const [id, session] of this.sessions) {
      if (now <= session.expiresAt) {
        validSessions.push(session);
      }
    }
    return validSessions;
  }

  /**
   * Clean up expired sessions
   */
  cleanupExpiredSessions() {
    const now = new Date();
    let cleaned = 0;

    for (const [id, session] of this.sessions) {
      if (now > session.expiresAt) {
        this.sessions.delete(id);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      console.log(`[SessionStore] Cleaned up ${cleaned} expired sessions`);
    }
  }

  /**
   * Start periodic cleanup of expired sessions
   */
  startCleanupInterval() {
    setInterval(() => {
      this.cleanupExpiredSessions();
    }, CLEANUP_INTERVAL_MS);

    console.log(`[SessionStore] Cleanup interval started (every ${CLEANUP_INTERVAL_MS / 60000} minutes)`);
  }
}

module.exports = SessionStore;
