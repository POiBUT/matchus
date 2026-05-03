/**
 * Callback handler for inline keyboard button clicks
 * Handles: approve:sessionId and decline:sessionId
 */

class CallbackHandler {
  constructor(bot, sessionStore, config) {
    this.bot = bot;
    this.sessionStore = sessionStore;
    this.config = config;
    this.setupHandlers();
  }

  setupHandlers() {
    // Handle callback queries from inline keyboard
    this.bot.on('callback_query', (callbackQuery) => {
      this.handleCallbackQuery(callbackQuery);
    });
  }

  /**
   * Handle callback query from inline keyboard
   * @param {object} callbackQuery - Telegram callback_query object
   */
  async handleCallbackQuery(callbackQuery) {
    const data = callbackQuery.data;
    const userId = callbackQuery.from.id;
    const userName = this.getDisplayName(callbackQuery.from);
    const chatId = callbackQuery.message.chat.id;
    const messageId = callbackQuery.message.message_id;

    console.log(`[CallbackHandler] Callback from ${userName} (${userId}): ${data}`);

    // Parse callback data (format: action:sessionId)
    const [action, sessionId] = data.split(':');

    if (!sessionId) {
      this.answerCallbackQuery(callbackQuery.id, 'Invalid callback data', true);
      return;
    }

    // Get session
    const session = this.sessionStore.getSession(sessionId);

    if (!session) {
      this.answerCallbackQuery(callbackQuery.id, 'Session not found or expired', true);
      this.bot.editMessageText('❌ This comparison request has expired or was not found.', {
        chat_id: chatId,
        message_id: messageId
      }).catch(err => console.error('Failed to edit message:', err));
      return;
    }

    // Verify that the user clicking is the partner (User B)
    if (userId !== session.partnerId) {
      this.answerCallbackQuery(callbackQuery.id, 'This invitation is not for you', true);
      return;
    }

    // Handle approve or decline
    if (action === 'approve') {
      await this.handleApprove(callbackQuery, session, chatId, messageId);
    } else if (action === 'decline') {
      await this.handleDecline(callbackQuery, session, chatId, messageId);
    } else {
      this.answerCallbackQuery(callbackQuery.id, 'Unknown action', true);
    }
  }

  /**
   * Handle approval of comparison request
   * @param {object} callbackQuery
   * @param {object} session
   * @param {number} chatId
   * @param {number} messageId
   */
  async handleApprove(callbackQuery, session, chatId, messageId) {
    const userId = callbackQuery.from.id;

    // Update session status
    this.sessionStore.updateStatus(session.sessionId, 'approved');

    // Answer callback query
    this.answerCallbackQuery(callbackQuery.id, '✅ Comparison approved!');

    // Update the invitation message
    const approvedText = [
      `✅ **Comparison Approved**`,
      ``,
      `User ${this.getDisplayName(callbackQuery.from)} has approved the location comparison.`,
      ``,
      `Setting up the Mini App...`
    ].join('\n');

    this.bot.editMessageText(approvedText, {
      chat_id: chatId,
      message_id: messageId,
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: [] } // Remove buttons
    }).catch(err => console.error('Failed to edit message:', err));

    // Generate Mini App URLs
    const miniAppUrl = this.config.miniAppUrl || 'https://your-mini-app-url.com';
    const initiatorUrl = `${miniAppUrl}/?session=${session.sessionId}&role=initiator`;
    const partnerUrl = `${miniAppUrl}/?session=${session.sessionId}&role=partner`;

    // Send Mini App URL to initiator (User A)
    this.bot.sendMessage(session.chatId || chatId,
      `🎉 **Comparison Approved!**\n\n` +
      `User ${this.getDisplayName(callbackQuery.from)} has approved the location comparison.\n\n` +
      `Click the button below to open the Mini App as Initiator.`,
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [[{
            text: 'Открыть приложение',
            web_app: { url: initiatorUrl }
          }]]
        }
      }
    ).catch(err => console.error('Failed to send to initiator:', err));

    // Send Mini App URL to partner (User B) - try to send via private message
    try {
      await this.bot.sendMessage(session.partnerId,
        `🎉 **Comparison Approved!**\n\n` +
        `You approved the location comparison with User ${session.initiatorId}.\n\n` +
        `Click the button below to open the Mini App as Partner.`,
        {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [[{
              text: 'Открыть приложение',
              web_app: { url: partnerUrl }
            }]]
          }
        }
      );
    } catch (err) {
      console.error('Failed to send private message to partner:', err.message);
      // Fallback: send in the same chat with web_app button
      this.bot.sendMessage(session.chatId || chatId,
        `📍 Partner: Please check your private messages for the Mini App link, or click the button below:`,
        {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [[{
              text: 'Открыть приложение (Partner)',
              web_app: { url: partnerUrl }
            }]]
          }
        }
      ).catch(err => console.error('Failed to send fallback message:', err));
    }

    console.log(`[CallbackHandler] Session ${session.sessionId} approved, Mini App URLs sent`);
  }

  /**
   * Handle decline of comparison request
   * @param {object} callbackQuery
   * @param {object} session
   * @param {number} chatId
   * @param {number} messageId
   */
  async handleDecline(callbackQuery, session, chatId, messageId) {
    // Update session status
    this.sessionStore.updateStatus(session.sessionId, 'declined');

    // Answer callback query
    this.answerCallbackQuery(callbackQuery.id, '❌ Comparison declined');

    // Update the invitation message
    const declinedText = [
      `❌ **Comparison Declined**`,
      ``,
      `User ${this.getDisplayName(callbackQuery.from)} has declined the location comparison.`
    ].join('\n');

    this.bot.editMessageText(declinedText, {
      chat_id: chatId,
      message_id: messageId,
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: [] } // Remove buttons
    }).catch(err => console.error('Failed to edit message:', err));

    // Notify initiator
    this.bot.sendMessage(session.chatId || chatId,
      `❌ User ${this.getDisplayName(callbackQuery.from)} has declined the location comparison.`,
      { parse_mode: 'Markdown' }
    ).catch(err => console.error('Failed to notify initiator:', err));

    // Clean up session after a delay
    setTimeout(() => {
      this.sessionStore.deleteSession(session.sessionId);
    }, 60000); // Delete after 1 minute

    console.log(`[CallbackHandler] Session ${session.sessionId} declined`);
  }

  /**
   * Answer callback query
   * @param {string} callbackQueryId
   * @param {string} text
   * @param {boolean} showAlert
   */
  answerCallbackQuery(callbackQueryId, text, showAlert = false) {
    this.bot.answerCallbackQuery(callbackQueryId, {
      text,
      show_alert: showAlert
    }).catch(err => console.error('Failed to answer callback query:', err));
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
}

module.exports = CallbackHandler;
