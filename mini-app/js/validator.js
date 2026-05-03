/**
 * Модуль валидации данных для проекта matchus (ES Module версия для браузера)
 * Содержит общие функции для проверки JSON и CSV данных
 */

/**
 * Проверка, является ли строка валидным числом (координатой)
 * @param {string|number} str - строка или число для проверки
 * @returns {boolean}
 */
export function isValidNumber(str) {
    if (str === '' || str === null || str === undefined) return false;
    const num = parseFloat(str);
    return !isNaN(num) && isFinite(num);
}

/**
 * Валидация формата координат (latLng строка или отдельное число)
 * @param {string|number} coord - координата для проверки
 * @returns {boolean}
 */
export function validateCoordinate(coord) {
    if (!coord) return false;
    
    // Если это строка в формате "lat,lng" (как в JSON от Google)
    if (typeof coord === 'string' && coord.includes(',')) {
        const parts = coord.replace(/°/g, '').split(',').map(s => s.trim());
        if (parts.length !== 2) return false;
        return isValidNumber(parts[0]) && isValidNumber(parts[1]);
    }
    
    // Если это просто число или строка с числом
    return isValidNumber(coord);
}

/**
 * Валидация формата даты (ISO 8601)
 * @param {string} datetime - строка даты
 * @returns {boolean}
 */
export function validateDateTime(datetime) {
    if (!datetime) return false;
    const date = new Date(datetime);
    return !isNaN(date.getTime());
}

/**
 * Валидация структуры JSON данных (для app.js)
 * @param {any} data - распарсенные данные JSON
 * @returns {{ valid: boolean, error?: string, expectedStructure?: string }}
 */
export function validateJsonStructure(data) {
    // Проверка, что data - это объект
    if (!data || typeof data !== 'object') {
        return {
            valid: false,
            error: 'Файл не содержит валидный JSON объект',
            expectedStructure: `{
  "semanticSegments": [
    {
      "startTime": "2024-01-01T00:00:00.000Z",
      "endTime": "2024-01-01T01:00:00.000Z",
      "activity": { ... },
      "visit": { ... },
      "timelinePath": [ ... ]
    }
  ]
}`
        };
    }

    // Проверка наличия semanticSegments
    if (!('semanticSegments' in data)) {
        return {
            valid: false,
            error: 'В JSON файле отсутствует обязательное поле "semanticSegments"',
            expectedStructure: `{
  "semanticSegments": [ ... ]  // Обязательное поле - массив сегментов
}`
        };
    }

    // Проверка, что semanticSegments - это массив
    if (!Array.isArray(data.semanticSegments)) {
        return {
            valid: false,
            error: 'Поле "semanticSegments" должно быть массивом',
            expectedStructure: `"semanticSegments": [ ... ]  // Должен быть массивом`
        };
    }

    return { valid: true };
}

/**
 * Проверка альтернативных названий колонок (для compare-tool.js)
 * @param {Array<string>} headers - заголовки CSV
 * @returns {Object|null} - карта соответствия или null
 */
export function checkAlternativeColumns(headers) {
    const alternatives = {
        'lat': 'latitude',
        'latitude': 'latitude',
        'lng': 'longitude',
        'longitude': 'longitude',
        'lon': 'longitude',
        'start': 'startTime',
        'starttime': 'startTime',
        'startTime': 'startTime',
        'end': 'endTime',
        'endtime': 'endTime',
        'endTime': 'endTime',
        'source': 'source'
    };
    
    const mapping = {};
    let hasAlternatives = false;
    
    for (const header of headers) {
        const normalized = header.toLowerCase().trim();
        if (alternatives[normalized] && !mapping[alternatives[normalized]]) {
            mapping[alternatives[normalized]] = header;
            if (normalized !== alternatives[normalized]) {
                hasAlternatives = true;
            }
        }
    }
    
    return hasAlternatives ? mapping : null;
}

/**
 * Валидация структуры CSV (заголовков)
 * @param {Array<string>} headers - заголовки CSV
 * @param {string} filePath - путь к файлу для сообщений об ошибках
 * @returns {{ valid: boolean, error?: string, mapping?: Object }}
 */
export function validateCsvStructure(headers, filePath) {
    // Минимально необходимые колонки
    const requiredBase = ['startTime', 'latitude', 'longitude'];
    const missingBase = requiredBase.filter(col => !headers.includes(col));
    
    if (missingBase.length === 0) {
        return { valid: true };
    }
    
    // Проверяем альтернативные названия
    const altMapping = checkAlternativeColumns(headers);
    if (altMapping) {
        const missingWithAlt = requiredBase.filter(col => !altMapping[col]);
        if (missingWithAlt.length === 0) {
            return { valid: true, mapping: altMapping };
        }
    }
    
    // Формируем понятное сообщение об ошибке
    let errorMsg = `CSV файл ${filePath} не содержит обязательные колонки: ${missingBase.join(', ')}\n\n`;
    errorMsg += 'Ожидаемые колонки (минимум):\n';
    errorMsg += '  - startTime (или start) - время начала\n';
    errorMsg += '  - latitude (или lat) - широта\n';
    errorMsg += '  - longitude (или lng, lon) - долгота\n\n';
    errorMsg += 'Пример правильного заголовка:\n';
    errorMsg += '  startTime,endTime,latitude,longitude,source\n\n';
    errorMsg += 'Текущие колонки в файле:\n';
    errorMsg += `  ${headers.join(', ')}`;
    
    return { valid: false, error: errorMsg };
}

/**
 * Валидация записи данных
 * @param {Object} record - запись для проверки
 * @param {Array<string>} requiredFields - обязательные поля
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateRecord(record, requiredFields = ['latitude', 'longitude']) {
    const errors = [];
    
    for (const field of requiredFields) {
        if (!record[field]) {
            errors.push(`Отсутствует поле "${field}"`);
        } else if (field === 'latitude' || field === 'longitude') {
            if (!validateCoordinate(record[field])) {
                errors.push(`Некорректная координата "${field}": ${record[field]}`);
            }
        } else if (field === 'startTime' || field === 'endTime') {
            if (!validateDateTime(record[field])) {
                errors.push(`Некорректное время "${field}": ${record[field]}`);
            }
        }
    }
    
    return {
        valid: errors.length === 0,
        errors
    };
}
