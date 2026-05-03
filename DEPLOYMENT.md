# Руководство по развертыванию Matchus как Telegram Mini App

Данное руководство описывает пошаговый процесс публикации приложения Matchus в качестве Telegram Mini App.

## Содержание

1. [Подготовка бота в Telegram](#1-подготовка-бота-в-telegram)
2. [Настройка переменных окружения](#2-настройка-переменных-окружения)
3. [Варианты развертывания](#3-варианты-развертывания)
4. [Настройка HTTPS](#4-настройка-https)
5. [Пошаговая инструкция для VPS](#5-пошаговая-инструкция-для-vps)
6. [Проверка работы](#6-проверка-работы)
7. [Полезные команды](#7-полезные-команды)

---

## 1. Подготовка бота в Telegram

### Создание бота через @BotFather

1. Откройте Telegram и найдите пользователя `@BotFather`
2. Отправьте команду `/newbot`
3. Введите имя бота (например: `Matchus Location Comparison`)
4. Введите username бота (должен заканчиваться на `bot`, например: `matchus_bot`)
5. BotFather вернет токен доступа — сохраните его, он понадобится для настройки переменной `TELEGRAM_BOT_TOKEN`

### Регистрация Mini App

1. В диалоге с `@BotFather` отправьте команду `/newapp`
2. Выберите созданного бота
3. Введите название Mini App (например: `Matchus`)
4. Введите описание (например: `Сравнение списков локаций на карте`)
5. Укажите URL вашего приложения (например: `https://matchus.example.com`)
6. Загрузите иконку приложения (формат PNG, минимум 100x100px)
7. Загрузите скриншоты приложения (опционально)

### Необходимые разрешения и настройки

После создания Mini App убедитесь, что в настройках бота включены:
- **Mini App** — основной функционал приложения
- **Webhook** — для получения обновлений от Telegram
- **Inline Mode** (опционально) — если требуется запуск из чата

---

## 2. Настройка переменных окружения

Создайте файл `.env` на основе примера `.env.example`:

```bash
cp .env.example .env
```

### Описание переменных

| Переменная | Описание | Пример |
|------------|----------|--------|
| `TELEGRAM_BOT_TOKEN` | Токен бота, полученный от @BotFather | `1234567890:ABCdefGHIjklMNOpqrsTUVwxyz` |
| `WEBHOOK_URL` | Полный URL для вебхука Telegram | `https://your-domain.com/webhook` |
| `MINI_APP_URL` | URL вашего Mini App | `https://your-domain.com` |
| `PORT` | Порт, на котором запущен сервер (по умолчанию 3000) | `3000` |
| `SESSION_TTL_MS` | Время жизни сессии в миллисекундах (1 час = 3600000) | `3600000` |

### Как получить TELEGRAM_BOT_TOKEN

Токен выдается автоматически при создании бота через `@BotFather`. Он выглядит как строка из цифр, двоеточия и букв:
```
1234567890:ABCdefGHIjklMNOpqrsTUVwxyz
```

### Настройка WEBHOOK_URL и MINI_APP_URL

- `WEBHOOK_URL` — это URL, на который Telegram будет отправлять обновления. Обычно это `https://your-domain.com/webhook`
- `MINI_APP_URL` — это URL, по которому открывается Mini App. Обычно это `https://your-domain.com`

**Важно:** Оба URL должны использовать протокол **HTTPS** (обязательное требование Telegram).

---

## 3. Варианты развертывания

### Вариант А: Docker

Используйте готовые `Dockerfile` и `docker-compose.yml` для быстрого развертывания.

#### Шаги:

1. Убедитесь, что Docker и Docker Compose установлены на сервере
2. Создайте файл `.env` с настройками (см. [раздел 2](#2-настройка-переменных-окружения))
3. Запустите приложение:

```bash
# Сборка и запуск в фоновом режиме
docker-compose up -d --build

# Просмотр логов
docker-compose logs -f

# Остановка
docker-compose down
```

#### Особенности Dockerfile

Файл [`Dockerfile`](Dockerfile) использует:
- Базовый образ `node:20-alpine` (легковесный)
- Устанавливает зависимости через `npm install`
- Запускает сервер бота: `node bot/server.js`
- Порт 3000 проброшен наружу

#### Особенности docker-compose.yml

Файл [`docker-compose.yml`](docker-compose.yml):
- Создает сервис `app` с именем контейнера `matchus-app`
- Использует переменные из файла `.env`
- Настроен на автоматический перезапуск (`restart: unless-stopped`)
- Для продакшена закомментируйте строки с монтированием томов

---

### Вариант Б: VPS с PM2

Используйте скрипт `deploy.sh` и менеджер процессов PM2 для развертывания на VPS.

#### Шаги:

1. Установите Node.js (версия 20 или выше) и PM2:
```bash
npm install -g pm2
```

2. Настройте файл `.env` (см. [раздел 2](#2-настройка-переменных-окружения))

3. Сделайте скрипт исполняемым и запустите:
```bash
chmod +x deploy.sh
./deploy.sh
```

#### Что делает deploy.sh

Скрипт [`deploy.sh`](deploy.sh):
- Обновляет код из Git (если репозиторий инициализирован)
- Устанавливает production-зависимости (`npm install --production`)
- Перезапускает приложение через PM2 или создает новый процесс
- Сохраняет конфигурацию PM2 для автозапуска после перезагрузки

#### Полезные команды PM2

```bash
# Просмотр списка процессов
pm2 list

# Просмотр логов
pm2 logs matchus-app

# Перезапуск приложения
pm2 restart matchus-app

# Остановка приложения
pm2 stop matchus-app

# Удаление из PM2
pm2 delete matchus-app
```

---

### Вариант В: Облачные платформы

#### Heroku

1. Установите Heroku CLI и войдите в аккаунт
2. Создайте новое приложение:
```bash
heroku create matchus-app
```
3. Настройте переменные окружения:
```bash
heroku config:set TELEGRAM_BOT_TOKEN=your_token
heroku config:set WEBHOOK_URL=https://your-app.herokuapp.com/webhook
heroku config:set MINI_APP_URL=https://your-app.herokuapp.com
```
4. Задеплойте:
```bash
git push heroku main
```

#### Railway

1. Подключите репозиторий на [railway.app](https://railway.app)
2. Railway автоматически определит Node.js приложение
3. Настройте переменные окружения в панели управления
4. Деплой произойдет автоматически

#### Render

1. Создайте новый Web Service на [render.com](https://render.com)
2. Подключите репозиторий с кодом
3. Настройте:
   - **Build Command:** `npm install`
   - **Start Command:** `node bot/server.js`
4. Добавьте переменные окружения в настройках сервиса

**Преимущество облачных платформ:** HTTPS настраивается автоматически, не требуется отдельная настройка SSL-сертификатов.

---

## 4. Настройка HTTPS

### Почему HTTPS обязателен

Telegram требует, чтобы Mini App и вебхуки работали **только по HTTPS**. Это требование безопасности платформы. HTTP-адреса не будут работать.

### Настройка через Nginx и Let's Encrypt

Приложение включает готовый конфигурационный файл [`nginx.conf`](nginx.conf).

#### Шаги настройки:

1. Установите Nginx и Certbot:
```bash
# Ubuntu/Debian
sudo apt update
sudo apt install nginx certbot python3-certbot-nginx
```

2. Настройте Nginx, раскомментировав HTTPS-секцию в `nginx.conf`:
   - Замените `your-domain.com` на ваш домен
   - Укажите правильные пути к SSL-сертификатам

3. Получите SSL-сертификат:
```bash
sudo certbot --nginx -d your-domain.com
```

4. Certbot автоматически настроит Nginx и обновит конфигурацию.

#### Структура nginx.conf

Конфигурация включает:
- HTTP-сервер (порт 80) с редиректом на HTTPS
- HTTPS-сервер (порт 443) с SSL-сертификатами
- Проксирование API-запросов к Node.js приложению (порт 3000)
- Статические файлы Mini App с кешированием

### Облачные платформы

Платформы (Heroku, Railway, Render) предоставляют HTTPS автоматически для всех приложений. Дополнительная настройка не требуется.

---

## 5. Пошаговая инструкция для VPS

Полное руководство по развертыванию на VPS (Ubuntu/Debian).

### Шаг 1: Подключение к серверу

```bash
ssh user@your-server-ip
```

### Шаг 2: Установка необходимого ПО

```bash
# Обновление пакетов
sudo apt update && sudo apt upgrade -y

# Установка Node.js 20.x
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Проверка версии
node --version
npm --version

# Установка Nginx
sudo apt install -y nginx

# Установка Certbot для SSL
sudo apt install -y certbot python3-certbot-nginx

# Установка PM2
sudo npm install -g pm2
```

### Шаг 3: Получение проекта

```bash
# Клонирование репозитория (замените на ваш URL)
git clone https://github.com/your-username/matchus.git
cd matchus

# Или загрузите архив и распакуйте
```

### Шаг 4: Настройка переменных окружения

```bash
cp .env.example .env
nano .env
```

Заполните файл `.env`:
```
TELEGRAM_BOT_TOKEN=ваш_токен_от_BotFather
WEBHOOK_URL=https://your-domain.com/webhook
MINI_APP_URL=https://your-domain.com
PORT=3000
SESSION_TTL_MS=3600000
```

### Шаг 5: Настройка Nginx

Скопируйте конфигурацию:
```bash
sudo cp nginx.conf /etc/nginx/sites-available/matchus
sudo ln -s /etc/nginx/sites-available/matchus /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

Отредактируйте `/etc/nginx/sites-available/matchus`, заменив `your-domain.com` на ваш домен и раскомментировав HTTPS-секцию.

### Шаг 6: Получение SSL-сертификата

```bash
sudo certbot --nginx -d your-domain.com
```

Следуйте инструкциям на экране. Certbot настроит автообновление сертификатов.

### Шаг 7: Запуск приложения

#### Вариант с PM2:
```bash
chmod +x deploy.sh
./deploy.sh
```

#### Вариант с Docker:
```bash
docker-compose up -d --build
```

### Шаг 8: Настройка вебхука

После запуска приложения установите вебхук в Telegram:

```bash
curl -F "url=https://your-domain.com/webhook" https://api.telegram.org/bot<YOUR_BOT_TOKEN>/setWebhook
```

Замените `<YOUR_BOT_TOKEN>` на ваш токен.

### Шаг 9: Настройка автозапуска PM2 (если используется)

```bash
pm2 startup
# Выполните команду, которую выдаст PM2
pm2 save
```

---

## 6. Проверка работы

### Тестирование бота

1. Откройте Telegram и найдите вашего бота по username
2. Отправьте команду `/start`
3. Бот должен ответить приветствием и кнопкой для открытия Mini App

### Тестирование Mini App

1. Нажмите кнопку для открытия Mini App в боте
2. Приложение должно открыться внутри Telegram
3. Проверьте загрузку файлов и сравнение локаций

### Проверка вебхука

```bash
curl https://api.telegram.org/bot<YOUR_BOT_TOKEN>/getWebhookInfo
```

Ожидаемый результат:
```json
{
  "ok": true,
  "result": {
    "url": "https://your-domain.com/webhook",
    "has_custom_certificate": false,
    "pending_update_count": 0,
    "last_error_date": null,
    "last_error_message": null,
    "max_connections": 40,
    "ip_address": "..."
  }
}
```

### Частые проблемы и их решение

| Проблема | Возможная причина | Решение |
|----------|-------------------|---------|
| Бот не отвечает | Неверный токен | Проверьте `TELEGRAM_BOT_TOKEN` в `.env` |
| Mini App не открывается | Нет HTTPS | Убедитесь, что домен использует SSL |
| Вебхук не работает | Неверный URL | Проверьте `WEBHOOK_URL`, должен быть HTTPS |
| 502 Bad Gateway | Node.js не запущен | Проверьте `pm2 list` или `docker-compose ps` |
| 404 при открытии Mini App | Неверный `MINI_APP_URL` | Проверьте настройки в `.env` и BotFather |

### Просмотр логов

```bash
# PM2
pm2 logs matchus-app

# Docker
docker-compose logs -f

# Nginx
sudo tail -f /var/log/nginx/error.log
sudo tail -f /var/log/nginx/access.log
```

---

## 7. Полезные команды

### Управление вебхуком

```bash
# Установка вебхука
curl -F "url=https://your-domain.com/webhook" https://api.telegram.org/bot<TOKEN>/setWebhook

# Проверка информации о вебхуке
curl https://api.telegram.org/bot<TOKEN>/getWebhookInfo

# Удаление вебхука (для отладки)
curl https://api.telegram.org/bot<TOKEN>/deleteWebhook
```

### Управление PM2

```bash
# Список процессов
pm2 list

# Логи (последние 100 строк)
pm2 logs matchus-app --lines 100

# Перезапуск
pm2 restart matchus-app

# Мониторинг в реальном времени
pm2 monit
```

### Управление Docker

```bash
# Просмотр работающих контейнеров
docker-compose ps

# Логи
docker-compose logs -f

# Перезапуск
docker-compose restart

# Остановка
docker-compose down

# Пересборка и запуск
docker-compose up -d --build
```

### Обновление приложения

```bash
# Через deploy.sh
./deploy.sh

# Через Git + PM2
git pull origin main
npm install --production
pm2 restart matchus-app

# Через Docker
git pull origin main
docker-compose up -d --build
```

---

## Дополнительная информация

- [README.md](README.md) — общее описание проекта
- [bot/README.md](bot/README.md) — документация по боту
- [TESTING.md](TESTING.md) — инструкции по тестированию

---

**Автор:** Matchus Team  
**Версия:** 1.0  
**Дата:** Май 2026
