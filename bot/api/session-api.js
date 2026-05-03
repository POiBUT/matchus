const express = require('express');
const SessionStore = require('../session-store');

/**
 * Express API routes for Mini App session validation and file_id relay
 * - No file content is ever stored on the server, only file_id strings
 */

class SessionAPI {
  constructor(sessionStore, config) {
    this.sessionStore = sessionStore;
    this.config = config;
    this.router = express.Router();
    this.setupRoutes();
  }

  /**
   * Setup API routes
   */
  setupRoutes() {
    // GET /api/session/:id - Validate session, return status
    this.router.get('/session/:id', this.validateSession.bind(this));

    // POST /api/session/:id/file - Receive file_id from User B's Mini App
    this.router.post('/session/:id/file', express.json(), this.uploadFileId.bind(this));

    // GET /api/session/:id/file - Return file_id for User A to download
    this.router.get('/session/:id/file', this.getFileId.bind(this));

    // GET /api/health - Health check endpoint
    this.router.get('/health', this.healthCheck.bind(this));
  }

  /**
   * GET /api/session/:id
   * Validate session and return status
   */
  validateSession(req, res) {
    const sessionId = req.params.id;
    console.log(`[SessionAPI] GET /api/session/${sessionId.substring(0, 16)}...`);

    const session = this.sessionStore.getSession(sessionId);

    if (!session) {
      return res.status(404).json({
        error: 'Session not found or expired',
        code: 'SESSION_NOT_FOUND'
      });
    }

    // Return session info (excluding internal fields)
    return res.json({
      sessionId: session.sessionId,
      initiatorId: session.initiatorId,
      partnerId: session.partnerId,
      status: session.status,
      fileId: session.fileId,
      createdAt: session.createdAt,
      expiresAt: session.expiresAt
    });
  }

  /**
   * POST /api/session/:id/file
   * Receive file_id from User B's Mini App
   * The Mini App uploads the file to Telegram first, then sends the file_id here
   */
  async uploadFileId(req, res) {
    const sessionId = req.params.id;
    const { fileId, userId } = req.body;

    console.log(`[SessionAPI] POST /api/session/${sessionId.substring(0, 16)}.../file`);

    // Validate request body
    if (!fileId) {
      return res.status(400).json({
        error: 'fileId is required',
        code: 'MISSING_FILE_ID'
      });
    }

    if (!userId) {
      return res.status(400).json({
        error: 'userId is required',
        code: 'MISSING_USER_ID'
      });
    }

    // Get session
    const session = this.sessionStore.getSession(sessionId);

    if (!session) {
      return res.status(404).json({
        error: 'Session not found or expired',
        code: 'SESSION_NOT_FOUND'
      });
    }

    // Verify that the user uploading is the partner (User B)
    if (parseInt(userId) !== session.partnerId) {
      return res.status(403).json({
        error: 'Only the partner can upload files to this session',
        code: 'UNAUTHORIZED_USER'
      });
    }

    // Verify session is in approved status
    if (session.status !== 'approved' && session.status !== 'file_uploaded') {
      return res.status(400).json({
        error: `Session status is '${session.status}', expected 'approved' or 'file_uploaded'`,
        code: 'INVALID_SESSION_STATUS'
      });
    }

    // Store the file_id (string only, no file content)
    this.sessionStore.setFileId(sessionId, fileId);

    console.log(`[SessionAPI] File ID stored for session ${sessionId}`);

    return res.json({
      success: true,
      message: 'File ID stored successfully',
      sessionId: sessionId,
      status: 'file_uploaded'
    });
  }

  /**
   * GET /api/session/:id/file
   * Return file_id for User A to download
   * User A's Mini App will use this file_id to download the file from Telegram
   */
  getFileId(req, res) {
    const sessionId = req.params.id;
    const userId = req.query.userId;

    console.log(`[SessionAPI] GET /api/session/${sessionId.substring(0, 16)}.../file`);

    // Validate userId query parameter
    if (!userId) {
      return res.status(400).json({
        error: 'userId query parameter is required',
        code: 'MISSING_USER_ID'
      });
    }

    // Get session
    const session = this.sessionStore.getSession(sessionId);

    if (!session) {
      return res.status(404).json({
        error: 'Session not found or expired',
        code: 'SESSION_NOT_FOUND'
      });
    }

    // Verify that the requesting user is the initiator (User A)
    if (parseInt(userId) !== session.initiatorId) {
      return res.status(403).json({
        error: 'Only the initiator can download files from this session',
        code: 'UNAUTHORIZED_USER'
      });
    }

    // Check if file has been uploaded
    if (!session.fileId) {
      return res.status(404).json({
        error: 'File not yet uploaded by partner',
        code: 'FILE_NOT_UPLOADED',
        status: session.status
      });
    }

    // Return the file_id (string only, no file content)
    return res.json({
      success: true,
      fileId: session.fileId,
      sessionId: sessionId,
      status: session.status
    });
  }

  /**
   * GET /api/health
   * Health check endpoint
   */
  healthCheck(req, res) {
    const sessionCount = this.sessionStore.getAllSessions().length;
    return res.json({
      status: 'ok',
      service: 'matchus-bot-api',
      timestamp: new Date().toISOString(),
      activeSessions: sessionCount
    });
  }

  /**
   * Get the router instance
   * @returns {express.Router}
   */
  getRouter() {
    return this.router;
  }
}

module.exports = SessionAPI;
