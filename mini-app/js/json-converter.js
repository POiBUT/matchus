/**
 * JSON Converter Module - Convert Google Takeout JSON to CSV
 * Adapted from app.js for browser use
 */

import { validateCoordinate, validateDateTime, validateJsonStructure } from './validator.js';

/**
 * Parse coordinates from latLng string
 * @param {string} latLngString - coordinate string
 * @returns {{ latitude: string, longitude: string }}
 */
export function parseLatLng(latLngString) {
    if (!latLngString) return { latitude: "", longitude: "" };

    const parts = latLngString
        .replace(/°/g, "")
        .split(",")
        .map((s) => s.trim());
    return parts.length == 2
        ? { latitude: parts[0], longitude: parts[1] }
        : { latitude: "", longitude: "" };
}

/**
 * Process JSON file from string (async)
 * @param {string} jsonString - JSON file content as string
 * @returns {Array} - array of row objects
 */
export async function processJsonFileAsync(jsonString) {
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

        console.log(`Processed ${rows.length} records`);
        if (skippedRecords > 0) {
            console.log(`Skipped ${skippedRecords} invalid records`);
        }
        return rows;
    } catch (error) {
        console.error("Error processing file:", error.message);
        throw error;
    }
}

/**
 * Convert rows to CSV string
 * @param {Array} rows - array of row objects
 * @returns {string} - CSV string
 */
export function rowsToCSV(rows) {
    const header = "startTime,endTime,probability,latitude,longitude,source";
    const rowsCSV = rows.map(row => 
        `"${(row.startTime || "").replace(/"/g, '""')}","${(row.endTime || "").replace(/"/g, '""')}",${row.probability || ""},"${row.latitude}","${row.longitude}","${row.source}"`
    );
    return [header, ...rowsCSV].join('\n');
}

/**
 * Process JSON string and return CSV string
 * @param {string} jsonString - JSON content
 * @returns {Promise<string>} - CSV string
 */
export async function jsonToCSV(jsonString) {
    const rows = await processJsonFileAsync(jsonString);
    return rowsToCSV(rows);
}

/**
 * Generate simple statistics from rows
 * @param {Array} rows - array of row objects
 * @returns {Array} - statistics array
 */
export function generateStatisticsSimple(rows) {
    const stats = [];

    stats.push({ Parameter: "Total records", Value: rows.length });

    if (rows.length === 0) {
        return stats;
    }

    const sourceCounts = {};
    let validCoords = 0;
    let earliestTime = null;
    let latestTime = null;

    for (let i = 0; i < Math.min(rows.length, 100000); i++) {
        const row = rows[i];

        sourceCounts[row.source] = (sourceCounts[row.source] || 0) + 1;

        if (row.latitude && row.longitude) {
            validCoords++;
        }

        if (i < 10000) {
            try {
                const date = new Date(row.startTime);
                if (!isNaN(date.getTime())) {
                    if (!earliestTime || date < earliestTime) earliestTime = date;
                    if (!latestTime || date > latestTime) latestTime = date;
                }
            } catch (e) {
                // Ignore date parsing errors
            }
        }
    }

    stats.push({ Parameter: "--- By source ---", Value: "" });
    Object.entries(sourceCounts).forEach(([source, count]) => {
        const percentage = ((count / rows.length) * 100).toFixed(1);
        stats.push({
            Parameter: source,
            Value: `${count} (${percentage}%)`,
        });
    });

    stats.push({ Parameter: "--- Coordinates ---", Value: "" });
    stats.push({ Parameter: "With valid coordinates", Value: validCoords });
    stats.push({
        Parameter: "Without coordinates",
        Value: rows.length - validCoords,
    });

    if (earliestTime && latestTime) {
        stats.push({ Parameter: "--- Time (first 10000) ---", Value: "" });
        stats.push({ Parameter: "Start", Value: earliestTime.toLocaleString() });
        stats.push({ Parameter: "End", Value: latestTime.toLocaleString() });
    }

    stats.push({ Parameter: "--- Info ---", Value: "" });
    stats.push({
        Parameter: "Generated",
        Value: new Date().toLocaleString(),
    });

    return stats;
}
