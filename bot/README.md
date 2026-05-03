# Matchus Telegram Bot Server

Telegram Bot server for the location comparison Mini App. This bot handles signaling only and does NOT store any user location files on the server.

## Features

- Handle `/compare @UserB` commands from User A (initiator)
- Generate unique comparison session IDs (32-byte random hex)
- Send inline keyboard invitation to User B with "Approve" / "Decline" buttons
- Listen for User B's approval/decline via `callback_query`
- Relay Mini App URLs to both users with session tokens
- Act as a file_id relay (store only file_id strings in memory, never file content)
- Provide lightweight API endpoints for Mini App session validation and file_id relay

## Architecture

```
bot/
├── server.js                    # Main bot server entry point
├── session-store.js             # In-memory session store with auto-expiration
├── handlers/
│   ├── command-handler.js       # Handle /compare commands
│   └── callback-handler.js      # Handle inline keyboard callbacks
├── api/
│   └── session-api.js           # Express API for Mini App
└── README.md                    # This file
```

## Session Data Structure (In-Memory Only)

```javascript
{
  sessionId: "random-hex-string",      // 64-char hex string
  initiatorId: 12345678,               // User A Telegram ID
  partnerId: 87654321,                 // User B Telegram ID
  status: "pending" | "approved" | "file_uploaded" | "completed",
  fileId: null,                        // Telegram file_id for User B's file (string only)
  chatId: 123456,                      // Group/chat ID where comparison was requested
  createdAt: Date,
  expiresAt: Date                      // 1 hour from creation
}
```

## API Endpoints

### GET /api/session/:id
Validate session and return status.

**Response:**
```json
{
  "sessionId": "abc123...",
  "initiatorId": 12345678,
  "partnerId": 87654321,
  "status": "approved",
  "fileId": null,
  "createdAt": "2024-01-01T00:00:00.000Z",
  "expiresAt": "2024-01-01T01:00:00.000Z"
}
```

### POST /api/session/:id/file
Receive file_id from User B's Mini App.

**Request Body:**
```json
{
  "fileId": "AgACAgIAAxkDAAI...",
  "userId": 87654321
}
```

**Response:**
```json
{
  "success": true,
  "message": "File ID stored successfully",
  "sessionId": "abc123...",
  "status": "file_uploaded"
}
```

### GET /api/session/:id/file?userId=12345678
Return file_id for User A to download.

**Response:**
```json
{
  "success": true,
  "fileId": "AgACAgIAAxkDAAI...",
  "sessionId": "abc123...",
  "status": "file_uploaded"
}
```

### GET /health
Health check endpoint.

## Bot Commands Flow

1. **User A** sends: `/compare @UserB` (or replies to User B's message)
2. **Bot** creates session, sends invitation to User B with inline keyboard
3. **User B** clicks "Approve" → Bot updates session status, sends Mini App URL to both users
4. **Mini App URL format:** `https://your-mini-app-url.com/?session=SESSION_ID&role=initiator|partner`

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `TELEGRAM_BOT_TOKEN` | Yes | - | Telegram Bot Token from @BotFather |
| `WEBHOOK_URL` | For webhook mode | - | Full URL for webhook (e.g., https://your-domain.com) |
| `WEBHOOK_PATH` | No | `/webhook` | Path for webhook endpoint |
| `PORT` | No | `3000` | Port for the Express server |
| `MINI_APP_URL` | No | `https://your-mini-app-url.com` | URL of your Mini App |

## Installation

1. Install dependencies:
```bash
npm install
```

2. Create a Telegram bot:
   - Message @BotFather on Telegram
   - Send `/newbot` and follow instructions
   - Copy the bot token

3. Configure environment variables:

**Option A: Using .env file (recommended)**
Create a `.env` file in the project root:
```
TELEGRAM_BOT_TOKEN=your_bot_token_here
WEBHOOK_URL=https://your-domain.com
MINI_APP_URL=https://your-mini-app.com
PORT=3000
```

**Option B: Export environment variables**
```bash
export TELEGRAM_BOT_TOKEN="your_bot_token_here"
export WEBHOOK_URL="https://your-domain.com"
export MINI_APP_URL="https://your-mini-app.com"
export PORT=3000
```

## Running the Bot

### Production (Webhook Mode)
Webhook mode is recommended for production. The bot will receive updates via HTTP POST requests.

```bash
npm run bot
```

Or directly:
```bash
node bot/server.js
```

The server will:
1. Set up the webhook with Telegram
2. Start the Express server to receive webhook calls
3. Provide API endpoints for the Mini App

### Development (Polling Mode)
For local development without a public URL, you can use polling mode by not setting `WEBHOOK_URL`:

```bash
# Don't set WEBHOOK_URL, or set it to empty string
export TELEGRAM_BOT_TOKEN="your_bot_token_here"
node bot/server.js
```

The bot will use long polling to receive updates.

## Webhook Setup

### Using a Reverse Proxy (Nginx)

If using Nginx, add this to your site config:

```nginx
location /webhook {
    proxy_pass http://localhost:3000/webhook;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection 'upgrade';
    proxy_set_header Host $host;
    proxy_cache_bypass $http_upgrade;
}
```

### Using ngrok for Development

For testing webhooks locally:

```bash
ngrok http 3000
```

Then set `WEBHOOK_URL` to your ngrok URL (e.g., `https://abc123.ngrok.io`).

### Manual Webhook Setup

You can manually set the webhook using curl:

```bash
curl -F "url=https://your-domain.com/webhook" \
     https://api.telegram.org/bot<YOUR_BOT_TOKEN>/setWebhook
```

Check webhook status:
```bash
curl https://api.telegram.org/bot<YOUR_BOT_TOKEN>/getWebhookInfo
```

Delete webhook (to switch to polling):
```bash
curl https://api.telegram.org/bot<YOUR_BOT_TOKEN>/deleteWebhook
```

## Security Considerations

1. **No file storage**: This bot never stores file content, only Telegram `file_id` strings
2. **Session expiration**: All sessions auto-expire after 1 hour
3. **In-memory only**: No persistent storage, sessions are lost on server restart
4. **User validation**: API endpoints validate user IDs before returning file IDs
5. **HTTPS**: Use HTTPS in production for webhook security

## Important Notes

- The bot uses `node-telegram-bot-api` library for Telegram Bot API communication
- Sessions are stored in memory only and expire after 1 hour
- The Mini App is responsible for:
  1. Uploading files to Telegram and getting `file_id`
  2. Sending `file_id` to the API
  3. Downloading files using `file_id` from Telegram
- No user location data is ever stored on the server

## Troubleshooting

### Bot not responding
- Check that `TELEGRAM_BOT_TOKEN` is correct
- Check logs for errors
- Verify webhook is set correctly: `/getWebhookInfo`

### Webhook not working
- Ensure your server is accessible from the internet
- Check that SSL certificate is valid (required for webhooks)
- Verify the webhook URL is correct

### Sessions expiring too quickly
- Sessions are set to expire after 1 hour (3600000 ms)
- To change, modify `SESSION_TTL_MS` in `bot/session-store.js`

## License

CC-BY-NC-SA-4.0 (same as main project)
