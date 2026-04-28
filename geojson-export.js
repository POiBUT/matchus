const fs = require('fs').promises;
const path = require('path');

/**
 * Преобразует массив записей в GeoJSON FeatureCollection
 * @param {Array} records - массив записей с полями latitude, longitude, startTime, endTime, probability, source
 * @param {Object} options - опции (например, { includeLineString: false })
 * @returns {Object} - GeoJSON FeatureCollection
 */
function convertToGeoJSON(records, options = {}) {
    const { includeLineString = false } = options;
    
    const features = records
        .filter(record => record.latitude && record.longitude)
        .map(record => {
            // GeoJSON coordinates are [longitude, latitude]
            const coordinates = [
                parseFloat(record.longitude),
                parseFloat(record.latitude)
            ];
            
            return {
                type: "Feature",
                geometry: {
                    type: "Point",
                    coordinates: coordinates
                },
                properties: {
                    startTime: record.startTime || "",
                    endTime: record.endTime || "",
                    probability: record.probability !== undefined ? parseFloat(record.probability) || 0 : 0,
                    source: record.source || ""
                }
            };
        });
    
    const featureCollection = {
        type: "FeatureCollection",
        features: features
    };
    
    // Добавляем LineString если нужно и есть больше одной точки
    if (includeLineString && features.length > 1) {
        const lineString = createLineString(records);
        if (lineString) {
            featureCollection.features.push(lineString);
        }
    }
    
    return featureCollection;
}

/**
 * Создает LineString из точек для отображения маршрута
 * @param {Array} records - массив записей с полями latitude, longitude
 * @returns {Object|null} - GeoJSON Feature с типом LineString или null если недостаточно точек
 */
function createLineString(records) {
    const validRecords = records
        .filter(record => record.latitude && record.longitude)
        .sort((a, b) => {
            // Сортируем по startTime если доступно
            if (a.startTime && b.startTime) {
                return new Date(a.startTime) - new Date(b.startTime);
            }
            return 0;
        });
    
    if (validRecords.length < 2) {
        return null;
    }
    
    const coordinates = validRecords.map(record => [
        parseFloat(record.longitude),
        parseFloat(record.latitude)
    ]);
    
    return {
        type: "Feature",
        geometry: {
            type: "LineString",
            coordinates: coordinates
        },
        properties: {
            type: "route",
            pointCount: validRecords.length
        }
    };
}

/**
 * Создает GeoJSON с совпадающими точками (для compare-tool)
 * @param {Array} matches - массив совпадений из compare-tool
 * @param {Object} options - опции
 * @returns {Object} - GeoJSON FeatureCollection с двумя слоями
 */
function convertMatchesToGeoJSON(matches, options = {}) {
    const { includeLines = true } = options;
    
    const features = [];
    
    // Слой 1: Совпадающие точки
    matches.forEach((match, index) => {
        if (match.commonCoordinates) {
            features.push({
                type: "Feature",
                geometry: {
                    type: "Point",
                    coordinates: [
                        parseFloat(match.commonCoordinates.longitude),
                        parseFloat(match.commonCoordinates.latitude)
                    ]
                },
                properties: {
                    type: "match",
                    matchIndex: index,
                    timeDifferenceMinutes: match.timeDifferenceMinutes || 0,
                    record1: match.record1 || null,
                    record2: match.record2 || null
                }
            });
        }
    });
    
    // Слой 2: Линии между совпадающими точками (опционально)
    if (includeLines && matches.length > 1) {
        const sortedMatches = [...matches]
            .filter(m => m.commonCoordinates)
            .sort((a, b) => {
                if (a.record1?.startTime && b.record1?.startTime) {
                    return new Date(a.record1.startTime) - new Date(b.record1.startTime);
                }
                return 0;
            });
        
        if (sortedMatches.length >= 2) {
            const coordinates = sortedMatches.map(m => [
                parseFloat(m.commonCoordinates.longitude),
                parseFloat(m.commonCoordinates.latitude)
            ]);
            
            features.push({
                type: "Feature",
                geometry: {
                    type: "LineString",
                    coordinates: coordinates
                },
                properties: {
                    type: "match_route",
                    matchCount: sortedMatches.length
                }
            });
        }
    }
    
    return {
        type: "FeatureCollection",
        features: features
    };
}

/**
 * Сохраняет GeoJSON в файл
 * @param {Array|Object} data - массив записей или готовый GeoJSON объект
 * @param {string} outputPath - путь к выходному файлу
 * @param {Object} options - опции для convertToGeoJSON
 * @returns {Promise<string>} - путь к сохраненному файлу
 */
async function saveGeoJSON(data, outputPath, options = {}) {
    let geojson;
    
    // Если передан массив, конвертируем в GeoJSON
    if (Array.isArray(data)) {
        geojson = convertToGeoJSON(data, options);
    } else {
        // Иначе считаем что это уже готовый GeoJSON
        geojson = data;
    }
    
    // Убеждаемся что расширение .geojson
    const ext = path.extname(outputPath);
    if (ext !== '.geojson') {
        outputPath = outputPath + '.geojson';
    }
    
    const jsonString = JSON.stringify(geojson, null, 2);
    await fs.writeFile(outputPath, jsonString, 'utf8');
    
    return outputPath;
}

/**
 * Сохраняет совпадения в GeoJSON файл (для compare-tool)
 * @param {Array} matches - массив совпадений
 * @param {string} outputPath - путь к выходному файлу
 * @param {Object} options - опции
 * @returns {Promise<string>} - путь к сохраненному файлу
 */
async function saveMatchesGeoJSON(matches, outputPath, options = {}) {
    const geojson = convertMatchesToGeoJSON(matches, options);
    
    // Убеждаемся что расширение .geojson
    const ext = path.extname(outputPath);
    if (ext !== '.geojson') {
        outputPath = outputPath.replace(/\.json$/, '.geojson');
        if (!outputPath.endsWith('.geojson')) {
            outputPath = outputPath + '.geojson';
        }
    }
    
    const jsonString = JSON.stringify(geojson, null, 2);
    await fs.writeFile(outputPath, jsonString, 'utf8');
    
    return outputPath;
}

module.exports = {
    convertToGeoJSON,
    createLineString,
    convertMatchesToGeoJSON,
    saveGeoJSON,
    saveMatchesGeoJSON
};
