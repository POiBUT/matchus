const { roundCoordinate, isTimeMatch } = require('./compare-tool');

describe('roundCoordinate', () => {
  test('should round to 3 decimal places by default', () => {
    expect(roundCoordinate('50.123456')).toBe(50.123);
    expect(roundCoordinate('50.123')).toBe(50.123);
  });
  
  test('should handle null/undefined', () => {
    expect(roundCoordinate(null)).toBeNull();
    expect(roundCoordinate(undefined)).toBeNull();
  });
  
  test('should respect custom precision', () => {
    expect(roundCoordinate('50.123456', 4)).toBe(50.1235);
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
  
  test('should handle invalid inputs', () => {
    expect(isTimeMatch(null, '2024-01-01')).toBe(false);
    expect(isTimeMatch('2024-01-01', null)).toBe(false);
  });
});
