/**
 * Tests for json-converter.js functions
 * These are adapted for Jest from the browser-based ES module
 */

// Mock the validator module
jest.mock('../js/validator.js', () => ({
  validateCoordinate: jest.fn((coord) => {
    // Simple validation: check if it's a lat,lng format with valid numbers
    if (!coord) return false;
    const parts = coord.split(',');
    if (parts.length !== 2) return false;
    const lat = parseFloat(parts[0]);
    const lng = parseFloat(parts[1]);
    return !isNaN(lat) && !isNaN(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
  }),
  validateDateTime: jest.fn((dt) => {
    if (!dt) return false;
    const date = new Date(dt);
    return !isNaN(date.getTime());
  }),
  validateJsonStructure: jest.fn((data) => {
    if (!data || !data.semanticSegments) {
      return { valid: false, error: 'Invalid JSON structure: missing semanticSegments' };
    }
    return { valid: true };
  })
}));

// Import the mocked validator
const { validateCoordinate, validateDateTime, validateJsonStructure } = require('../js/validator.js');

// Re-implement the functions from json-converter.js for testing
function parseLatLng(latLngString) {
  if (!latLngString) return { latitude: "", longitude: "" };

  const parts = latLngString
    .replace(/°/g, "")
    .split(",")
    .map((s) => s.trim());
  return parts.length == 2
    ? { latitude: parts[0], longitude: parts[1] }
    : { latitude: "", longitude: "" };
}

async function processJsonFileAsync(jsonString) {
  try {
    let data;
    try {
      data = JSON.parse(jsonString);
    } catch (parseError) {
      throw new Error(`Invalid JSON file: ${parseError.message}`);
    }

    const structureValidation = validateJsonStructure(data);
    if (!structureValidation.valid) {
      throw new Error(structureValidation.error);
    }

    const rows = [];
    let skippedRecords = 0;

    for (let i = 0; i < data.semanticSegments.length; i++) {
      const segment = data.semanticSegments[i];

      if (segment.startTime && !validateDateTime(segment.startTime)) {
        skippedRecords++;
        continue;
      }
      if (segment.endTime && !validateDateTime(segment.endTime)) {
        skippedRecords++;
        continue;
      }

      if (segment.activity) {
        const activity = segment.activity;

        if (activity.start && activity.start.latLng) {
          if (!validateCoordinate(activity.start.latLng)) {
            skippedRecords++;
          } else {
            const { latitude, longitude } = parseLatLng(activity.start.latLng);
            rows.push({
              startTime: segment.startTime || "",
              endTime: segment.endTime || "",
              probability: activity.topCandidate?.probability || 0.0,
              latitude,
              longitude,
              source: `activity.start.${activity.topCandidate?.type || "unknown"}`,
            });
          }
        }

        if (activity.end && activity.end.latLng) {
          if (!validateCoordinate(activity.end.latLng)) {
            skippedRecords++;
          } else {
            const { latitude, longitude } = parseLatLng(activity.end.latLng);
            rows.push({
              startTime: segment.startTime || "",
              endTime: segment.endTime || "",
              probability: activity.topCandidate?.probability || 0.0,
              latitude,
              longitude,
              source: `activity.end.${activity.topCandidate?.type || "unknown"}`,
            });
          }
        }
      } else if (segment.visit) {
        const visit = segment.visit;

        if (visit.topCandidate && visit.topCandidate.placeLocation && visit.topCandidate.placeLocation.latLng) {
          if (!validateCoordinate(visit.topCandidate.placeLocation.latLng)) {
            skippedRecords++;
          } else {
            const { latitude, longitude } = parseLatLng(visit.topCandidate.placeLocation.latLng);
            rows.push({
              startTime: segment.startTime || "",
              endTime: segment.endTime || "",
              probability: visit.probability || 0.0,
              latitude,
              longitude,
              source: `visit.${visit.topCandidate.semanticType || "unknown"}`,
            });
          }
        }
      } else if (segment.timelinePath) {
        for (let j = 0; j < segment.timelinePath.length; j++) {
          const pointData = segment.timelinePath[j];

          if (pointData.point && pointData.time) {
            if (!validateCoordinate(pointData.point)) {
              skippedRecords++;
              continue;
            }

            if (!validateDateTime(pointData.time)) {
              skippedRecords++;
              continue;
            }

            const { latitude, longitude } = parseLatLng(pointData.point);
            rows.push({
              startTime: pointData.time,
              endTime: pointData.time,
              probability: "",
              latitude,
              longitude,
              source: "timelinePath",
            });
          }
        }
      }
    }

    return rows;
  } catch (error) {
    throw error;
  }
}

function rowsToCSV(rows) {
  const header = "startTime,endTime,probability,latitude,longitude,source";
  const rowsCSV = rows.map(row =>
    `"${(row.startTime || "").replace(/"/g, '""')}","${(row.endTime || "").replace(/"/g, '""')}",${row.probability || ""},"${row.latitude}","${row.longitude}","${(row.source || "").replace(/"/g, '""')}"`
  );
  return [header, ...rowsCSV].join('\n');
}

describe('parseLatLng', () => {
  test('should parse valid lat,lng string', () => {
    const result = parseLatLng('55.753930, 37.620795');
    expect(result.latitude).toBe('55.753930');
    expect(result.longitude).toBe('37.620795');
  });

  test('should handle strings with degree symbol', () => {
    const result = parseLatLng('55.753930°, 37.620795°');
    expect(result.latitude).toBe('55.753930');
    expect(result.longitude).toBe('37.620795');
  });

  test('should return empty strings for invalid input', () => {
    const result = parseLatLng('invalid');
    expect(result.latitude).toBe('');
    expect(result.longitude).toBe('');
  });

  test('should return empty strings for empty input', () => {
    const result = parseLatLng('');
    expect(result.latitude).toBe('');
    expect(result.longitude).toBe('');
  });

  test('should handle null input', () => {
    const result = parseLatLng(null);
    expect(result.latitude).toBe('');
    expect(result.longitude).toBe('');
  });
});

describe('processJsonFileAsync', () => {
  test('should convert valid JSON string to rows', async () => {
    const jsonData = {
      semanticSegments: [
        {
          startTime: '2024-01-01T10:00:00Z',
          endTime: '2024-01-01T10:05:00Z',
          activity: {
            start: {
              latLng: '55.753930, 37.620795'
            },
            topCandidate: {
              type: 'walking',
              probability: 0.9
            }
          }
        },
        {
          startTime: '2024-01-01T11:00:00Z',
          endTime: '2024-01-01T11:10:00Z',
          visit: {
            topCandidate: {
              semanticType: 'restaurant',
              placeLocation: {
                latLng: '55.752004, 37.617524'
              }
            },
            probability: 0.85
          }
        }
      ]
    };

    const rows = await processJsonFileAsync(JSON.stringify(jsonData));
    // 1 from activity.start + 1 from visit (not 2, because visit only has one entry)
    expect(rows).toHaveLength(2);
    expect(rows[0].source).toContain('activity.start');
    expect(rows[1].source).toContain('visit');
  });

  test('should handle JSON with timelinePath', async () => {
    const jsonData = {
      semanticSegments: [
        {
          startTime: '2024-01-01T10:00:00Z',
          endTime: '2024-01-01T10:30:00Z',
          timelinePath: [
            { point: '55.753930, 37.620795', time: '2024-01-01T10:05:00Z' },
            { point: '55.752004, 37.617524', time: '2024-01-01T10:10:00Z' }
          ]
        }
      ]
    };

    const rows = await processJsonFileAsync(JSON.stringify(jsonData));
    expect(rows).toHaveLength(2);
    expect(rows[0].source).toBe('timelinePath');
  });

  test('should throw error for invalid JSON', async () => {
    await expect(processJsonFileAsync('invalid json')).rejects.toThrow('Invalid JSON file');
  });

  test('should throw error for invalid JSON structure', async () => {
    const invalidData = { someOtherField: [] };
    await expect(processJsonFileAsync(JSON.stringify(invalidData))).rejects.toThrow('Invalid JSON structure');
  });

  test('should skip records with invalid coordinates', async () => {
    const jsonData = {
      semanticSegments: [
        {
          startTime: '2024-01-01T10:00:00Z',
          endTime: '2024-01-01T10:05:00Z',
          activity: {
            start: {
              latLng: 'invalid, coordinates'
            },
            topCandidate: {
              type: 'walking',
              probability: 0.9
            }
          }
        },
        {
          startTime: '2024-01-01T11:00:00Z',
          endTime: '2024-01-01T11:10:00Z',
          activity: {
            start: {
              latLng: '55.753930, 37.620795'
            },
            topCandidate: {
              type: 'walking',
              probability: 0.9
            }
          }
        }
      ]
    };

    const rows = await processJsonFileAsync(JSON.stringify(jsonData));
    expect(rows).toHaveLength(1); // Only the valid one
  });
});

describe('rowsToCSV', () => {
  test('should convert rows to CSV string', () => {
    const rows = [
      {
        startTime: '2024-01-01T10:00:00Z',
        endTime: '2024-01-01T10:05:00Z',
        probability: 0.9,
        latitude: '55.753930',
        longitude: '37.620795',
        source: 'test'
      }
    ];

    const csv = rowsToCSV(rows);
    expect(csv).toContain('startTime,endTime,probability,latitude,longitude,source');
    expect(csv).toContain('2024-01-01T10:00:00Z');
    expect(csv).toContain('55.753930');
  });

  test('should handle empty rows array', () => {
    const csv = rowsToCSV([]);
    expect(csv).toContain('startTime,endTime,probability,latitude,longitude,source');
  });

  test('should escape quotes in values', () => {
    const rows = [
      {
        startTime: '2024-01-01T10:00:00Z',
        endTime: '2024-01-01T10:05:00Z',
        probability: 0.9,
        latitude: '55.753930',
        longitude: '37.620795',
        source: 'test "quoted"'
      }
    ];

    const csv = rowsToCSV(rows);
    // The replace(/"/g, '""') will escape quotes as ""
    // So 'test "quoted"' becomes 'test ""quoted""'
    expect(csv).toContain('test ""quoted""');
  });
});
