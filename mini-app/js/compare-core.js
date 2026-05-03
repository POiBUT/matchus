/**
 * Compare Core Module - Pure comparison functions adapted for browser
 * Adapted from compare-tool.js
 */

import { validateCoordinate, validateDateTime, validateCsvStructure, checkAlternativeColumns } from './validator.js';

/**
 * Calculate distance between two points using Haversine formula
 * @param {number} lat1 - latitude of first point
 * @param {number} lon1 - longitude of first point
 * @param {number} lat2 - latitude of second point
 * @param {number} lon2 - longitude of second point
 * @returns {number} - distance in meters
 */
export function haversineDistance(lat1, lon1, lat2, lon2) {
    // Earth's radius in meters
    const R = 6371000;
    // Convert to radians
    const φ1 = (parseFloat(lat1) * Math.PI) / 180;
    const φ2 = (parseFloat(lat2) * Math.PI) / 180;
    const Δφ = ((parseFloat(lat2) - parseFloat(lat1)) * Math.PI) / 180;
    const Δλ = ((parseFloat(lon2) - parseFloat(lon1)) * Math.PI) / 180;

    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
        Math.cos(φ1) * Math.cos(φ2) *
        Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c; // Distance in meters
}

/**
 * Parse CSV string with validation
 * @param {string} csvString - CSV content as string
 * @param {string} fileName - file name for error messages
 * @returns {Array} - array of records
 */
export function parseCSV(csvString, fileName = 'file') {
    const lines = csvString.trim().split('\n');

    if (lines.length < 2) {
        throw new Error(`CSV data ${fileName} does not contain data (only header or empty)`);
    }

    // Parse headers (first line)
    const headerLine = lines[0];
    const headers = headerLine.split(',').map(header => header.trim());

    // Validate CSV structure
    const structureValidation = validateCsvStructure(headers, fileName);
    if (!structureValidation.valid) {
        throw new Error(structureValidation.error);
    }

    // Use mapping if alternative names are present
    const mapping = structureValidation.mapping || null;

    const records = [];
    let validRecords = 0;
    let invalidRecords = 0;

    // Use classic for for performance
    for (let i = 1; i < lines.length; i++) {
        const line = lines[i];

        // Skip empty lines
        if (!line.trim()) continue;

        // Parse line considering quotes
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
        values.push(currentValue); // Add last value

        // Remove quotes from values
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

        // If using alternative name mapping, create record with correct names
        if (mapping) {
            const normalizedRecord = {};
            for (const [standardName, originalName] of Object.entries(mapping)) {
                normalizedRecord[standardName] = record[originalName] || '';
            }
            // Add remaining fields as is
            for (const [key, value] of Object.entries(record)) {
                if (!Object.values(mapping).includes(key)) {
                    normalizedRecord[key] = value;
                }
            }
            record.normalized = normalizedRecord;
        }

        // Validate record data
        const recordToValidate = mapping ? record.normalized : record;

        // Check coordinates
        if (!validateCoordinate(recordToValidate.latitude)) {
            invalidRecords++;
            continue;
        }

        if (!validateCoordinate(recordToValidate.longitude)) {
            invalidRecords++;
            continue;
        }

        // Check time (if present)
        if (recordToValidate.startTime && !validateDateTime(recordToValidate.startTime)) {
            invalidRecords++;
            continue;
        }

        // Add normalized data to record
        if (mapping) {
            Object.assign(record, record.normalized);
            delete record.normalized;
        }

        records.push(record);
        validRecords++;
    }

    console.log(`CSV ${fileName}: processed ${validRecords} valid records, skipped ${invalidRecords} invalid`);

    return records;
}

/**
 * Check if times match within a time window
 * @param {string} time1 - first record time
 * @param {string} time2 - second record time
 * @param {number} timeWindowMinutes - time window in minutes
 * @returns {boolean} - whether times match
 */
export function isTimeMatch(time1, time2, timeWindowMinutes = 30) {
    if (!time1 || !time2) return false;
    const date1 = new Date(time1);
    const date2 = new Date(time2);

    // Check date validity
    if (isNaN(date1.getTime()) || isNaN(date2.getTime())) {
        return false;
    }

    const diffMinutes = Math.abs(date1 - date2) / (1000 * 60);
    return diffMinutes <= timeWindowMinutes;
}

/**
 * Bruteforce strategy: nested loops using for
 * @param {Array} records1 - first file records
 * @param {Array} records2 - second file records
 * @param {Object} options - options
 * @returns {Array} - found matches
 */
export function bruteforceStrategy(records1, records2, options = {}) {
    const { timeWindowMinutes = 30, maxDistanceMeters = 100 } = options;
    const matches = [];
    const usedIndices = new Set();

    // Use classic for for maximum performance
    for (let i = 0; i < records1.length; i++) {
        const record1 = records1[i];

        if (!record1.latitude || !record1.longitude) continue;

        const lat1 = parseFloat(record1.latitude);
        const lon1 = parseFloat(record1.longitude);

        for (let j = 0; j < records2.length; j++) {
            // Skip already used records
            if (usedIndices.has(j)) continue;

            const record2 = records2[j];

            if (!record2.latitude || !record2.longitude) continue;

            const lat2 = parseFloat(record2.latitude);
            const lon2 = parseFloat(record2.longitude);

            // Check distance between coordinates
            const distance = haversineDistance(lat1, lon1, lat2, lon2);

            if (distance <= maxDistanceMeters) {
                // Check time match
                if (isTimeMatch(record1.startTime, record2.startTime, timeWindowMinutes)) {
                    const timeDiff = Math.abs(new Date(record1.startTime) - new Date(record2.startTime)) / (1000 * 60);

                    matches.push({
                        record1: record1,
                        record2: record2,
                        distanceMeters: distance,
                        timeDifferenceMinutes: timeDiff
                    });

                    usedIndices.add(j);
                    break;
                }
            }
        }
    }

    return matches;
}

/**
 * Optimized strategy: search with record removal after matching
 * @param {Array} records1 - first file records
 * @param {Array} records2 - second file records
 * @param {Object} options - options
 * @returns {Array} - found matches
 */
export function optimizedStrategy(records1, records2, options = {}) {
    const { timeWindowMinutes = 30, maxDistanceMeters = 100 } = options;
    const matches = [];

    // Create array of available records from records2
    const availableRecords = records2.map((record, index) => ({ record, index }));

    // Search for matches
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

            // Check distance between coordinates
            const distance = haversineDistance(lat1, lon1, lat2, lon2);

            if (distance <= maxDistanceMeters) {
                // Check time match
                if (isTimeMatch(record1.startTime, record2.startTime, timeWindowMinutes)) {
                    const timeDiff = Math.abs(new Date(record1.startTime) - new Date(record2.startTime)) / (1000 * 60);

                    matches.push({
                        record1: record1,
                        record2: record2,
                        distanceMeters: distance,
                        timeDifferenceMinutes: timeDiff
                    });

                    // Remove used record from available
                    availableRecords.splice(j, 1);
                    j--;

                    break; // Break after finding match
                }
            }
        }
    }

    return matches;
}

/**
 * Simple strategy: using forEach (less performant)
 * @param {Array} records1 - first file records
 * @param {Array} records2 - second file records
 * @param {Object} options - options
 * @returns {Array} - found matches
 */
export function simpleStrategy(records1, records2, options = {}) {
    const { timeWindowMinutes = 30, maxDistanceMeters = 100 } = options;
    const matches = [];
    const processedIndices = new Set();

    // Search for matches
    records1.forEach((record1, index1) => {
        if (!record1.latitude || !record1.longitude) return;

        const lat1 = parseFloat(record1.latitude);
        const lon1 = parseFloat(record1.longitude);

        records2.forEach((record2, index2) => {
            // Skip already processed records
            if (processedIndices.has(index2)) return;

            if (!record2.latitude || !record2.longitude) return;

            const lat2 = parseFloat(record2.latitude);
            const lon2 = parseFloat(record2.longitude);

            // Check distance between coordinates
            const distance = haversineDistance(lat1, lon1, lat2, lon2);

            if (distance <= maxDistanceMeters) {
                // Check time match
                if (isTimeMatch(record1.startTime, record2.startTime, timeWindowMinutes)) {
                    matches.push({
                        record1: record1,
                        record2: record2,
                        distanceMeters: distance,
                        timeDifferenceMinutes: Math.abs(new Date(record1.startTime) - new Date(record2.startTime)) / (1000 * 60)
                    });
                    processedIndices.add(index2);
                }
            }
        });
    });

    return matches;
}

/**
 * Main function to find matches
 * @param {string} csvString1 - first CSV string
 * @param {string} csvString2 - second CSV string
 * @param {Object} options - options
 * @returns {Object} - result with matches
 */
export function findMatches(csvString1, csvString2, options = {}) {
    const {
        strategy = 'optimized',
        timeWindowMinutes = 30,
        maxDistanceMeters = 100
    } = options;

    const records1 = parseCSV(csvString1, 'file1');
    const records2 = parseCSV(csvString2, 'file2');

    console.log(`Loaded records: file1 - ${records1.length}, file2 - ${records2.length}`);
    console.log(`Using strategy: ${strategy}`);

    let matches;
    const strategyOptions = { timeWindowMinutes, maxDistanceMeters };

    switch (strategy) {
        case 'bruteforce':
            matches = bruteforceStrategy(records1, records2, strategyOptions);
            break;
        case 'simple':
            matches = simpleStrategy(records1, records2, strategyOptions);
            break;
        case 'optimized':
        default:
            matches = optimizedStrategy(records1, records2, strategyOptions);
            break;
    }

    // Form result object
    const result = {
        summary: {
            totalMatches: matches.length,
            timestamp: new Date().toISOString(),
            strategy,
            options: {
                timeWindowMinutes,
                maxDistanceMeters
            }
        },
        matches: matches.map((match, index) => ({
            matchNumber: index + 1,
            distanceMeters: match.distanceMeters,
            timeDifferenceMinutes: match.timeDifferenceMinutes,
            record1: {
                startTime: match.record1.startTime,
                endTime: match.record1.endTime,
                probability: match.record1.probability || null,
                latitude: match.record1.latitude,
                longitude: match.record1.longitude,
                source: match.record1.source
            },
            record2: {
                startTime: match.record2.startTime,
                endTime: match.record2.endTime,
                probability: match.record2.probability || null,
                latitude: match.record2.latitude,
                longitude: match.record2.longitude,
                source: match.record2.source
            }
        }))
    };

    return result;
}
