const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

/**
 * Persistent session store for comparison sessions
 * Sessions auto-expire after 1 hour (3600000 ms)
 * Uses /data folder for persistent storage (Amvera Cloud)
 */

const SESSION_TTL_MS = 60 * 60 * 1000; // 1 hour
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const DATA_DIR = '/data';
const SESSIONS_FILE = path.join(DATA_DIR, 'sessions.json');

class SessionStore {
  constructor() {
    this.sessions = new Map();
    this.loadSessions();
    this.startCleanupInterval();
  }

  /**
   * Load sessions from disk
   */
  loadSessions() {
    try {
      // Ensure /data directory exists
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }

      if (fs.existsSync(SESSIONS_FILE)) {
        const data = fs.readFileSync(SESSIONS_FILE, 'utf8');
        const sessionsObj = JSON.parse(data);
        
        // Convert object back to Map
        for (const [id, session] of Object.entries(sessionsObj)) {
          // Convert string dates back to Date objects
          session.createdAt = new Date(session.createdAt);
          session.expiresAt = new Date(session.expiresAt);
          this.sessions.set(id, session);
        }
        console.log(`[SessionStore] Loaded ${this.sessions.size} sessions from disk`);
      }
    } catch (err) {
      console.error(`[SessionStore] Error loading sessions:`, err.message);
    }
  }

  /**
   * Save sessions to disk
   */
  saveSessions() {
    try {
      const sessionsObj = Object.fromEntries(this.sessions);
      fs.writeFileSync(SESSIONS_FILE, JSON.stringify(sessionsObj, null, 2));
    } catch (err) {
      console.error(`[SessionStore] Error saving sessions:`, err.message);
    }
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
      status: 'pending', // pending | approved | initiator_uploaded | partner_uploaded | completed
      fileId: null,
      initiatorFileId: null,  // file_id of initiator's JSON upload
      partnerFileId: null,    // file_id of partner's JSON upload
      initiatorCsvFileId: null, // file_id of converted CSV (initiator)
      partnerCsvFileId: null,   // file_id of converted CSV (partner)
      csvData1: null,           // in-memory CSV string (initiator)
      csvData2: null,           // in-memory CSV string (partner)
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
    this.saveSessions();
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
    this.saveSessions();
    console.log(`[SessionStore] Session ${sessionId} file_id set`);
    return session;
  }

  /**
   * Register a user's file upload in a session
   * @param {string} sessionId
   * @param {number} userId - Telegram user ID
   * @param {string} jsonFileId - file_id of uploaded JSON
   * @param {string} csvFileId - file_id of converted CSV
   * @param {string} csvData - in-memory CSV string
   * @returns {object|null} Updated session or null if not found
   */
  registerUpload(sessionId, userId, jsonFileId, csvFileId, csvData) {
    const session = this.getSession(sessionId);
    if (!session) {
      return null;
    }

    const isInitiator = userId === session.initiatorId;

    if (isInitiator) {
      session.initiatorFileId = jsonFileId;
      session.initiatorCsvFileId = csvFileId;
      session.csvData1 = csvData;
    } else {
      session.partnerFileId = jsonFileId;
      session.partnerCsvFileId = csvFileId;
      session.csvData2 = csvData;
    }

    // Update status
    const initDone = session.initiatorFileId !== null;
    const partnerDone = session.partnerFileId !== null;
    session.status = initDone && partnerDone ? 'both_uploaded' : (isInitiator ? 'initiator_uploaded' : 'partner_uploaded');

    this.sessions.set(sessionId, session);
    console.log(`[SessionStore] Session ${sessionId}: ${isInitiator ? 'initiator' : 'partner'} uploaded (status: ${session.status})`);
    return session;
  }

  /**
   * Find active session for a user
   * @param {number} userId - Telegram user ID
   * @returns {object|null} First matching session or null
   */
  findSessionByUser(userId) {
    for (const [id, session] of this.sessions) {
      if (new Date() > session.expiresAt) {
        continue;
      }
      if (session.initiatorId === userId || session.partnerId === userId) {
        return session;
      }
    }
    return null;
  }

  /**
   * Delete a session
   * @param {string} sessionId
   */
  deleteSession(sessionId) {
    this.sessions.delete(sessionId);
    this.saveSessions();
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
      this.saveSessions();
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
