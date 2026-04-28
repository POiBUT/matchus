const { parseLatLng, getMinMaxDatesSafe } = require('./app');

describe('parseLatLng', () => {
  test('should parse valid latLng string', () => {
    expect(parseLatLng('50.123°, 30.456°')).toEqual({ latitude: '50.123', longitude: '30.456' });
  });
  
  test('should handle empty input', () => {
    expect(parseLatLng('')).toEqual({ latitude: '', longitude: '' });
  });
  
  test('should handle null/undefined', () => {
    expect(parseLatLng(null)).toEqual({ latitude: '', longitude: '' });
    expect(parseLatLng(undefined)).toEqual({ latitude: '', longitude: '' });
  });

  test('should handle string without degree symbol', () => {
    expect(parseLatLng('50.123, 30.456')).toEqual({ latitude: '50.123', longitude: '30.456' });
  });

  test('should handle invalid format', () => {
    expect(parseLatLng('invalid')).toEqual({ latitude: '', longitude: '' });
  });
});

describe('getMinMaxDatesSafe', () => {
  test('should return null for empty array', () => {
    expect(getMinMaxDatesSafe([])).toEqual({ min: null, max: null });
  });
  
  test('should find min and max dates', () => {
    const dates = [new Date('2024-01-01'), new Date('2024-01-03'), new Date('2024-01-02')];
    const result = getMinMaxDatesSafe(dates);
    expect(result.min).toEqual(new Date('2024-01-01'));
    expect(result.max).toEqual(new Date('2024-01-03'));
  });

  test('should handle single date', () => {
    const date = new Date('2024-01-01');
    const result = getMinMaxDatesSafe([date]);
    expect(result.min).toEqual(date);
    expect(result.max).toEqual(date);
  });
});
