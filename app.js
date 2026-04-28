const fs = require("fs").promises;
const path = require("path");
const fsSync = require("fs");
const { chain } = require('stream-chain');
const { parser } = require('stream-json');
const { streamArray } = require('stream-json/streamers/stream-array.js');

// Import validation functions
const {
  validateCoordinate,
  validateDateTime,
  validateJsonStructure
} = require("./validator.js");

// Import GeoJSON export functions
const { saveGeoJSON } = require("./geojson-export.js");

// Function to parse coordinates
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

// Async processing (for files < 100 MB)
async function processJsonFileAsync(filePath) {
  try {
    console.log(`Reading JSON file: ${filePath}`);

    const rawData = await fs.readFile(filePath, "utf8");

    let data;
    try {
      data = JSON.parse(rawData);
    } catch (parseError) {
      if (parseError.message.includes("Too long") || parseError.code === "ERR_STRING_TOO_LONG") {
        console.error("Error: File too large to parse in memory.");
        throw new Error("File too large for processing.");
      }
      throw new Error(`Invalid JSON file: ${parseError.message}`);
    }

    const structureValidation = validateJsonStructure(data);
    if (!structureValidation.valid) {
      console.error(`Error: ${structureValidation.error}`);
      throw new Error(structureValidation.error);
    }

    const rows = [];
    let skippedRecords = 0;

    for (let i = 0; i < data.semanticSegments.length; i++) {
      const segment = data.semanticSegments[i];

      if (segment.startTime && !validateDateTime(segment.startTime)) {
        console.warn(`Warning: Invalid startTime format: "${segment.startTime}". Skipping...`);
        skippedRecords++;
        continue;
      }
      if (segment.endTime && !validateDateTime(segment.endTime)) {
        console.warn(`Warning: Invalid endTime format: "${segment.endTime}". Skipping...`);
        skippedRecords++;
        continue;
      }

      if (segment.activity) {
        const activity = segment.activity;

        if (activity.start && activity.start.latLng) {
          if (!validateCoordinate(activity.start.latLng)) {
            console.warn(`Warning: Invalid coordinates activity.start: "${activity.start.latLng}". Skipping...`);
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
            console.warn(`Warning: Invalid coordinates activity.end: "${activity.end.latLng}". Skipping...`);
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
            console.warn(`Warning: Invalid coordinates visit: "${visit.topCandidate.placeLocation.latLng}". Skipping...`);
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
              console.warn(`Warning: Invalid coordinates at point ${j}: "${pointData.point}". Skipping...`);
              skippedRecords++;
              continue;
            }

            if (!validateDateTime(pointData.time)) {
              console.warn(`Warning: Invalid time at point ${j}: "${pointData.time}". Skipping...`);
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

// Streaming JSON processing (for files >= 100 MB)
async function processJsonFileStreaming(filePath) {
  return new Promise((resolve, reject) => {
    console.log(`Streaming processing of JSON file: ${filePath}`);

    let processedSegments = 0;
    let skippedRecords = 0;
    let csvFilePath = null;

    const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, "-");
    const baseName = path.basename(filePath, path.extname(filePath));
    csvFilePath = `${baseName}_${timestamp}.csv`;

    const csvStream = fsSync.createWriteStream(csvFilePath, { encoding: "utf8" });
    csvStream.write("startTime,endTime,probability,latitude,longitude,source\n");

    const pipeline = chain([
      fsSync.createReadStream(filePath, { encoding: 'utf8' }),
      parser(),
      streamArray(),
    ]);

    pipeline.on('data', (data) => {
      const segment = data.value;

      if (!segment) {
        return;
      }

      const segmentIndex = processedSegments;

      if (segment.startTime && !validateDateTime(segment.startTime)) {
        console.warn(`Warning: Invalid startTime: "${segment.startTime}". Skipping...`);
        skippedRecords++;
        return;
      }
      if (segment.endTime && !validateDateTime(segment.endTime)) {
        console.warn(`Warning: Invalid endTime: "${segment.endTime}". Skipping...`);
        skippedRecords++;
        return;
      }

      if (segment.activity) {
        const activity = segment.activity;

        if (activity.start && activity.start.latLng) {
          if (!validateCoordinate(activity.start.latLng)) {
            console.warn(`Warning: Invalid coordinates activity.start: "${activity.start.latLng}". Skipping...`);
            skippedRecords++;
          } else {
            const { latitude, longitude } = parseLatLng(activity.start.latLng);
            const csvLine = `"${(segment.startTime || "").replace(/"/g, '""')}","${(segment.endTime || "").replace(/"/g, '""')}",${activity.topCandidate?.probability || 0.0},"${latitude}","${longitude}","activity.start.${activity.topCandidate?.type || "unknown"}"\n`;
            csvStream.write(csvLine);
            processedSegments++;
          }
        }

        if (activity.end && activity.end.latLng) {
          if (!validateCoordinate(activity.end.latLng)) {
            console.warn(`Warning: Invalid coordinates activity.end: "${activity.end.latLng}". Skipping...`);
            skippedRecords++;
          } else {
            const { latitude, longitude } = parseLatLng(activity.end.latLng);
            const csvLine = `"${(segment.startTime || "").replace(/"/g, '""')}","${(segment.endTime || "").replace(/"/g, '""')}",${activity.topCandidate?.probability || 0.0},"${latitude}","${longitude}","activity.end.${activity.topCandidate?.type || "unknown"}"\n`;
            csvStream.write(csvLine);
            processedSegments++;
          }
        }
      } else if (segment.visit) {
        const visit = segment.visit;

        if (visit.topCandidate && visit.topCandidate.placeLocation && visit.topCandidate.placeLocation.latLng) {
          if (!validateCoordinate(visit.topCandidate.placeLocation.latLng)) {
            console.warn(`Warning: Invalid coordinates visit: "${visit.topCandidate.placeLocation.latLng}". Skipping...`);
            skippedRecords++;
          } else {
            const { latitude, longitude } = parseLatLng(visit.topCandidate.placeLocation.latLng);
            const csvLine = `"${(segment.startTime || "").replace(/"/g, '""')}","${(segment.endTime || "").replace(/"/g, '""')}",${visit.probability || 0.0},"${latitude}","${longitude}","visit.${visit.topCandidate.semanticType || "unknown"}"\n`;
            csvStream.write(csvLine);
            processedSegments++;
          }
        }
      } else if (segment.timelinePath) {
        for (let j = 0; j < segment.timelinePath.length; j++) {
          const pointData = segment.timelinePath[j];

          if (pointData.point && pointData.time) {
            if (!validateCoordinate(pointData.point)) {
              console.warn(`Warning: Invalid coordinates at point ${j}: "${pointData.point}". Skipping...`);
              skippedRecords++;
              continue;
            }

            if (!validateDateTime(pointData.time)) {
              console.warn(`Warning: Invalid time at point ${j}: "${pointData.time}". Skipping...`);
              skippedRecords++;
              continue;
            }

            const { latitude, longitude } = parseLatLng(pointData.point);
            const csvLine = `"${pointData.time}","${pointData.time}","","${latitude}","${longitude}","timelinePath"\n`;
            csvStream.write(csvLine);
            processedSegments++;
          }
        }
      }
    });

    pipeline.on('end', () => {
      csvStream.end();
      console.log(`\nStreaming processing completed`);
      console.log(`Processed ${processedSegments} records`);
      if (skippedRecords > 0) {
        console.log(`Skipped ${skippedRecords} invalid records`);
      }
      console.log(`CSV file saved: ${csvFilePath}`);
      resolve({ csvFile: csvFilePath, rowsCount: processedSegments });
    });

    pipeline.on('error', (error) => {
      csvStream.end();
      console.error("Error during streaming processing:", error.message);
      reject(error);
    });
  });
}

// Helper function for date min/max
function getMinMaxDatesSafe(dates) {
  if (dates.length === 0) return { min: null, max: null };

  let min = dates[0];
  let max = dates[0];

  for (let i = 1; i < dates.length; i++) {
    const date = dates[i];
    if (date < min) min = date;
    if (date > max) max = date;
  }

  return { min, max };
}

// Generate statistics
function generateStatistics(rows) {
  const stats = [];

  stats.push({ Parameter: "Total records", Value: rows.length });

  if (rows.length === 0) {
    stats.push({ Parameter: "--- Info ---", Value: "" });
    stats.push({
      Parameter: "Generated",
      Value: new Date().toLocaleString(),
    });
    return stats;
  }

  const sourceCounts = {};
  for (let i = 0; i < rows.length; i++) {
    const source = rows[i].source;
    sourceCounts[source] = (sourceCounts[source] || 0) + 1;
  }

  stats.push({ Parameter: "--- By source ---", Value: "" });

  const sources = Object.keys(sourceCounts);
  for (let i = 0; i < sources.length; i++) {
    const source = sources[i];
    const count = sourceCounts[source];
    const percentage = ((count / rows.length) * 100).toFixed(1);
    stats.push({
      Parameter: source,
      Value: `${count} (${percentage}%)`,
    });
  }

  let validCoords = 0;
  for (let i = 0; i < rows.length; i++) {
    if (rows[i].latitude && rows[i].longitude) {
      validCoords++;
    }
  }

  stats.push({ Parameter: "--- Coordinates ---", Value: "" });
  stats.push({ Parameter: "With valid coordinates", Value: validCoords });
  stats.push({
    Parameter: "Without coordinates",
    Value: rows.length - validCoords,
  });

  const times = [];
  for (let i = 0; i < rows.length; i++) {
    const date = new Date(rows[i].startTime);
    if (!isNaN(date.getTime())) {
      times.push(date);
      if (times.length > 100000) {
        console.log("Warning: Limiting time processing for performance");
        break;
      }
    }
  }

  if (times.length > 0) {
    const { min: minTime, max: maxTime } = getMinMaxDatesSafe(times);
    stats.push({ Parameter: "--- Time ---", Value: "" });
    stats.push({ Parameter: "Start", Value: minTime.toLocaleString() });
    stats.push({ Parameter: "End", Value: maxTime.toLocaleString() });
  }

  stats.push({ Parameter: "--- Info ---", Value: "" });
  stats.push({
    Parameter: "Generated",
    Value: new Date().toLocaleString(),
  });

  return stats;
}

// Simplified statistics
function generateStatisticsSimple(rows) {
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

// Save to multiple formats
async function saveToMultipleFormats(rows, baseName, options = {}) {
  const { noGeoJSON = false } = options;
  const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, "-");
  const results = {};

  console.log("Saving results...");

  const maxCsvRowNumber = 50000000;
  if (rows.length <= maxCsvRowNumber) {
    console.log("Creating CSV file...");
    const csvFile = `${baseName}_${timestamp}.csv`;
    const writeStream = require("fs").createWriteStream(csvFile, {
      encoding: "utf8",
    });
    writeStream.write(
      "startTime,endTime,probability,latitude,longitude,source\n",
    );

    const batchSize = 10000;
    for (let i = 0; i < rows.length; i += batchSize) {
      const batch = rows.slice(i, i + batchSize);
      const csvBatch =
        batch
          .map(
            (row) =>
              `"${(row.startTime || "").replace(/"/g, '""')}","${(row.endTime || "").replace(/"/g, '""')}",${row.probability || ""},"${row.latitude}","${row.longitude}","${row.source}"`,
          )
          .join("\n") + (i + batchSize < rows.length ? "\n" : "");

      writeStream.write(csvBatch);

      if ((i >= batchSize && i % (100000 - batchSize) === 0) || i + batchSize >= rows.length) {
        console.log(
          `  CSV: written ${Math.min(i + batchSize, rows.length)} of ${rows.length} rows`,
        );
      }
    }

    await new Promise((resolve) => {
      writeStream.end(resolve);
    });
    results.csv = csvFile;
    console.log(`CSV file saved: ${csvFile}`);
  } else {
    console.log(`Skipping CSV creation (too much data: ${rows.length} rows, max: ${maxCsvRowNumber} rows)`);
  }

  // GeoJSON export
  if (!noGeoJSON) {
    try {
      console.log("Creating GeoJSON file...");
      const geojsonFile = `${baseName}_${timestamp}.geojson`;
      await saveGeoJSON(rows, geojsonFile, { includeLineString: true });
      results.geojson = geojsonFile;
      console.log(`GeoJSON file saved: ${geojsonFile}`);
    } catch (error) {
      console.warn(`Warning: Failed to save GeoJSON: ${error.message}`);
    }
  } else {
    console.log("GeoJSON export skipped (--no-geojson flag set)");
  }

  return results;
}

// Main function
async function app() {
  try {
    const inputFile = process.argv[2] || "chronology1.json";
    const outputBase = path.basename(inputFile, path.extname(inputFile));
    
    // Check for --no-geojson flag
    const noGeoJSON = process.argv.includes("--no-geojson");

    console.log(`=== Processing file: ${inputFile} ===\n`);

    try {
      await fs.access(inputFile);
    } catch {
      console.error(`Error: File "${inputFile}" not found!`);
      console.log("\nUsage:");
      console.log("  Extract data from JSON:");
      console.log("    node app.js [input.json]");
      console.log("    Example: node app.js chronology1.json");
      console.log("\n  Compare CSV files (use compare-tool.js):");
      console.log("    node compare-tool.js --file1 file1.csv --file2 file2.csv");
      process.exit(1);
    }

    const stats = await fs.stat(inputFile);
    const fileSizeInMB = stats.size / (1024 * 1024);

    console.log(`File size: ${fileSizeInMB.toFixed(2)} MB`);

    if (process.argv.includes("--increase-stack")) {
      try {
        const v8 = require("v8");
        v8.setFlagsFromString("--stack-size=2000");
        console.log("Increased stack size to 2000KB");
      } catch (e) {
        console.warn("Could not increase stack size:", e.message);
      }
    }

    if (fileSizeInMB > 100) {
      console.log('Large file detected, using streaming processing...');
      const result = await processJsonFileStreaming(inputFile);
      console.log(`\nFile successfully processed using streaming method`);
      console.log(`CSV:   ${result.csvFile}`);
      return;
    } else {
      console.log("Small file, using standard processing...");
    }

    console.log("Processing data...");
    const rows = await processJsonFileAsync(inputFile);

    if (rows.length === 0) {
      console.log("No data to process.");
      return;
    }

    console.log(`\nProcessed ${rows.length} records\n`);

    console.log("Saving results...");
    const savedFiles = await saveToMultipleFormats(rows, outputBase, { noGeoJSON });

    console.log("\nResults saved:");
    if (savedFiles.csv) console.log(`CSV:   ${savedFiles.csv}`);
    if (savedFiles.geojson) console.log(`GeoJSON: ${savedFiles.geojson}`);

    if (rows.length <= 10) {
      console.log("\nPreview of all rows:");
      console.table(rows);
    } else {
      console.log("\nPreview of first 3 rows:");
      console.table(rows.slice(0, 3));
    }
  } catch (error) {
    console.error("\nError:", error.message);

    if (error.message.includes("stack") || error.message.includes("memory") || error.message.includes("heap")) {
      console.log("\nTips for memory issues:");
      console.log("1. Increase memory limit:");
      console.log("   node --max-old-space-size=4096 app.js file.json");
      console.log("2. Increase stack size:");
      console.log("   node --stack-size=2000 app.js file.json");
      console.log("3. Use both flags:");
      console.log("   node --max-old-space-size=4096 --stack-size=2000 app.js file.json");
    }

    process.exit(1);
  }
}

// Export functions
module.exports = {
  processJsonFileAsync,
  processJsonFileStreaming,
  parseLatLng,
  generateStatisticsSimple,
  getMinMaxDatesSafe,
};

// Run
if (require.main === module) {
  if (process.argv.includes("--memory")) {
    console.log("Using increased memory limit");
  }

  app();
}
