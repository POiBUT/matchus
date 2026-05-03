const fs = require('fs').promises;
const path = require('path');
const { program } = require('commander');

// Импорт функций валидации из общего модуля
const {
    validateCoordinate,
    validateDateTime,
    checkAlternativeColumns,
    validateCsvStructure
} = require('./validator.js');

// Импорт функций экспорта GeoJSON
const { saveMatchesGeoJSON } = require('./geojson-export.js');

/**
 * Функция для расчета расстояния между двумя точками по формуле гаверсинусов
 * @param {number} lat1 - широта первой точки
 * @param {number} lon1 - долгота первой точки
 * @param {number} lat2 - широта второй точки
 * @param {number} lon2 - долгота второй точки
 * @returns {number} - расстояние в метрах
 */
function haversineDistance(lat1, lon1, lat2, lon2) {
    // Радиус Земли в метрах
    const R = 6371000;
    // Перевод в радианы
    const φ1 = (parseFloat(lat1) * Math.PI) / 180;
    const φ2 = (parseFloat(lat2) * Math.PI) / 180;
    const Δφ = ((parseFloat(lat2) - parseFloat(lat1)) * Math.PI) / 180;
    const Δλ = ((parseFloat(lon2) - parseFloat(lon1)) * Math.PI) / 180;

    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
        Math.cos(φ1) * Math.cos(φ2) *
        Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c; // Расстояние в метрах
}

/**
 * Функция для парсинга CSV файла с валидацией
 * @param {string} filePath - путь к CSV файлу
 * @returns {Promise<Array>} - массив записей
 */
async function parseCSV(filePath) {
    const content = await fs.readFile(filePath, 'utf8');
    const lines = content.trim().split('\n');

    if (lines.length < 2) {
        throw new Error(`CSV файл ${filePath} не содержит данных (только заголовок или пуст)\n\n💡 Убедитесь, что файл содержит заголовок и хотя бы одну строку данных.`);
    }

    // Парсим заголовки (первая строка)
    const headerLine = lines[0];
    const headers = headerLine.split(',').map(header => header.trim());

    // Валидация структуры CSV
    const structureValidation = validateCsvStructure(headers, filePath);
    if (!structureValidation.valid) {
        throw new Error(structureValidation.error);
    }

    // Используем маппинг, если есть альтернативные названия
    const mapping = structureValidation.mapping || null;

    const records = [];
    let validRecords = 0;
    let invalidRecords = 0;

    // Используем классический for для производительности
    for (let i = 1; i < lines.length; i++) {
        const line = lines[i];

        // Пропускаем пустые строки
        if (!line.trim()) continue;

        // Парсим строку с учетом кавычек
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
        values.push(currentValue); // Добавляем последнее значение

        // Убираем кавычки из значений
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

        // Если используется маппинг альтернативных названий, создаем запись с правильными именами
        if (mapping) {
            const normalizedRecord = {};
            for (const [standardName, originalName] of Object.entries(mapping)) {
                normalizedRecord[standardName] = record[originalName] || '';
            }
            // Добавляем остальные поля как есть
            for (const [key, value] of Object.entries(record)) {
                if (!Object.values(mapping).includes(key)) {
                    normalizedRecord[key] = value;
                }
            }
            record.normalized = normalizedRecord;
        }

        // Валидация данных записи
        const recordToValidate = mapping ? record.normalized : record;

        // Проверка координат
        if (!validateCoordinate(recordToValidate.latitude)) {
            console.warn(`⚠️  Строка ${i}: Некорректная широта "${recordToValidate.latitude}". Пропуск...`);
            invalidRecords++;
            continue;
        }

        if (!validateCoordinate(recordToValidate.longitude)) {
            console.warn(`⚠️  Строка ${i}: Некорректная долгота "${recordToValidate.longitude}". Пропуск...`);
            invalidRecords++;
            continue;
        }

        // Проверка времени (если есть)
        if (recordToValidate.startTime && !validateDateTime(recordToValidate.startTime)) {
            console.warn(`⚠️  Строка ${i}: Некорректное время "${recordToValidate.startTime}". Пропуск...`);
            invalidRecords++;
            continue;
        }

        // Добавляем нормализованные данные в запись
        if (mapping) {
            Object.assign(record, record.normalized);
            delete record.normalized;
        }

        records.push(record);
        validRecords++;
    }

    console.log(`📊 Файл ${filePath}: обработано ${validRecords} валидных записей, пропущено ${invalidRecords} некорректных`);

    return records;
}

/**
 * Функция для проверки совпадения времени с учетом временного окна
 * @param {string} time1 - время первой записи
 * @param {string} time2 - время второй записи
 * @param {number} timeWindowMinutes - временное окно в минутах
 * @returns {boolean} - совпадает ли время
 */
function isTimeMatch(time1, time2, timeWindowMinutes = 30) {
    if (!time1 || !time2) return false;
    const date1 = new Date(time1);
    const date2 = new Date(time2);

    // Проверяем валидность дат
    if (isNaN(date1.getTime()) || isNaN(date2.getTime())) {
        return false;
    }

    const diffMinutes = Math.abs(date1 - date2) / (1000 * 60);
    return diffMinutes <= timeWindowMinutes;
}

/**
 * Стратегия bruteforce: вложенные циклы с использованием for
 * @param {Array} records1 - записи первого файла
 * @param {Array} records2 - записи второго файла
 * @param {Object} options - опции
 * @returns {Array} - найденные совпадения
 */
function bruteforceStrategy(records1, records2, options = {}) {
    const { timeWindowMinutes = 30, maxDistanceMeters = 100 } = options;
    const matches = [];
    const usedIndices = new Set();

    // Используем классический for для максимальной производительности
    for (let i = 0; i < records1.length; i++) {
        const record1 = records1[i];

        if (!record1.latitude || !record1.longitude) continue;

        const lat1 = parseFloat(record1.latitude);
        const lon1 = parseFloat(record1.longitude);

        for (let j = 0; j < records2.length; j++) {
            // Пропускаем уже использованные записи
            if (usedIndices.has(j)) continue;

            const record2 = records2[j];

            if (!record2.latitude || !record2.longitude) continue;

            const lat2 = parseFloat(record2.latitude);
            const lon2 = parseFloat(record2.longitude);

            // Проверяем расстояние между координатами
            const distance = haversineDistance(lat1, lon1, lat2, lon2);

            if (distance <= maxDistanceMeters) {
                // Проверяем совпадение времени
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
 * Стратегия optimized: поиск с удалением записей после сопоставления
 * @param {Array} records1 - записи первого файла
 * @param {Array} records2 - записи второго файла
 * @param {Object} options - опции
 * @returns {Array} - найденные совпадения
 */
function optimizedStrategy(records1, records2, options = {}) {
    const { timeWindowMinutes = 30, maxDistanceMeters = 100 } = options;
    const matches = [];

    // Создаем массив доступных записей из records2
    const availableRecords = records2.map((record, index) => ({ record, index }));

    // Ищем совпадения
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

            // Проверяем расстояние между координатами
            const distance = haversineDistance(lat1, lon1, lat2, lon2);

            if (distance <= maxDistanceMeters) {
                // Проверяем совпадение времени
                if (isTimeMatch(record1.startTime, record2.startTime, timeWindowMinutes)) {
                    const timeDiff = Math.abs(new Date(record1.startTime) - new Date(record2.startTime)) / (1000 * 60);

                    matches.push({
                        record1: record1,
                        record2: record2,
                        distanceMeters: distance,
                        timeDifferenceMinutes: timeDiff
                    });

                    // Удаляем использованную запись из доступных
                    availableRecords.splice(j, 1);
                    j--;

                    break; // Прерываем после нахождения совпадения
                }
            }
        }
    }

    return matches;
}

/**
 * Стратегия simple: использование forEach (менее производительно)
 * @param {Array} records1 - записи первого файла
 * @param {Array} records2 - записи второго файла
 * @param {Object} options - опции
 * @returns {Array} - найденные совпадения
 */
function simpleStrategy(records1, records2, options = {}) {
    const { timeWindowMinutes = 30, maxDistanceMeters = 100 } = options;
    const matches = [];
    const processedIndices = new Set();

    // Ищем совпадения
    records1.forEach((record1, index1) => {
        if (!record1.latitude || !record1.longitude) return;

        const lat1 = parseFloat(record1.latitude);
        const lon1 = parseFloat(record1.longitude);

        records2.forEach((record2, index2) => {
            // Пропускаем уже обработанные записи
            if (processedIndices.has(index2)) return;

            if (!record2.latitude || !record2.longitude) return;

            const lat2 = parseFloat(record2.latitude);
            const lon2 = parseFloat(record2.longitude);

            // Проверяем расстояние между координатами
            const distance = haversineDistance(lat1, lon1, lat2, lon2);

            if (distance <= maxDistanceMeters) {
                // Проверяем совпадение времени
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
 * Основная функция для поиска совпадений
 * @param {string} file1 - путь к первому файлу
 * @param {string} file2 - путь к второму файлу
 * @param {Object} options - опции
 * @param {string} options.strategy - стратегия сопоставления (bruteforce, optimized, simple)
 * @param {number} options.timeWindowMinutes - временное окно в минутах
 * @param {number} options.maxDistanceMeters - максимальное расстояние в метрах для совпадения
 * @returns {Promise<Object>} - результат с совпадениями
 */
async function findMatches(file1, file2, options = {}) {
    const {
        strategy = 'optimized',
        timeWindowMinutes = 30,
        maxDistanceMeters = 100
    } = options;

    // Валидация входных файлов
    await validateFiles(file1, file2);

    console.log(`Чтение файлов: ${file1}, ${file2}...`);
    const records1 = await parseCSV(file1);
    const records2 = await parseCSV(file2);

    console.log(`Загружено записей: ${file1} - ${records1.length}, ${file2} - ${records2.length}`);
    console.log(`Используется стратегия: ${strategy}`);

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

    // Формируем объект с результатами
    const result = {
        summary: {
            totalMatches: matches.length,
            timestamp: new Date().toISOString(),
            sourceFiles: {
                file1,
                file2
            },
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

/**
 * Валидация входных файлов
 * @param {string} file1 - путь к первому файлу
 * @param {string} file2 - путь к второму файлу
 */
async function validateFiles(file1, file2) {
    const files = [file1, file2];

    for (const file of files) {
        try {
            await fs.access(file);
        } catch (error) {
            throw new Error(`❌ Файл не найден: ${file}\n\n💡 Убедитесь, что файл существует и путь указан верно.\n   Текущая директория: ${process.cwd()}`);
        }

        // Проверяем расширение файла
        if (!file.toLowerCase().endsWith('.csv')) {
            throw new Error(`❌ Файл ${file} не является CSV файлом\n\n💡 Ожидается файл с расширением .csv\n   Используйте файлы, экспортированные из app.js или других инструментов в формате CSV.`);
        }

        // Проверяем, что файл не пустой
        const stats = await fs.stat(file);
        if (stats.size === 0) {
            throw new Error(`❌ Файл ${file} пуст\n\n💡 CSV файл должен содержать заголовок и данные.`);
        }
    }
}

/**
 * Сохранение результатов в JSON файл
 * @param {Object} data - данные для сохранения
 * @param {string} outputPath - путь к выходному файлу
 */
async function saveMatchesToJSON(data, outputPath = 'matches.json') {
    try {
        await fs.writeFile(outputPath, JSON.stringify(data, null, 2));
        console.log(`Результаты сохранены в файл: ${outputPath}`);
    } catch (error) {
        console.error('Ошибка при сохранении JSON:', error.message);
        throw error;
    }
}

/**
 * Настройка CLI аргументов
 */
function setupCLI() {
    program
        .name('compare-tool')
        .description('Инструмент для сравнения CSV-файлов истории местоположения Google')
        .version('1.0.0')
        .requiredOption('--file1 <path>', 'путь к первому CSV файлу')
        .requiredOption('--file2 <path>', 'путь к второму CSV файлу')
        .option('--strategy <strategy>', 'стратегия сопоставления (bruteforce, optimized, simple)', 'optimized')
        .option('--output <path>', 'путь к выходному JSON файлу', 'matches.json')
        .option('--time-window <minutes>', 'временное окно сопоставления в минутах', '30')
        .option('--max-distance <meters>', 'максимальное расстояние для совпадения в метрах', '100')
        .option('--geojson', 'экспортировать совпадения в формат GeoJSON')
        .helpOption('--help', 'показать справку');

    program.parse();

    return program.opts();
}

/**
 * Основная функция CLI
 */
async function cliMain() {
    try {
        const options = setupCLI();

        console.log('=== Сравнение CSV файлов истории местоположения ===\n');

        // Валидация стратегии
        const validStrategies = ['bruteforce', 'optimized', 'simple'];
        if (!validStrategies.includes(options.strategy)) {
            throw new Error(`❌ Неизвестная стратегия: "${options.strategy}"\n\n💡 Допустимые значения: ${validStrategies.join(', ')}\n   bruteforce - медленно, но надежно\n   optimized - быстро (по умолчанию)\n   simple - простой перебор`);
        }

        // Парсим числовые опции
        const timeWindow = parseInt(options.timeWindow, 10);
        const maxDistance = parseInt(options.maxDistance, 10);

        if (isNaN(timeWindow) || timeWindow <= 0) {
            throw new Error(`❌ Некорректное значение time-window: "${options.timeWindow}"\n\n💡 Значение должно быть положительным числом (например, 30 для 30 минут)`);
        }

        if (isNaN(maxDistance) || maxDistance <= 0) {
            throw new Error(`❌ Некорректное значение max-distance: "${options.maxDistance}"\n\n💡 Значение должно быть положительным числом (например, 100 для 100 метров)`);
        }

        console.log(`📁 Файл 1: ${options.file1}`);
        console.log(`📁 Файл 2: ${options.file2}`);
        console.log(`⚙️  Стратегия: ${options.strategy}`);
        console.log(`⏱️  Временное окно: ${timeWindow} мин.`);
        console.log(`📍 Максимальное расстояние: ${maxDistance} м.\n`);

        const result = await findMatches(options.file1, options.file2, {
            strategy: options.strategy,
            timeWindowMinutes: timeWindow,
            maxDistanceMeters: maxDistance
        });

        console.log(`\n✅ Найдено совпадений: ${result.summary.totalMatches}\n`);

        if (result.summary.totalMatches > 0) {
            console.log('📊 Результаты поиска совпадений:');
            console.log(JSON.stringify(result, null, 2));
        } else {
            console.log('ℹ️  Совпадений не найдено. Попробуйте увеличить временное окно (--time-window) или увеличить максимальное расстояние (--max-distance).');
        }

        await saveMatchesToJSON(result, options.output);

        // Экспорт в GeoJSON если указан флаг --geojson
        if (options.geojson) {
            try {
                const geojsonOutput = options.output.replace(/\.json$/, '.geojson');
                await saveMatchesGeoJSON(result.matches, geojsonOutput);
                console.log(`📍 GeoJSON сохранен: ${geojsonOutput}`);
            } catch (geojsonError) {
                console.warn(`⚠️  Ошибка при сохранении GeoJSON: ${geojsonError.message}`);
            }
        }

        return result;
    } catch (error) {
        console.error('\n❌ Ошибка:', error.message);
        console.log('\n📖 Пример использования:');
        console.log('  node compare-tool.js --file1 данные1.csv --file2 данные2.csv');
        console.log('  node compare-tool.js --file1 данные1.csv --file2 данные2.csv --time-window 60 --max-distance 200');
        process.exit(1);
    }
}

// Экспорт функций для использования в коде
module.exports = {
    findMatches,
    parseCSV,
    haversineDistance,
    isTimeMatch,
    bruteforceStrategy,
    optimizedStrategy,
    simpleStrategy,
    saveMatchesToJSON,
    validateFiles
};

// Запуск CLI, если файл запущен напрямую
if (require.main === module) {
    cliMain().catch(error => {
        console.error('Критическая ошибка:', error.message);
        process.exit(1);
    });
}
