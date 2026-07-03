const EventEmitter = require('events');

// Mock dependencies
jest.mock('../../app.js', () => ({
  processJsonFileAsync: jest.fn(),
  parseLatLng: jest.fn((lat, lng) => `${lat},${lng}`),
  generateStatisticsSimple: jest.fn(() => [
    { Parameter: 'Total records', Value: '10' },
    { Parameter: 'Date range', Value: '2024-01-01 - 2024-01-02' }
  ])
}));

jest.mock('../../validator.js', () => ({
  validateDateTime: jest.fn(() => true),
  validateCoordinate: jest.fn(() => true),
  validateJsonStructure: jest.fn(() => ({ valid: true }))
}));

// Mock fs promises
jest.mock('fs', () => {
  const actual = jest.requireActual('fs');
  return {
    ...actual,
    promises: {
      mkdir: jest.fn().mockResolvedValue(undefined),
      unlink: jest.fn().mockResolvedValue(undefined),
      writeFile: jest.fn().mockResolvedValue(undefined)
    }
  };
});

// Mock fsSync for the temp dir check
const fsSync = require('fs');
const fsPromises = require('fs').promises;

const DocumentHandler = require('../handlers/document-handler');
const { processJsonFileAsync, generateStatisticsSimple } = require('../../app.js');

function createMockBot() {
  const bot = new EventEmitter();
  bot.sendMessage = jest.fn().mockResolvedValue({ message_id: 1 });
  bot.sendDocument = jest.fn().mockResolvedValue({
    document: { file_id: 'csv-file-id-123' }
  });
  bot.downloadFile = jest.fn().mockResolvedValue('/tmp/matchus-uploads/test.json');
  return bot;
}

function createMockSessionStore() {
  return {
    findSessionByUser: jest.fn(),
    registerUpload: jest.fn()
  };
}

function createMockMsg(overrides = {}) {
  return {
    message_id: 100,
    chat: { id: 12345 },
    from: { id: 67890, username: 'testuser' },
    document: {
      file_name: 'location-data.json',
      file_size: 1024 * 1024, // 1 MB
      file_id: 'telegram-file-id-001',
      mime_type: 'application/json'
    },
    date: Math.floor(Date.now() / 1000),
    ...overrides
  };
}

describe('DocumentHandler', () => {
  let bot, sessionStore, handler;

  beforeEach(() => {
    jest.clearAllMocks();
    bot = createMockBot();
    sessionStore = createMockSessionStore();
    handler = new DocumentHandler(bot, sessionStore);
  });

  describe('constructor', () => {
    test('should register document event handler', () => {
      expect(bot._events.document).toBeDefined();
      expect(typeof bot._events.document).toBe('function');
    });

    test('should set tempDir', () => {
      expect(handler.tempDir).toContain('matchus-uploads');
    });
  });

  describe('handleDocument', () => {
    test('should reject non-JSON files', async () => {
      const msg = createMockMsg({
        document: {
          file_name: 'data.csv',
          file_size: 1000,
          file_id: 'file-csv-001'
        }
      });

      await handler.handleDocument(msg);

      expect(bot.sendMessage).toHaveBeenCalledWith(
        12345,
        expect.stringContaining('.json')
      );
      expect(sessionStore.findSessionByUser).not.toHaveBeenCalled();
    });

    test('should reject oversized files (> 200 MB)', async () => {
      const msg = createMockMsg({
        document: {
          file_name: 'huge.json',
          file_size: 201 * 1024 * 1024,
          file_id: 'file-huge-001'
        }
      });

      await handler.handleDocument(msg);

      expect(bot.sendMessage).toHaveBeenCalledWith(
        12345,
        expect.stringContaining('слишком большой')
      );
    });

    test('should reject when no active session', async () => {
      sessionStore.findSessionByUser.mockReturnValue(null);

      await handler.handleDocument(createMockMsg());

      expect(bot.sendMessage).toHaveBeenCalledWith(
        12345,
        expect.stringContaining('нет активного сравнения')
      );
    });

    test('should process valid file and register upload for initiator', async () => {
      const mockSession = {
        sessionId: 'session-123',
        initiatorId: 67890,
        partnerId: 11111,
        status: 'pending'
      };
      sessionStore.findSessionByUser.mockReturnValue(mockSession);
      processJsonFileAsync.mockResolvedValue([
        { startTime: '2024-01-01T10:00:00Z', endTime: '', probability: null, latitude: '55.753930', longitude: '37.620795', source: 'WIFI' }
      ]);

      await handler.handleDocument(createMockMsg());

      expect(bot.sendMessage).toHaveBeenCalledWith(
        12345,
        expect.stringContaining('Получен файл')
      );
      expect(fsPromises.mkdir).toHaveBeenCalled();
      expect(bot.downloadFile).toHaveBeenCalledWith('telegram-file-id-001', handler.tempDir);
      expect(processJsonFileAsync).toHaveBeenCalled();
      expect(bot.sendDocument).toHaveBeenCalled();
      expect(sessionStore.registerUpload).toHaveBeenCalledWith(
        'session-123', 67890, 'telegram-file-id-001', 'csv-file-id-123', expect.any(String)
      );
    });

    test('should handle processing errors gracefully', async () => {
      const mockSession = {
        sessionId: 'session-123',
        initiatorId: 67890,
        partnerId: 11111
      };
      sessionStore.findSessionByUser.mockReturnValue(mockSession);
      processJsonFileAsync.mockRejectedValue(new Error('Parse error'));

      await handler.handleDocument(createMockMsg());

      expect(bot.sendMessage).toHaveBeenLastCalledWith(
        12345,
        expect.stringContaining('Ошибка обработки')
      );
    });

    test('should notify partner when both files uploaded', async () => {
      const mockSession = {
        sessionId: 'session-123',
        initiatorId: 67890,
        partnerId: 11111,
        chatId: 12345,
        status: 'both_uploaded'
      };
      sessionStore.findSessionByUser.mockReturnValue(mockSession);
      processJsonFileAsync.mockResolvedValue([
        { startTime: '2024-01-01T10:00:00Z', endTime: '', probability: null, latitude: '55.753930', longitude: '37.620795', source: 'WIFI' }
      ]);

      await handler.handleDocument(createMockMsg());

      expect(bot.sendMessage).toHaveBeenCalledWith(
        12345,
        expect.stringContaining('Оба файла получены')
      );
    });
  });

  describe('rowsToCSV', () => {
    test('should convert rows to CSV string with header', () => {
      const rows = [
        { startTime: '2024-01-01T10:00:00Z', endTime: '2024-01-01T10:05:00Z', probability: '0.9', latitude: '55.753930', longitude: '37.620795', source: 'WIFI' },
        { startTime: '2024-01-01T11:00:00Z', endTime: '', probability: null, latitude: '55.752004', longitude: '37.617524', source: 'CELL' }
      ];

      const csv = handler.rowsToCSV(rows);
      const lines = csv.trim().split('\n');

      expect(lines).toHaveLength(3); // header + 2 rows
      expect(lines[0]).toBe('startTime,endTime,probability,latitude,longitude,source');
      expect(lines[1]).toContain('55.753930');
      expect(lines[1]).toContain('WIFI');
    });

    test('should escape quotes in values', () => {
      const rows = [
        { startTime: '2024-01-01T10:00:00Z', endTime: '', probability: null, latitude: '55.753930', longitude: '37.620795', source: 'Test "with" quotes' }
      ];

      const csv = handler.rowsToCSV(rows);
      const lines = csv.trim().split('\n');
      expect(lines).toHaveLength(2);
      // Verify last field has escaped quotes: "Test ""with"" quotes"
      expect(lines[1]).toContain('""with""');
    });

    test('should handle empty rows array', () => {
      const csv = handler.rowsToCSV([]);
      expect(csv.trim()).toBe('startTime,endTime,probability,latitude,longitude,source');
    });
  });

  describe('cleanupFile', () => {
    test('should handle successful deletion', async () => {
      fsPromises.unlink.mockResolvedValueOnce(undefined);
      await handler.cleanupFile('/tmp/test.json');
      expect(fsPromises.unlink).toHaveBeenCalledWith('/tmp/test.json');
    });

    test('should catch errors silently', async () => {
      fsPromises.unlink.mockRejectedValueOnce(new Error('ENOENT'));
      await expect(handler.cleanupFile('/tmp/nonexistent.json')).resolves.toBeUndefined();
    });
  });

  describe('processUserFile', () => {
    test('should return proper result object', async () => {
      const mockRows = [
        { startTime: '2024-01-01T10:00:00Z', endTime: '', probability: null, latitude: '55.753930', longitude: '37.620795', source: 'WIFI' }
      ];
      processJsonFileAsync.mockResolvedValue(mockRows);

      const result = await handler.processUserFile('file-id', 12345);

      expect(result).toHaveProperty('rowsCount', 1);
      expect(result).toHaveProperty('csvString');
      expect(result).toHaveProperty('csvFileId', 'csv-file-id-123');
      expect(result).toHaveProperty('statistics');
    });

    test('should throw error for empty rows', async () => {
      processJsonFileAsync.mockResolvedValue([]);

      await expect(
        handler.processUserFile('file-id', 12345)
      ).rejects.toThrow('Не найдено записей');
    });
  });
});
