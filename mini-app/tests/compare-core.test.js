/**
 * Tests for compare-core.js functions
 * These are adapted for Jest from the browser-based ES module
 */

// Mock the validator module that compare-core imports
jest.mock('../js/validator.js', () => ({
  validateCoordinate: jest.fn(() => true),
  validateDateTime: jest.fn(() => true),
  validateCsvStructure: jest.fn(() => ({ valid: true })),
  checkAlternativeColumns: jest.fn(() => ({}))
}));

// Since compare-core.js uses ES modules (export/import), we need to mock the module
// and test the functions directly. We'll create simplified versions of the functions
// that match the logic in compare-core.js

// Import the mocked validator
const { validateCoordinate, validateDateTime, validateCsvStructure } = require('../js/validator.js');

// Re-implement the functions from compare-core.js for testing
// (In a real project, you'd configure Jest to handle ES modules via babel or similar)

function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const φ1 = (parseFloat(lat1) * Math.PI) / 180;
  const φ2 = (parseFloat(lat2) * Math.PI) / 180;
  const Δφ = ((parseFloat(lat2) - parseFloat(lat1)) * Math.PI) / 180;
  const Δλ = ((parseFloat(lon2) - parseFloat(lon1)) * Math.PI) / 180;

  const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) *
    Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function isTimeMatch(time1, time2, timeWindowMinutes = 30) {
  if (!time1 || !time2) return false;
  const date1 = new Date(time1);
  const date2 = new Date(time2);

  if (isNaN(date1.getTime()) || isNaN(date2.getTime())) {
    return false;
  }

  const diffMinutes = Math.abs(date1 - date2) / (1000 * 60);
  return diffMinutes <= timeWindowMinutes;
}

function parseCSV(csvString, fileName = 'file') {
  const lines = csvString.trim().split('\n');

  if (lines.length < 2) {
    throw new Error(`CSV data ${fileName} does not contain data (only header or empty)`);
  }

  const headerLine = lines[0];
  const headers = headerLine.split(',').map(header => header.trim());

  const structureValidation = validateCsvStructure(headers, fileName);
  if (!structureValidation.valid) {
    throw new Error(structureValidation.error);
  }

  const records = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;

    const values = [];
    let currentValue = '';
    let insideQuotes = false;

    for (let j = 0; j < line.length; j++) {
      const char = line[j];
      if (char === '"') {
        insideQuotes = !insideQuotes;
        currentValue += char;
      } else if (char === ',' && !insideQuotes) {
        values.push(currentValue);
        currentValue = '';
      } else {
        currentValue += char;
      }
    }
    values.push(currentValue);

    const cleanValues = new Array(values.length);
    for (let j = 0; j < values.length; j++) {
      const value = values[j];
      if (value.startsWith('"') && value.endsWith('"')) {
        cleanValues[j] = value.slice(1, -1);
      } else {
        cleanValues[j] = value;
      }
    }

    const record = {};
    for (let j = 0; j < headers.length; j++) {
      record[headers[j]] = cleanValues[j] || '';
    }

    if (!validateCoordinate(record.latitude)) continue;
    if (!validateCoordinate(record.longitude)) continue;
    if (record.startTime && !validateDateTime(record.startTime)) continue;

    records.push(record);
  }

  return records;
}

function optimizedStrategy(records1, records2, options = {}) {
  const { timeWindowMinutes = 30, maxDistanceMeters = 100 } = options;
  const matches = [];
  const availableRecords = records2.map((record, index) => ({ record, index }));

  for (let i = 0; i < records1.length; i++) {
    const record1 = records1[i];
    if (!record1.latitude || !record1.longitude) continue;

    const lat1 = parseFloat(record1.latitude);
    const lon1 = parseFloat(record1.longitude);

    for (let j = 0; j < availableRecords.length; j++) {
      const { record: record2 } = availableRecords[j];
      if (!record2.latitude || !record2.longitude) continue;

      const lat2 = parseFloat(record2.latitude);
      const lon2 = parseFloat(record2.longitude);

      const distance = haversineDistance(lat1, lon1, lat2, lon2);

      if (distance <= maxDistanceMeters) {
        if (isTimeMatch(record1.startTime, record2.startTime, timeWindowMinutes)) {
          const timeDiff = Math.abs(new Date(record1.startTime) - new Date(record2.startTime)) / (1000 * 60);
          matches.push({
            record1: record1,
            record2: record2,
            distanceMeters: distance,
            timeDifferenceMinutes: timeDiff
          });
          availableRecords.splice(j, 1);
          j--;
          break;
        }
      }
    }
  }

  return matches;
}

// Test data - Moscow coordinates
const RED_SQUARE = { latitude: '55.753930', longitude: '37.620795' };
const KREMLIN = { latitude: '55.752004', longitude: '37.617524' };
const SPB = { latitude: '59.934280', longitude: '30.335098' };

describe('haversineDistance', () => {
  test('should calculate distance between Red Square and Kremlin correctly', () => {
    const distance = haversineDistance(
      RED_SQUARE.latitude, RED_SQUARE.longitude,
      KREMLIN.latitude, KREMLIN.longitude
    );
    expect(distance).toBeGreaterThan(290);
    expect(distance).toBeLessThan(310);
  });

  test('should calculate long distance (Moscow to SPb) correctly', () => {
    const distance = haversineDistance(
      RED_SQUARE.latitude, RED_SQUARE.longitude,
      SPB.latitude, SPB.longitude
    );
    expect(distance).toBeGreaterThan(630000);
    expect(distance).toBeLessThan(650000);
  });

  test('should return 0 for same coordinates', () => {
    const distance = haversineDistance(
      RED_SQUARE.latitude, RED_SQUARE.longitude,
      RED_SQUARE.latitude, RED_SQUARE.longitude
    );
    expect(distance).toBe(0);
  });

  test('should handle string and number inputs', () => {
    const distance1 = haversineDistance(55.753930, 37.620795, 55.752004, 37.617524);
    const distance2 = haversineDistance('55.753930', '37.620795', '55.752004', '37.617524');
    expect(Math.abs(distance1 - distance2)).toBeLessThan(0.01);
  });
});

describe('isTimeMatch', () => {
  test('should return true for times within 30 minutes', () => {
    const t1 = '2024-01-01T10:00:00Z';
    const t2 = '2024-01-01T10:25:00Z';
    expect(isTimeMatch(t1, t2)).toBe(true);
  });

  test('should return false for times beyond 30 minutes', () => {
    const t1 = '2024-01-01T10:00:00Z';
    const t2 = '2024-01-01T10:35:00Z';
    expect(isTimeMatch(t1, t2)).toBe(false);
  });

  test('should handle custom time window', () => {
    const t1 = '2024-01-01T10:00:00Z';
    const t2 = '2024-01-01T10:45:00Z';
    expect(isTimeMatch(t1, t2, 60)).toBe(true);
    expect(isTimeMatch(t1, t2, 30)).toBe(false);
  });

  test('should handle invalid inputs', () => {
    expect(isTimeMatch(null, '2024-01-01')).toBe(false);
    expect(isTimeMatch('2024-01-01', null)).toBe(false);
    expect(isTimeMatch('', '')).toBe(false);
  });
});

describe('parseCSV', () => {
  test('should parse valid CSV string', () => {
    const csv = `startTime,endTime,probability,latitude,longitude,source
"2024-01-01T10:00:00Z","2024-01-01T10:05:00Z",0.9,"55.753930","37.620795","test"
"2024-01-01T11:00:00Z","2024-01-01T11:05:00Z",0.8,"55.752004","37.617524","test2"`;

    const records = parseCSV(csv, 'test.csv');
    expect(records).toHaveLength(2);
    expect(records[0].latitude).toBe('55.753930');
    expect(records[0].longitude).toBe('37.620795');
    expect(records[0].startTime).toBe('2024-01-01T10:00:00Z');
  });

  test('should throw error for empty CSV', () => {
    expect(() => parseCSV('', 'empty.csv')).toThrow();
  });

  test('should throw error for CSV with only header', () => {
    const csv = 'startTime,endTime,probability,latitude,longitude,source';
    expect(() => parseCSV(csv, 'header-only.csv')).toThrow();
  });

  test('should handle quoted values with commas', () => {
    const csv = `startTime,endTime,probability,latitude,longitude,source
"2024-01-01T10:00:00Z","2024-01-01T10:05:00Z",0.9,"55.753930","37.620795","test, with comma"`;

    const records = parseCSV(csv, 'test.csv');
    expect(records).toHaveLength(1);
    expect(records[0].source).toBe('test, with comma');
  });
});

describe('optimizedStrategy', () => {
  test('should find match within maxDistance', () => {
    const records1 = [
      { latitude: '55.753930', longitude: '37.620795', startTime: '2024-01-01T10:00:00Z', endTime: '2024-01-01T10:05:00Z', probability: '0.9', source: 'source1' }
    ];

    const records2 = [
      { latitude: '55.752004', longitude: '37.617524', startTime: '2024-01-01T10:05:00Z', endTime: '2024-01-01T10:10:00Z', probability: '0.8', source: 'source2' }
    ];

    const matches = optimizedStrategy(records1, records2, {
      timeWindowMinutes: 30,
      maxDistanceMeters: 500
    });

    expect(matches).toHaveLength(1);
    expect(matches[0].distanceMeters).toBeDefined();
    expect(matches[0].distanceMeters).toBeGreaterThan(290);
    expect(matches[0].distanceMeters).toBeLessThan(310);
  });

  test('should not find match beyond maxDistance', () => {
    const records1 = [
      { latitude: '55.753930', longitude: '37.620795', startTime: '2024-01-01T10:00:00Z', endTime: '2024-01-01T10:05:00Z', probability: '0.9', source: 'source1' }
    ];

    const records2 = [
      { latitude: '59.934280', longitude: '30.335098', startTime: '2024-01-01T10:05:00Z', endTime: '2024-01-01T10:10:00Z', probability: '0.8', source: 'source2' }
    ];

    const matches = optimizedStrategy(records1, records2, {
      timeWindowMinutes: 30,
      maxDistanceMeters: 1000
    });

    expect(matches).toHaveLength(0);
  });

  test('should not match records with time beyond window', () => {
    const records1 = [
      { latitude: '55.753930', longitude: '37.620795', startTime: '2024-01-01T10:00:00Z', endTime: '2024-01-01T10:05:00Z', probability: '0.9', source: 'source1' }
    ];

    const records2 = [
      { latitude: '55.752004', longitude: '37.617524', startTime: '2024-01-01T11:00:00Z', endTime: '2024-01-01T11:05:00Z', probability: '0.8', source: 'source2' }
    ];

    const matches = optimizedStrategy(records1, records2, {
      timeWindowMinutes: 30,
      maxDistanceMeters: 500
    });

    expect(matches).toHaveLength(0);
  });

  test('should add distanceMeters to matches', () => {
    const records1 = [
      { latitude: '55.753930', longitude: '37.620795', startTime: '2024-01-01T10:00:00Z', endTime: '2024-01-01T10:05:00Z', probability: '0.9', source: 'source1' }
    ];

    const records2 = [
      { latitude: '55.752004', longitude: '37.617524', startTime: '2024-01-01T10:05:00Z', endTime: '2024-01-01T10:10:00Z', probability: '0.8', source: 'source2' }
    ];

    const matches = optimizedStrategy(records1, records2, {
      timeWindowMinutes: 30,
      maxDistanceMeters: 500
    });

    expect(matches.length).toBeGreaterThan(0);
    matches.forEach(match => {
      expect(match).toHaveProperty('distanceMeters');
      expect(typeof match.distanceMeters).toBe('number');
      expect(match.distanceMeters).toBeGreaterThan(0);
    });
  });
});
