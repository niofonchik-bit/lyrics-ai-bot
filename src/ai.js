import OpenAI from 'openai';

const intentSchema = {
    type: 'object',
    properties: {
        action: {
            type: 'string',
            enum: [
                'search',
                'translate',
                'explain_song',
                'explain_fragment',
                'help',
                'unknown',
            ],
        },
        query: {
            type: 'string',
            description: 'Свободный поисковый запрос для песни или пустая строка.',
        },
        trackName: {
            type: 'string',
            description: 'Название песни или пустая строка.',
        },
        artistName: {
            type: 'string',
            description: 'Исполнитель или пустая строка.',
        },
        targetLanguage: {
            type: 'string',
            description: 'Язык перевода. По умолчанию русский.',
        },
        fragment: {
            type: 'string',
            description: 'Строка песни, которую нужно объяснить, или пустая строка.',
        },
        sourceText: {
            type: 'string',
            description: 'Текст, который пользователь явно прислал для перевода или объяснения.',
        },
    },
    required: [
        'action',
        'query',
        'trackName',
        'artistName',
        'targetLanguage',
        'fragment',
        'sourceText',
    ],
    additionalProperties: false,
};

function limitInput(text, maxLength = 30000) {
    return text.length > maxLength ? text.slice(0, maxLength) : text;
}

export function createAiService({
    apiKey,
    routerModel,
    textModel,
}) {
    const openai = new OpenAI({ apiKey });

    async function routeMessage(message, activeSong) {
        const currentSong = activeSong
            ? `${activeSong.artistName} — ${activeSong.trackName}`
            : 'не выбрана';

        const response = await openai.responses.create({
            model: routerModel,
            store: false,
            instructions: `
Ты определяешь намерение пользователя музыкального Telegram-бота.

Доступные действия:
- search: найти и показать текст песни;
- translate: перевести выбранную песню или явно присланный текст;
- explain_song: объяснить общий смысл песни;
- explain_fragment: объяснить конкретную строку или фразу;
- help: пользователь просит помощь;
- unknown: запрос не относится к возможностям бота.

Правила:
- обычная строка с названием песни или исполнителем означает search;
- "переведи", "объясни смысл", "что значит эта строка" могут ссылаться на текущую песню;
- если пользователь явно прислал текст после двоеточия или в кавычках, помести его в sourceText или fragment;
- не помещай команду пользователя целиком в sourceText;
- если названа песня, извлеки trackName и artistName;
- query заполняй только словами, полезными для поиска песни;
- targetLanguage по умолчанию "русский";
- не выдумывай название или исполнителя;
- все неприменимые строковые поля должны быть пустыми.

Текущая песня: ${currentSong}.
            `.trim(),
            input: message,
            text: {
                format: {
                    type: 'json_schema',
                    name: 'lyrics_bot_intent',
                    strict: true,
                    schema: intentSchema,
                },
            },
        });

        return JSON.parse(response.output_text);
    }

    async function translateText(text, targetLanguage = 'русский') {
        const response = await openai.responses.create({
            model: textModel,
            store: false,
            max_output_tokens: 5000,
            instructions: `
Переводи присланный текст на ${targetLanguage}.
Сохраняй строфы, переносы строк, настроение и естественность формулировок.
Не добавляй исходный текст, предисловие или комментарии.
Если выражение допускает несколько трактовок, выбирай наиболее естественную в контексте песни.
            `.trim(),
            input: limitInput(text),
        });

        return response.output_text.trim();
    }

    async function explainSong(song) {
        const response = await openai.responses.create({
            model: textModel,
            store: false,
            max_output_tokens: 1800,
            instructions: `
Объясни смысл песни понятным русским языком.
Раскрой основную тему, развитие мысли, настроение, образы и возможные неоднозначности.
Не пересказывай текст построчно и не воспроизводи его целиком.
Короткие фрагменты цитируй только там, где без них невозможно объяснение.
Не утверждай биографические факты об авторе, если они не следуют из текста.
            `.trim(),
            input: `
Песня: ${song.artistName} — ${song.trackName}

Текст:
${limitInput(song.lyrics)}
            `.trim(),
        });

        return response.output_text.trim();
    }

    async function explainFragment(fragment, song) {
        const songContext = song
            ? `
Песня: ${song.artistName} — ${song.trackName}

Контекст текста:
${limitInput(song.lyrics)}
            `.trim()
            : 'Песня не выбрана. Объясни выражение как самостоятельную фразу.';

        const response = await openai.responses.create({
            model: textModel,
            store: false,
            max_output_tokens: 1000,
            instructions: `
Объясни смысл указанной строки или фразы по-русски.
Раскрой буквальный перевод, переносный смысл, эмоциональный оттенок и роль в контексте.
Не воспроизводи остальной текст песни.
Если контекста недостаточно, прямо укажи возможные трактовки.
            `.trim(),
            input: `
${songContext}

Фраза:
${limitInput(fragment, 3000)}
            `.trim(),
        });

        return response.output_text.trim();
    }

    return {
        routeMessage,
        translateText,
        explainSong,
        explainFragment,
    };
}
