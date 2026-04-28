const { validateCoordinate, validateDateTime } = require('./validator');

describe('validateCoordinate', () => {
  test('should return true for valid coordinates', () => {
    expect(validateCoordinate('50.123')).toBe(true);
    expect(validateCoordinate(50.123)).toBe(true);
    expect(validateCoordinate('50')).toBe(true);
    expect(validateCoordinate(50)).toBe(true);
  });
  
  test('should return false for invalid coordinates', () => {
    expect(validateCoordinate('abc')).toBe(false);
    expect(validateCoordinate(null)).toBe(false);
    expect(validateCoordinate(undefined)).toBe(false);
    expect(validateCoordinate('')).toBe(false);
  });

  test('should validate latLng string format', () => {
    expect(validateCoordinate('50.123, 30.456')).toBe(true);
    expect(validateCoordinate('50.123°, 30.456°')).toBe(true);
  });

  test('should return false for invalid latLng string', () => {
    expect(validateCoordinate('abc, def')).toBe(false);
    expect(validateCoordinate('50.123')).toBe(true);
  });
});

describe('validateDateTime', () => {
  test('should return true for valid dates', () => {
    expect(validateDateTime('2024-01-01T10:00:00Z')).toBe(true);
    expect(validateDateTime('2024-01-01')).toBe(true);
    expect(validateDateTime('2024-01-01T10:00:00.000Z')).toBe(true);
  });
  
  test('should return false for invalid dates', () => {
    expect(validateDateTime('invalid-date')).toBe(false);
    expect(validateDateTime(null)).toBe(false);
    expect(validateDateTime(undefined)).toBe(false);
    expect(validateDateTime('')).toBe(false);
  });

  test('should return false for invalid date objects', () => {
    expect(validateDateTime('2024-13-01')).toBe(false);
    expect(validateDateTime('2024-01-32')).toBe(false);
  });
});
