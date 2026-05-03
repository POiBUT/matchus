# Manual Testing Guide

## Prerequisites
- Telegram Bot Token (from @BotFather)
- Publicly accessible URL (for webhook) - use ngrok for testing
- Two Telegram accounts for testing
- Google Takeout JSON files for testing

## Setup
1. Set environment variables
2. Install dependencies: `npm install`
3. Start the bot: `npm run bot`
4. Set webhook: `curl -F "url=https://your-url.com/webhook" https://api.telegram.org/bot<TOKEN>/setWebhook`
5. Serve Mini App: Use a static file server or Vercel/Netlify for `mini-app/` directory

## Test Cases

### Test 1: Bot Command Handling
1. User A sends `/compare @UserB`
2. Verify: Bot creates session, sends invitation to User B
3. Verify: Inline keyboard with Approve/Decline buttons appears

### Test 2: Callback Handling
1. User B clicks "Approve"
2. Verify: Bot sends Mini App URL to both users
3. Verify: Session status changes to "approved"

### Test 3: Mini App Session Validation
1. Open Mini App URL with valid session ID
2. Verify: Session validates successfully, shows file upload screen
3. Test with invalid/expired session

### Test 4: File Upload (Partner)
1. User B uploads Google Takeout JSON
2. Verify: File is sent to Telegram, file_id stored in session
3. Verify: User B sees "Waiting for comparison..." message

### Test 5: File Upload (Initiator) + Comparison
1. User A uploads Google Takeout JSON
2. Verify: JSON converts to CSV, stored locally
3. Verify: App downloads User B's file via file_id
4. Verify: Comparison runs, results displayed

### Test 6: Results Sharing
1. Verify: Results show match count, list of matches
2. Click "Send to Chat"
3. Verify: Results sent to Telegram chat via Bot
4. Verify: Both users receive results

### Test 7: File Cleanup
1. After comparison, verify: Blob URLs revoked
2. Verify: No file data remains in browser memory
3. Check browser DevTools → Application → IndexedDB (should be empty)

### Test 8: Error Handling
1. Test with invalid JSON file
2. Test with malformed session ID
3. Test session expiration (wait 1 hour or modify expiration time)
4. Test with missing permissions

## Automated Test Runner
```bash
npm test              # Run all Jest tests
npm run test:bot      # Run bot tests only
npm run test:mini-app # Run Mini App tests only
```

## Running Unit Tests

### Bot Tests
```bash
# Run all bot tests
npm run test:bot

# Run with verbose output
npx jest bot/tests/ --verbose
```

### Mini App Tests
```bash
# Run all mini-app tests
npm run test:mini-app

# Run with verbose output
npx jest mini-app/tests/ --verbose --config mini-app/jest.config.js
```

## Test Files Created

### Bot Tests
- `bot/tests/session-store.test.js` - Tests for session creation, expiration, cleanup
- `bot/tests/api.test.js` - Tests for API endpoints with mocked Express requests/responses

### Mini App Tests
- `mini-app/tests/compare-core.test.js` - Tests for comparison logic (haversineDistance, isTimeMatch, parseCSV, optimizedStrategy)
- `mini-app/tests/json-converter.test.js` - Tests for JSON to CSV conversion (processJsonFileAsync, parseLatLng)

## Notes
- Unit tests mock external dependencies (Telegram Bot API, file system)
- Mini App tests mock `window`, `document`, `FileReader`, `fetch` APIs
- The goal is to verify logic correctness, not full integration (which requires manual testing)
- See `compare-tool.test.js` and `validator.test.js` for additional test examples
