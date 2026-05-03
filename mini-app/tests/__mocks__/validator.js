// Mock validator module for mini-app tests
module.exports = {
  validateCoordinate: jest.fn((coord) => {
    if (!coord) return false;
    // Simple validation for lat,lng format
    const parts = coord.split(',');
    if (parts.length !== 2) return false;
    const lat = parseFloat(parts[0].replace(/°/g, '').trim());
    const lng = parseFloat(parts[1].replace(/°/g, '').trim());
    return !isNaN(lat) && !isNaN(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
  }),
  validateDateTime: jest.fn((dt) => {
    if (!dt) return false;
    const date = new Date(dt);
    return !isNaN(date.getTime());
  }),
  validateCsvStructure: jest.fn((headers, fileName) => {
    const requiredHeaders = ['startTime', 'endTime', 'probability', 'latitude', 'longitude', 'source'];
    const missingHeaders = requiredHeaders.filter(h => !headers.includes(h));
    if (missingHeaders.length > 0) {
      return { valid: false, error: `Missing headers: ${missingHeaders.join(', ')}` };
    }
    return { valid: true };
  }),
  validateJsonStructure: jest.fn((data) => {
    if (!data || !data.semanticSegments) {
      return { valid: false, error: 'Invalid JSON structure: missing semanticSegments' };
    }
    return { valid: true };
  }),
  checkAlternativeColumns: jest.fn(() => ({}))
};
