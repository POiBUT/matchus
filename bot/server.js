#!/usr/bin/env node

/**
 * Telegram Bot Server for Location Comparison Mini App
 * - Handles signaling only, no file content storage
 * - Uses webhook mode for Telegram Bot API
 * - Sessions auto-expire after 1 hour
 */

const express = require('express');
const crypto = require('crypto');
const path = require('path');
const SessionStore = require('./session-store');
const CommandHandler = require('./handlers/command-handler');
const CallbackHandler = require('./handlers/callback-handler');
const HowtoHandler = require('./handlers/howto-handler');
const DocumentHandler = require('./handlers/document-handler');
const SessionAPI = require('./api/session-api');

// Load configuration from environment variables
const config = {
  botToken: process.env.TELEGRAM_BOT_TOKEN || '',
  webhookUrl: process.env.WEBHOOK_URL || '',
  webhookPath: process.env.WEBHOOK_PATH || '/webhook',
  port: parseInt(process.env.PORT) || 3000,
  miniAppUrl: process.env.MINI_APP_URL || ''
};

// Helper to check if URL is a placeholder
function isPlaceholder(url) {
  return !url ||
    url.includes('your-') ||
    url.includes('example.com') ||
    url.includes('placeholder') ||
    url === '';
}

// For Amvera deployment, try to construct webhook URL from available environment variables
// Amvera typically provides the domain via HOSTNAME
// Prefer HOSTNAME over WEBHOOK_URL if WEBHOOK_URL is a placeholder
if (process.env.HOSTNAME && (isPlaceholder(config.webhookUrl) || config.webhookUrl === '')) {
  config.webhookUrl = `https://${process.env.HOSTNAME}`;
  console.log(`[Server] Using HOSTNAME for webhook URL: ${config.webhookUrl}`);
} else if (isPlaceholder(config.webhookUrl)) {
  // WEBHOOK_URL is a placeholder, clear it
  config.webhookUrl = '';
  console.log(`[Server] WEBHOOK_URL appears to be a placeholder, ignoring`);
}

// Validate required configuration
if (!config.botToken) {
  console.error('ERROR: TELEGRAM_BOT_TOKEN environment variable is required');
  process.exit(1);
}

// Initialize Express app
const app = express();

// Initialize session store
const sessionStore = new SessionStore();

// Serve mini-app static files
app.use(express.static(path.join(__dirname, '../mini-app')));

// Choose Telegram Bot library
// Using node-telegram-bot-api for simplicity and webhook support
const { TelegramBot } = require('node-telegram-bot-api');

let bot;

// Check if we should use webhook or polling
const useWebhook = config.webhookUrl && config.webhookUrl !== '';

if (useWebhook) {
  console.log(`[Server] Starting in webhook mode`);
  
  // Build webhook URL correctly - avoid double /webhook path
  let webhookFullUrl;
  if (config.webhookUrl.endsWith(config.webhookPath)) {
    // URL already contains the webhook path
    webhookFullUrl = config.webhookUrl;
  } else {
    // Append webhook path to URL
    webhookFullUrl = `${config.webhookUrl}${config.webhookPath}`;
  }
  
  console.log(`[Server] Webhook URL: ${webhookFullUrl}`);

  // Create bot instance with webhook
  bot = new TelegramBot(config.botToken, { webHook: true });

  // Set webhook with retry logic
  const setWebhookWithRetry = async (retries = 5, delay = 5000) => {
    for (let i = 0; i < retries; i++) {
      try {
        console.log(`[Server] Attempting to set webhook (attempt ${i + 1}/${retries})...`);
        await bot.setWebHook(webhookFullUrl);
        console.log(`[Server] Webhook set to: ${webhookFullUrl}`);
        return;
      } catch (err) {
        console.error(`[Server] Failed to set webhook (attempt ${i + 1}/${retries}):`, err.message);
        if (i < retries - 1) {
          console.log(`[Server] Retrying in ${delay / 1000} seconds...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        } else {
          console.error(`[Server] All webhook attempts failed. Webhook may need to be set manually.`);
        }
      }
    }
  };

  setWebhookWithRetry();

  // Use express to listen for webhook
  app.use(config.webhookPath, express.json());

  // Handle webhook updates
  app.post(config.webhookPath, (req, res) => {
    bot.processUpdate(req.body);
    res.sendStatus(200);
  });

} else {
  console.log(`[Server] Starting in polling mode (development)`);

  // Create bot instance with polling (for development)
  bot = new TelegramBot(config.botToken, { polling: true });

  // Handle polling errors
  bot.on('polling_error', (error) => {
    console.error('[Server] Polling error:', error.message);
  });
}

// Set default MINI_APP_URL based on mode
if (!config.miniAppUrl) {
  if (useWebhook) {
    // Try to construct from various environment variables that Amvera might provide
    const hostname = process.env.HOSTNAME || process.env.HOST || process.env.DOMAIN;
    if (hostname) {
      config.miniAppUrl = `https://${hostname}`;
    } else {
      config.miniAppUrl = 'https://your-mini-app-url.com';
    }
  } else {
    config.miniAppUrl = `http://localhost:${config.port}`;
  }
}

// Initialize handlers
const commandHandler = new CommandHandler(bot, sessionStore, config);
const callbackHandler = new CallbackHandler(bot, sessionStore, config);
const howtoHandler = new HowtoHandler(bot);
const documentHandler = new DocumentHandler(bot, sessionStore);

// Initialize API routes
const sessionAPI = new SessionAPI(sessionStore, config);
app.use('/api', sessionAPI.getRouter());

// Add JSON body parser for API
app.use(express.json());

// Health check endpoint at root
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'matchus-bot-server',
    mode: useWebhook ? 'webhook' : 'polling',
    timestamp: new Date().toISOString(),
    activeSessions: sessionStore.getAllSessions().length
  });
});

// Root endpoint with basic info
app.get('/', (req, res) => {
  res.json({
    service: 'Matchus Telegram Bot Server',
    description: 'Location Comparison Mini App signaling server',
    mode: useWebhook ? 'webhook' : 'polling',
    endpoints: {
      health: 'GET /health',
      session: 'GET /api/session/:id',
      uploadFile: 'POST /api/session/:id/file',
      getFile: 'GET /api/session/:id/file'
    }
  });
});

// Start server
const server = app.listen(config.port, () => {
  console.log(`[Server] Matchus Bot Server started`);
  console.log(`[Server] Port: ${config.port}`);
  console.log(`[Server] Mode: ${useWebhook ? 'webhook' : 'polling'}`);
  console.log(`[Server] Active sessions: ${sessionStore.getAllSessions().length}`);
  console.log(`[Server] API endpoints available at http://localhost:${config.port}/api`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('[Server] SIGTERM received, shutting down gracefully...');
  server.close(() => {
    console.log('[Server] Server closed');
    if (useWebhook) {
      bot.deleteWebHook().then(() => {
        console.log('[Server] Webhook deleted');
        process.exit(0);
      });
    } else {
      process.exit(0);
    }
  });
});

process.on('SIGINT', () => {
  console.log('[Server] SIGINT received, shutting down...');
  server.close(() => {
    console.log('[Server] Server closed');
    process.exit(0);
  });
});

// Log startup
console.log(`[Server] Bot initialized with token: ${config.botToken.substring(0, 10)}...`);
console.log(`[Server] Mini App URL: ${config.miniAppUrl}`);

module.exports = { app, bot, sessionStore };
