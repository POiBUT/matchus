const path = require('path');
const os = require('os');
const fs = require('fs').promises;
const fsSync = require('fs');

const { processJsonFileAsync, parseLatLng, generateStatisticsSimple } = require('../../app.js');
const { validateDateTime, validateCoordinate, validateJsonStructure } = require('../../validator.js');

const MAX_FILE_SIZE_MB = 200;

class DocumentHandler {
  constructor(bot, sessionStore) {
    this.bot = bot;
    this.sessionStore = sessionStore;
    this.tempDir = path.join(os.tmpdir(), 'matchus-uploads');
    this.setupHandlers();
  }

  setupHandlers() {
    this.bot.on('document', (msg) => {
      this.handleDocument(msg);
    });
  }

  async handleDocument(msg) {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const document = msg.document;

    if (!document.file_name?.endsWith('.json')) {
      return this.bot.sendMessage(chatId,
        'Пожалуйста, отправьте файл в формате .json (Google Takeout Location History).\n' +
        'Используйте /howto для инструкции.'
      );
    }

    // Check file size
    if (document.file_size > MAX_FILE_SIZE_MB * 1024 * 1024) {
      return this.bot.sendMessage(chatId,
        `❌ Файл слишком большой (${(document.file_size / 1024 / 1024).toFixed(1)} MB). Максимум ${MAX_FILE_SIZE_MB} MB.`
      );
    }

    // Find active session
    const session = this.sessionStore.findSessionByUser(userId);
    if (!session) {
      return this.bot.sendMessage(chatId,
        'У вас нет активного сравнения. Сначала используйте /compare @username в чате с другим пользователем.'
      );
    }

    const isInitiator = userId === session.initiatorId;
    const role = isInitiator ? 'инициатор' : 'партнёр';

    await this.bot.sendMessage(chatId,
      `📥 Получен файл: ${document.file_name} (${(document.file_size / 1024 / 1024).toFixed(1)} MB)\n` +
      `Выступаете как: ${role}\n⏳ Обрабатываю...`
    );

    try {
      const result = await this.processUserFile(document.file_id, chatId);

      // Register upload in session
      this.sessionStore.registerUpload(
        session.sessionId, userId,
        document.file_id,
        result.csvFileId,
        result.csvString
      );

      await this.bot.sendMessage(chatId,
        `✅ Файл обработан! Получено ${result.rowsCount} записей.\n` +
        `📊 ${result.statistics}`
      );

      // Check if both files uploaded -> notify partner
      this.notifyPartnerIfReady(session, chatId);

    } catch (error) {
      console.error(`[DocumentHandler] Error processing file for user ${userId}:`, error.message);
      await this.bot.sendMessage(chatId,
        `❌ Ошибка обработки файла: ${error.message}`
      );
    }
  }

  async processUserFile(fileId, chatId) {
    // Ensure temp directory exists
    await fs.mkdir(this.tempDir, { recursive: true });

    // Download file from Telegram
    const localPath = await this.bot.downloadFile(fileId, this.tempDir);
    console.log(`[DocumentHandler] Downloaded file to ${localPath}`);

    // Process through app.js logic
    const rows = await processJsonFileAsync(localPath);

    if (rows.length === 0) {
      throw new Error('Не найдено записей местоположений в файле. Проверьте, что это Google Takeout Location History JSON.');
    }

    // Convert rows to CSV string
    const csvString = this.rowsToCSV(rows);

    // Upload CSV back to Telegram for reference
    const csvBuffer = Buffer.from(csvString, 'utf-8');
    const csvFileName = `converted_${path.basename(localPath).replace('.json', '')}.csv`;

    // Use temp file for re-upload
    const csvTempPath = path.join(this.tempDir, csvFileName);
    await fs.writeFile(csvTempPath, csvBuffer);

    const uploadResult = await this.bot.sendDocument(chatId, csvTempPath, {
      caption: `📊 Конвертированные данные (${rows.length} записей)`
    });

    const csvFileId = uploadResult.document.file_id;

    // Clean up temp files
    this.cleanupFile(localPath);
    this.cleanupFile(csvTempPath);

    // Generate brief statistics
    const stats = generateStatisticsSimple(rows);
    const statsLine = stats
      .filter(s => s.Value)
      .map(s => `${s.Parameter}: ${s.Value}`)
      .slice(0, 5)
      .join('\n');

    return {
      rowsCount: rows.length,
      csvString,
      csvFileId,
      statistics: statsLine
    };
  }

  rowsToCSV(rows) {
    const header = 'startTime,endTime,probability,latitude,longitude,source';
    const lines = rows.map(row =>
      `"${(row.startTime || '').replace(/"/g, '""')}","${(row.endTime || '').replace(/"/g, '""')}",${row.probability ?? ''},"${row.latitude}","${row.longitude}","${(row.source || '').replace(/"/g, '""')}"`
    );
    return [header, ...lines].join('\n');
  }

  notifyPartnerIfReady(session, chatId) {
    if (session.status !== 'both_uploaded') return;

    const partnerId = session.partnerId;

    this.bot.sendMessage(chatId,
      '✅ Оба файла получены! Инициатор может открыть Mini App для просмотра результатов:\n' +
      'https://t.me/your_bot?start=compare_' + session.sessionId
    ).catch(() => {});

    // Notify partner too
    this.bot.sendMessage(session.chatId || chatId,
      '✅ Оба файла загружены! Инициатор запускает сравнение...'
    ).catch(() => {});
  }

  cleanupFile(filePath) {
    return fs.unlink(filePath).catch(() => {});
  }
}

module.exports = DocumentHandler;
