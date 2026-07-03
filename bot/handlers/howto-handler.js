const START_TEXT =
`👋 <b>Добро пожаловать в MatchUs!</b>

Я помогаю сравнить историю местоположений с друзьями через Google Takeout.

<b>Как это работает:</b>
1. Ты и твой друг отправляете мне свои <b>Location History.json</b> (Google Takeout)
2. Я нахожу места, где вы оба были в одно время
3. Результаты показываются в удобном Mini App

<b>Команды:</b>
/compare @username — начать сравнение (ответь на сообщение друга)
/howto — инструкция по Google Takeout
/help — эта справка

<i>Сначала получите файл через /howto, затем используйте /compare.</i>`;

const HOWTO_TEXT =
`📱 <b>Как получить историю местоположений Google</b>

1. Перейди на <a href="https://takeout.google.com">takeout.google.com</a>
2. Нажми <b>«Снять все»</b>, затем отметь только <b>«История местоположений»</b> (Location History)
3. Выбери формат: <b>JSON</b>
4. Размер архива: <b>«Один архив»</b> → <b>«Создать экспорт»</b>
5. Google пришлёт письмо — скачай архив
6. Внутри архива найди файл:
   <code>Takeout/История местоположений/Location History.json</code>
7. Отправь этот <b>.json</b> файл сюда, и я его обработаю

⚠️ Файл может быть большим (сотни МБ) — MatchUs поддерживает потоковую обработку.`;

class HowtoHandler {
  constructor(bot) {
    this.bot = bot;
    this.setupHandlers();
  }

  setupHandlers() {
    this.bot.onText(/\/start/, (msg) => {
      this.handleStart(msg);
    });
    this.bot.onText(/\/help/, (msg) => {
      this.handleStart(msg);
    });
    this.bot.onText(/\/howto/, (msg) => {
      this.handleHowto(msg);
    });
  }

  async handleStart(msg) {
    const chatId = msg.chat.id;
    this.bot.sendMessage(chatId, START_TEXT, {
      parse_mode: 'HTML',
      disable_web_page_preview: true,
      reply_to_message_id: msg.message_id
    });
  }

  async handleHowto(msg) {
    const chatId = msg.chat.id;
    this.bot.sendMessage(chatId, HOWTO_TEXT, {
      parse_mode: 'HTML',
      disable_web_page_preview: true,
      reply_to_message_id: msg.message_id
    });
  }
}

module.exports = HowtoHandler;
