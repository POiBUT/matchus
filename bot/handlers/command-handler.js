const SessionStore = require('../session-store');

/**
 * Command handler for /compare command
 * Handles: /compare @UserB or reply to a message
 */

class CommandHandler {
  constructor(bot, sessionStore, config) {
    this.bot = bot;
    this.sessionStore = sessionStore;
    this.config = config;
    this.setupHandlers();
  }

  setupHandlers() {
    // Handle /compare command
    this.bot.onText(/\/compare(?:\s+@(\w+))?/, (msg, match) => {
      this.handleCompare(msg, match);
    });
  }

  /**
   * Handle /compare command
   * @param {object} msg - Telegram message object
   * @param {Array} match - Regex match array
   */
  async handleCompare(msg, match) {
    const chatId = msg.chat.id;
    const initiatorId = msg.from.id;
    const initiatorName = this.getDisplayName(msg.from);

    console.log(`[CommandHandler] /compare from ${initiatorName} (${initiatorId}) in chat ${chatId}`);

    // Determine partner (User B)
    let partnerId = null;
    let partnerName = null;

    // Method 1: Reply to a message
    if (msg.reply_to_message) {
      partnerId = msg.reply_to_message.from.id;
      partnerName = this.getDisplayName(msg.reply_to_message.from);
      console.log(`[CommandHandler] Partner detected via reply: ${partnerName} (${partnerId})`);
    }
    // Method 2: Mention with @username
    else if (match[1]) {
      const username = match[1];
      console.log(`[CommandHandler] Partner mentioned: @${username} - need to resolve username to ID`);
      // Note: Telegram Bot API doesn't provide a way to get user ID from username directly
      // We would need to use getChat with the username, but this is limited
      // For now, inform the user to reply to a message instead
      this.bot.sendMessage(chatId,
        `Please reply to @${username}'s message instead of mentioning them.\n\n` +
        `Usage:\n` +
        `1. Reply to User B's message with /compare\n` +
        `2. Or mention them: /compare @username (limited support)`
      );
      return;
    }
    // No partner specified
    else {
      this.bot.sendMessage(chatId,
        'Please specify who you want to compare locations with:\n\n' +
        '1. Reply to their message with /compare\n' +
        '2. Or mention them: /compare @username'
      );
      return;
    }

    // Prevent self-comparison
    if (partnerId === initiatorId) {
      this.bot.sendMessage(chatId, 'You cannot compare locations with yourself!');
      return;
    }

    // Create session
    const session = this.sessionStore.createSession({
      initiatorId,
      partnerId,
      chatId
    });

    // Send invitation to partner (User B)
    // If in a group, send to the group; if private chat, send to the chat
    const invitationChatId = chatId;

    const inlineKeyboard = {
      inline_keyboard: [
        [
          {
            text: '✅ Approve',
            callback_data: `approve:${session.sessionId}`
          },
          {
            text: '❌ Decline',
            callback_data: `decline:${session.sessionId}`
          }
        ]
      ]
    };

    const invitationText = [
      `📍 **Location Comparison Request**`,
      ``,
      `${initiatorName} wants to compare location history with you.`,
      ``,
      `Session ID: \`${session.sessionId.substring(0, 16)}...\``,
      `Expires: ${this.formatExpiryTime(session.expiresAt)}`,
      ``,
      `Click "Approve" to proceed or "Decline" to cancel.`
    ].join('\n');

    this.bot.sendMessage(invitationChatId, invitationText, {
      parse_mode: 'Markdown',
      reply_markup: inlineKeyboard,
      reply_to_message_id: msg.message_id
    }).catch(err => {
      console.error(`[CommandHandler] Failed to send invitation:`, err.message);
      // If we can't send to group, try to send directly to partner via private message
      if (err.code === 'ETELEGRAM' && err.response && err.response.statusCode === 403) {
        this.bot.sendMessage(chatId,
          `Cannot send invitation to ${partnerName}. They may have blocked the bot or not started it yet.`
        );
      }
    });

    // Confirm to initiator
    this.bot.sendMessage(chatId,
      `✅ Comparison request sent to ${partnerName}!\n\n` +
      `They will receive an invitation to approve or decline.`,
      { reply_to_message_id: msg.message_id }
    );
  }

  /**
   * Get display name for a user
   * @param {object} user - Telegram user object
   * @returns {string}
   */
  getDisplayName(user) {
    if (user.first_name && user.last_name) {
      return `${user.first_name} ${user.last_name}`;
    }
    return user.first_name || user.username || `User ${user.id}`;
  }

  /**
   * Format expiry time for display
   * @param {Date} expiryDate
   * @returns {string}
   */
  formatExpiryTime(expiryDate) {
    return expiryDate.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
  }
}

module.exports = CommandHandler;
