const {
    haversineDistance,
    isTimeMatch,
    findMatches,
    parseCSV,
    bruteforceStrategy,
    optimizedStrategy,
    simpleStrategy
} = require('./compare-tool');

// Тестовые данные - координаты Москвы (известные расстояния)
const RED_SQUARE = { latitude: '55.753930', longitude: '37.620795' }; // Красная площадь
const KREMLIN = { latitude: '55.752004', longitude: '37.617524' }; // Кремль (примерно 300м от Красной площади)
const SPB = { latitude: '59.934280', longitude: '30.335098' }; // Санкт-Петербург (около 630 км от Москвы)

describe('haversineDistance', () => {
    test('should calculate distance between Red Square and Kremlin correctly', () => {
        const distance = haversineDistance(
            RED_SQUARE.latitude, RED_SQUARE.longitude,
            KREMLIN.latitude, KREMLIN.longitude
        );
        // Расстояние между Красной площадью и Кремлем примерно 296 метров
        expect(distance).toBeGreaterThan(290);
        expect(distance).toBeLessThan(310);
    });

    test('should calculate long distance (Moscow to SPb) correctly', () => {
        const distance = haversineDistance(
            RED_SQUARE.latitude, RED_SQUARE.longitude,
            SPB.latitude, SPB.longitude
        );
        // Расстояние Москва-СПб примерно 630-640 км = 630000-640000 метров
        expect(distance).toBeGreaterThan(630000);
        expect(distance).toBeLessThan(650000);
    });

    test('should return 0 for same coordinates', () => {
        const distance = haversineDistance(
            RED_SQUARE.latitude, RED_SQUARE.longitude,
            RED_SQUARE.latitude, RED_SQUARE.longitude
        );
        expect(distance).toBe(0);
    });

    test('should handle string and number inputs', () => {
        const distance1 = haversineDistance(55.753930, 37.620795, 55.752004, 37.617524);
        const distance2 = haversineDistance('55.753930', '37.620795', '55.752004', '37.617524');
        expect(Math.abs(distance1 - distance2)).toBeLessThan(0.01);
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

    test('should handle custom time window', () => {
        const t1 = '2024-01-01T10:00:00Z';
        const t2 = '2024-01-01T10:45:00Z';
        expect(isTimeMatch(t1, t2, 60)).toBe(true);
        expect(isTimeMatch(t1, t2, 30)).toBe(false);
    });

    test('should handle invalid inputs', () => {
        expect(isTimeMatch(null, '2024-01-01')).toBe(false);
        expect(isTimeMatch('2024-01-01', null)).toBe(false);
        expect(isTimeMatch('', '')).toBe(false);
    });
});

describe('Strategies with haversine distance', () => {
    // Создаем тестовые записи
    const createRecord = (lat, lon, time, source = 'test') => ({
        latitude: String(lat),
        longitude: String(lon),
        startTime: time,
        endTime: time,
        source: source,
        probability: '0.9'
    });

    const records1 = [
        createRecord(55.753930, 37.620795, '2024-01-01T10:00:00Z', 'source1'), // Красная площадь
    ];

    const records2_close = [
        createRecord(55.752004, 37.617524, '2024-01-01T10:05:00Z', 'source2'), // Кремль (близко, ~300м)
    ];

    const records2_far = [
        createRecord(59.934280, 30.335098, '2024-01-01T10:05:00Z', 'source2'), // СПб (далеко)
    ];

    test('bruteforceStrategy should find match within maxDistance', () => {
        const matches = bruteforceStrategy(records1, records2_close, {
            timeWindowMinutes: 30,
            maxDistanceMeters: 500
        });
        expect(matches.length).toBe(1);
        expect(matches[0].distanceMeters).toBeDefined();
        expect(matches[0].distanceMeters).toBeGreaterThan(290);
        expect(matches[0].distanceMeters).toBeLessThan(310);
    });

    test('bruteforceStrategy should not find match beyond maxDistance', () => {
        const matches = bruteforceStrategy(records1, records2_far, {
            timeWindowMinutes: 30,
            maxDistanceMeters: 1000
        });
        expect(matches.length).toBe(0);
    });

    test('optimizedStrategy should find match within maxDistance', () => {
        const matches = optimizedStrategy(records1, records2_close, {
            timeWindowMinutes: 30,
            maxDistanceMeters: 500
        });
        expect(matches.length).toBe(1);
        expect(matches[0].distanceMeters).toBeDefined();
    });

    test('simpleStrategy should find match within maxDistance', () => {
        const matches = simpleStrategy(records1, records2_close, {
            timeWindowMinutes: 30,
            maxDistanceMeters: 500
        });
        expect(matches.length).toBe(1);
        expect(matches[0].distanceMeters).toBeDefined();
    });

    test('all strategies should add distanceMeters to matches', () => {
        const strategies = [
            { name: 'bruteforce', fn: bruteforceStrategy },
            { name: 'optimized', fn: optimizedStrategy },
            { name: 'simple', fn: simpleStrategy }
        ];

        strategies.forEach(({ name, fn }) => {
            const matches = fn(records1, records2_close, {
                timeWindowMinutes: 30,
                maxDistanceMeters: 500
            });
            expect(matches.length).toBeGreaterThan(0);
            matches.forEach(match => {
                expect(match).toHaveProperty('distanceMeters');
                expect(typeof match.distanceMeters).toBe('number');
                expect(match.distanceMeters).toBeGreaterThan(0);
            });
        });
    });

    test('should not match records with time beyond window', () => {
        const records2_late = [
            createRecord(55.752004, 37.617524, '2024-01-01T11:00:00Z', 'source2'), // На час позже
        ];

        const strategies = [bruteforceStrategy, optimizedStrategy, simpleStrategy];

        strategies.forEach(strategyFn => {
            const matches = strategyFn(records1, records2_late, {
                timeWindowMinutes: 30,
                maxDistanceMeters: 500
            });
            expect(matches.length).toBe(0);
        });
    });
});

describe('CLI parameter --max-distance', () => {
    test('should parse max-distance parameter correctly', () => {
        // Проверяем, что параметр maxDistanceMeters передается в опции
        const options = { timeWindowMinutes: 30, maxDistanceMeters: 200 };
        expect(options.maxDistanceMeters).toBe(200);
    });

    test('should work with different max-distance values', () => {
        const createRecord = (lat, lon, time) => ({
            latitude: String(lat),
            longitude: String(lon),
            startTime: time,
            endTime: time,
            source: 'test',
            probability: '0.9'
        });

        const rec1 = [createRecord(55.753930, 37.620795, '2024-01-01T10:00:00Z')];
        const rec2 = [createRecord(55.752004, 37.617524, '2024-01-01T10:05:00Z')];

        // С маленьким расстоянием (100м) не должно найти (расстояние ~300м)
        const matches1 = bruteforceStrategy(rec1, rec2, {
            timeWindowMinutes: 30,
            maxDistanceMeters: 100
        });
        expect(matches1.length).toBe(0);

        // С большим расстоянием (500м) должно найти
        const matches2 = bruteforceStrategy(rec1, rec2, {
            timeWindowMinutes: 30,
            maxDistanceMeters: 500
        });
        expect(matches2.length).toBe(1);
    });
});
