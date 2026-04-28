# matchus

Инструмент для обработки и сравнения истории местоположения Google (Timeline), экспортированной через Google Takeout.

## Лицензия

This work is licensed under [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/)

## Установка

```bash
git clone <repo>
cd matchus
npm install
```

Требования:
- Node.js >= 14.0.0

## Форматы данных

### Входной JSON (структура от Google Takeout)

При экспорте истории местоположения через Google Takeout вы получаете JSON файл со следующей структурой:

```json
{
  "semanticSegments": [
    {
      "startTime": "2024-01-01T10:00:00Z",
      "endTime": "2024-01-01T11:00:00Z",
      "activity": {
        "start": { "latLng": "50.123°, 30.456°" },
        "end": { "latLng": "50.124°, 30.457°" },
        "topCandidate": { "type": "walking", "probability": 0.85 }
      }
    },
    {
      "startTime": "2024-01-01T12:00:00Z",
      "endTime": "2024-01-01T13:00:00Z",
      "visit": {
        "topCandidate": {
          "placeLocation": { "latLng": "50.125°, 30.458°" },
          "semanticType": "restaurant"
        },
        "probability": 0.92
      }
    },
    {
      "startTime": "2024-01-01T14:00:00Z",
      "endTime": "2024-01-01T15:00:00Z",
      "timelinePath": [
        { "point": "50.126°, 30.459°", "time": "2024-01-01T14:10:00Z" },
        { "point": "50.127°, 30.460°", "time": "2024-01-01T14:20:00Z" }
      ]
    }
  ]
}
```

Поддерживаемые типы данных в `semanticSegments`:
- **activity** - записи об активности с координатами начала и конца пути
- **visit** - записи о посещении мест (рестораны, магазины и т.д.)
- **timelinePath** - точки маршрута с временными метками

### Выходной CSV

После обработки JSON файла создается CSV файл со следующими колонками:

| Колонка | Описание | Пример |
|---------|----------|--------|
| startTime | Время начала записи | 2024-01-01T10:00:00.000Z |
| endTime | Время окончания записи | 2024-01-01T11:00:00.000Z |
| probability | Вероятность события (0.0 - 1.0) | 0.85 |
| latitude | Широта | 50.123 |
| longitude | Долгота | 30.456 |
| source | Источник данных | activity.start.walking, visit.restaurant, timelinePath |

Пример строки CSV:
```csv
"2024-01-01T10:00:00.000Z","2024-01-01T11:00:00.000Z",0.85,"50.123","30.456","activity.start.walking"
```

### Выходной GeoJSON

После обработки JSON файла также создается GeoJSON файл (`.geojson`) для использования в веб-картографии. GeoJSON — это стандартный формат для веб-карт (Leaflet, Mapbox, Google Maps).

Пример структуры GeoJSON:
```json
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "geometry": {
        "type": "Point",
        "coordinates": [30.456, 50.123]
      },
      "properties": {
        "startTime": "2024-01-01T10:00:00.000Z",
        "endTime": "2024-01-01T11:00:00.000Z",
        "probability": 0.85,
        "source": "activity.start.walking"
      }
    }
  ]
}
```

Опции для app.js:
- По умолчанию GeoJSON экспорт включен
- Используйте флаг `--no-geojson` для отключения экспорта в GeoJSON

```bash
# С отключением GeoJSON экспорта
node app.js хронология.json --no-geojson
```

#### Использование GeoJSON на веб-карте (Leaflet пример)

```html
<!DOCTYPE html>
<html>
<head>
    <title>Location History Map</title>
    <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
    <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
    <style>
        #map { height: 600px; }
    </style>
</head>
<body>
    <div id="map"></div>
    <script>
        const map = L.map('map').setView([50.123, 30.456], 10);
        
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors'
        }).addTo(map);
        
        fetch('хронология_2024-01-15T10-30-45.geojson')
            .then(response => response.json())
            .then(data => {
                L.geoJSON(data, {
                    pointToLayer: function(feature, latlng) {
                        return L.circleMarker(latlng, {
                            radius: 8,
                            fillColor: "#ff7800",
                            color: "#000",
                            weight: 1,
                            opacity: 1,
                            fillOpacity: 0.8
                        });
                    },
                    onEachFeature: function(feature, layer) {
                        if (feature.properties) {
                            layer.bindPopup(
                                `<b>Source:</b> ${feature.properties.source}<br>` +
                                `<b>Time:</b> ${feature.properties.startTime}<br>` +
                                `<b>Probability:</b> ${feature.properties.probability}`
                            );
                        }
                    }
                }).addTo(map);
            });
    </script>
</body>
</html>
```

#### Инструменты для просмотра GeoJSON

- [geojson.io](https://geojson.io/) — онлайн редактор и просмотрщик GeoJSON
- [QGIS](https://qgis.org/) — настольное приложение для работы с ГИС данными
- [Leaflet](https://leafletjs.com/) — JavaScript библиотека для интерактивных карт
- [Mapbox](https://www.mapbox.com/) — платформа для создания карт

## Использование

### Обработка JSON (извлечение данных из Google Takeout)

Приложение автоматически выбирает стратегию обработки в зависимости от размера файла:
- **Файлы < 100 МБ**: Используется стандартная обработка (загрузка всего файла в память)
- **Файлы ≥ 100 МБ**: Используется потоковая обработка (streaming) для экономии памяти

```bash
# Базовое использование (автоматический выбор стратегии)
node app.js хронология.json

# Принудительное увеличение лимита памяти (для стандартной обработки)
node --max-old-space-size=4096 app.js хронология.json

# Принудительное увеличение лимита стека
node --stack-size=2000 app.js хронология.json

# Комбинирование флагов
node --max-old-space-size=4096 --stack-size=2000 app.js хронология.json

# Использование флага --increase-stack (встроенное увеличение стека)
node app.js --increase-stack хронология.json

# Использование флага --memory (встроенное увеличение памяти)
node app.js --memory хронология.json
```

**Потоковая обработка:**
- Для файлов ≥ 100 МБ используется библиотека `stream-json`
- Данные обрабатываются по частям, без загрузки всего файла в память
- CSV файл записывается построчно в потоковом режиме
- Позволяет обрабатывать файлы размером в сотни МБ и ГБ

После обработки будет создан CSV файл с именем `хронология_YYYY-MM-DDTHH-mm-ss.csv`.

### Сравнение CSV файлов (compare-tool.js)

```bash
# Базовое сравнение
node compare-tool.js --file1 хронология1.csv --file2 хронология2.csv

# С выбором стратегии
node compare-tool.js --file1 file1.csv --file2 file2.csv --strategy optimized

# С указанием выходного файла
node compare-tool.js --file1 file1.csv --file2 file2.csv --output result.json

# С настройкой временного окна и точности координат
node compare-tool.js --file1 file1.csv --file2 file2.csv --time-window 60 --coord-precision 2
```

### Опции compare-tool.js

| Опция | Описание | По умолчанию |
|-------|----------|--------------|
| `--file1 <путь>` | Первый CSV файл (обязательно) | - |
| `--file2 <путь>` | Второй CSV файл (обязательно) | - |
| `--strategy <strategy>` | Стратегия сопоставления: `bruteforce`, `optimized`, `simple` | `optimized` |
| `--output <путь>` | Файл для сохранения результатов (JSON) | `matches.json` |
| `--time-window <минуты>` | Временное окно для сопоставления в минутах | `30` |
| `--coord-precision <цифры>` | Точность координат (количество знаков после запятой) | `3` |
| `--geojson` | Экспортировать совпадения в формат GeoJSON | `false` (отключено) |
| `--help` | Показать справку | - |

При использовании флага `--geojson` будет создан дополнительный файл с расширением `.geojson` (например, `matches.geojson`), содержащий совпадающие точки и линии между ними для визуализации на карте.

```bash
# Экспорт совпадений в GeoJSON
node compare-tool.js --file1 file1.csv --file2 file2.csv --geojson

# GeoJSON будет сохранен как matches.geojson (рядом с matches.json)
```

**Стратегии сопоставления:**
- `bruteforce` - медленно, но надежно (вложенные циклы)
- `optimized` - быстро, использует Map для индексации (рекомендуется)
- `simple` - простой перебор

### Примеры вывода

#### Результат работы app.js (статистика)

```
=== Обработка файла: хронология.json ===

Размер файла: 150.25 МБ
Большой файл обнаружен, используется потоковая обработка...
Потоковая обработка JSON файла: хронология.json

✅ Потоковая обработка завершена
Обработано 15230 записей

✅ Файл успешно обработан потоковым методом
📄 CSV:   хронология_2024-01-15T10-30-45.csv
```

Для небольших файлов:
```
=== Обработка файла: хронология.json ===

Размер файла: 45.50 МБ
Файл небольшого размера, используется стандартная обработка...
Чтение JSON файла: хронология.json
Обработка данных...
Обработано 1523 записей

✅ Обработано 1523 записей

💾 Сохранение результатов...
Создание CSV файла...
CSV файл сохранен: хронология_2024-01-15T10-30-45.csv

✅ Результаты сохранены:
📄 CSV:   хронология_2024-01-15T10-30-45.csv

👀 Предпросмотр первых 3 строк:
┌─────────┬─────────────────────────────┬─────────────────────────────┬─────────────┬──────────┬───────────┬──────────────────────┐
│ (index) │         startTime          │          endTime            │ probability │ latitude │ longitude │        source       │
├─────────┼─────────────────────────────┼─────────────────────────────┼─────────────┼──────────┼───────────┼──────────────────────┤
│    0    │ '2024-01-01T10:00:00.000Z' │ '2024-01-01T11:00:00.000Z' │    0.85     │ '50.123'  │  '30.456'  │ 'activity.start.walking' │
│    1    │ '2024-01-01T12:00:00.000Z' │ '2024-01-01T13:00:00.000Z' │    0.92     │ '50.125'  │  '30.458'  │  'visit.restaurant' │
│    2    │ '2024-01-01T14:10:00.000Z' │ '2024-01-01T14:10:00.000Z' │             │ '50.126'  │  '30.459'  │    'timelinePath'   │
└─────────┴─────────────────────────────┴─────────────────────────────┴─────────────┴──────────┴───────────┴──────────────────────┘
```

#### Результат работы compare-tool.js (matches.json)

```json
{
  "file1": "хронология1.csv",
  "file2": "хронология2.csv",
  "options": {
    "strategy": "optimized",
    "timeWindowMinutes": 30,
    "coordPrecision": 3
  },
  "summary": {
    "totalMatches": 245,
    "file1Records": 1523,
    "file2Records": 1489,
    "matchPercentage": 16.09
  },
  "matches": [
    {
      "record1": {
        "startTime": "2024-01-01T10:00:00.000Z",
        "endTime": "2024-01-01T11:00:00.000Z",
        "probability": 0.85,
        "latitude": "50.123",
        "longitude": "30.456",
        "source": "activity.start.walking"
      },
      "record2": {
        "startTime": "2024-01-01T10:02:00.000Z",
        "endTime": "2024-01-01T11:01:00.000Z",
        "probability": 0.88,
        "latitude": "50.123",
        "longitude": "30.456",
        "source": "activity.start.walking"
      },
      "commonCoordinates": {
        "latitude": 50.123,
        "longitude": 30.456
      },
      "timeDifferenceMinutes": 2
    }
  ]
}
```

## Структура проекта

```
matchus/
├── app.js              # Обработка JSON (извлечение данных из Google Takeout)
├── compare-tool.js     # Сравнение CSV файлов (новый инструмент)
├── geojson-export.js   # Экспорт данных в формат GeoJSON для картографии
├── compare.js          # Сравнение CSV (старый инструмент, устаревший)
├── compare1.js         # Альтернативная реализация сравнения
├── compare2.js         # Альтернативная реализация сравнения
├── validator.js        # Валидация данных (координаты, даты, структура)
├── package.json        # Конфигурация npm
├── README.md           # Документация
├── LICENSE             # Лицензия CC BY-NC-SA 4.0
├── .gitignore          # Игнорируемые файлы Git
├── app.test.js         # Тесты для app.js
├── validator.test.js   # Тесты для validator.js
├── compare-tool.test.js # Тесты для compare-tool.js
├── test-optimized.json # Тестовые данные (оптимизированная стратегия)
├── test-simple.json    # Тестовые данные (простая стратегия)
├── test-bruteforce.json # Тестовые данные (bruteforce стратегия)
├── test-custom.json    # Тестовые данные (пользовательская стратегия)
└── .vscode/            # Настройки VSCode
```

## Тестирование

```bash
# Запуск всех тестов
npm test

# Запуск конкретного тестового файла
npx jest app.test.js
npx jest validator.test.js
npx jest compare-tool.test.js
```

## Скрипты npm

```bash
npm start          # Запуск app.js (обработка JSON)
npm run compare    # Запуск compare-tool.js (сравнение CSV)
npm run compare:old  # Запуск старого compare.js
npm test          # Запуск тестов через Jest
```

## Решение проблем

### Ошибка памяти (ERR_STRING_TOO_LONG, heap out of memory)

Для обработки больших файлов истории местоположения:

**Автоматическая потоковая обработка (рекомендуется):**
- Просто запустите `node app.js большой_файл.json`
- Если файл ≥ 100 МБ, будет автоматически использована потоковая обработка
- Это позволяет обрабатывать файлы размером в сотни МБ и даже ГБ

**Ручная настройка (для стандартной обработки):**
```bash
# Увеличение лимита памяти (рекомендуется)
node --max-old-space-size=4096 app.js большой_файл.json

# Увеличение лимита стека
node --stack-size=2000 app.js большой_файл.json

# Комбинирование обоих методов
node --max-old-space-size=4096 --stack-size=2000 app.js большой_файл.json
```

### Некорректные координаты или время

При обработке некорректные записи пропускаются с выводом предупреждений:
```
⚠️  Строка 123: Некорректная широта "invalid". Пропуск...
⚠️  Запись 456: Некорректный формат startTime: "invalid-date". Пропуск...
```

### Несовпадение формата CSV

Инструмент `compare-tool.js` поддерживает альтернативные названия колонок благодаря модулю `validator.js`. Если CSV файл имеет нестандартные заголовки, они будут автоматически сопоставлены с ожидаемыми.
