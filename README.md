# Lyrics AI Bot

Telegram-бот на JavaScript, который:

- ищет текст песни через LRCLIB;
- понимает свободные формулировки через OpenAI;
- переводит выбранный текст;
- объясняет общий смысл песни;
- объясняет отдельные строки и фразы;
- помнит выбранную песню в рамках текущего процесса.

## 1. Создание Telegram-бота

1. Открой `@BotFather` в Telegram.
2. Выполни команду `/newbot`.
3. Задай имя и username.
4. Сохрани полученный токен.

## 2. Создание OpenAI API-ключа

Создай API-ключ в панели OpenAI Platform. API оплачивается отдельно от подписки ChatGPT.

## 3. Запуск

Требуется Node.js 22 или новее.

```bash
npm install
```

Скопируй файл окружения:

```bash
cp .env.example .env
```

На Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

Заполни `.env`:

```env
TELEGRAM_BOT_TOKEN=токен_от_BotFather
OPENAI_API_KEY=ключ_OpenAI

OPENAI_ROUTER_MODEL=gpt-5.4-nano
OPENAI_TEXT_MODEL=gpt-5.4-mini
```

Запусти:

```bash
npm start
```

Для разработки с автоматическим перезапуском:

```bash
npm run dev
```

## Примеры сообщений

```text
Numb Linkin Park
найди текст The Emptiness Machine
переведи Numb от Linkin Park
переведи эту песню
объясни смысл песни
что значит фраза "I've become so numb"
переведи: I tried so hard and got so far
```

## Как устроен проект

- `src/index.js` — сценарии бота и long polling;
- `src/telegram.js` — запросы к Telegram Bot API;
- `src/lyrics.js` — поиск текстов через LRCLIB;
- `src/ai.js` — определение намерения, перевод и объяснения;
- `src/session.js` — временный контекст чатов;
- `src/text.js` — разбиение длинных сообщений и клавиатуры.

## Что изменить перед публичным запуском

Текущая версия подходит для личного прототипа. Перед публичным или коммерческим запуском:

1. Замени LRCLIB на поставщика с подходящей лицензией на показ и обработку текстов.
2. Храни сессии в PostgreSQL или Redis, иначе они исчезают после перезапуска.
3. Добавь ограничения частоты запросов и дневные лимиты.
4. Перейди с long polling на webhook.
5. Добавь журнал ошибок и учёт стоимости запросов.
6. Проверь, разрешает ли лицензия источника перевод и полный показ текста.
