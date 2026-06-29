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

const songExplanationSchema = {
    type: 'object',
    properties: {
        summary: {
            type: 'string',
            description: 'Краткая главная мысль песни в 2-4 предложениях.',
        },
        sections: {
            type: 'array',
            items: {
                type: 'object',
                properties: {
                    title: {
                        type: 'string',
                        description: 'Короткий заголовок раздела.',
                    },
                    explanation: {
                        type: 'string',
                        description: 'Чёткое объяснение раздела без повторов.',
                    },
                    points: {
                        type: 'array',
                        items: {
                            type: 'string',
                        },
                    },
                },
                required: ['title', 'explanation', 'points'],
                additionalProperties: false,
            },
        },
        conclusion: {
            type: 'string',
            description: 'Итог в 1-3 предложениях.',
        },
    },
    required: ['summary', 'sections', 'conclusion'],
    additionalProperties: false,
};

const fragmentExplanationSchema = {
    type: 'object',
    properties: {
        literalMeaning: {
            type: 'string',
        },
        contextualMeaning: {
            type: 'string',
        },
        nuance: {
            type: 'string',
        },
        conclusion: {
            type: 'string',
        },
    },
    required: [
        'literalMeaning',
        'contextualMeaning',
        'nuance',
        'conclusion',
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

    async function createStructuredResponse({
        model,
        instructions,
        input,
        schema,
        schemaName,
        maxOutputTokens,
    }) {
        const response = await openai.responses.create({
            model,
            store: false,
            max_output_tokens: maxOutputTokens,
            instructions,
            input,
            text: {
                format: {
                    type: 'json_schema',
                    name: schemaName,
                    strict: true,
                    schema,
                },
            },
        });

        return JSON.parse(response.output_text);
    }

    async function routeMessage(message, activeSong) {
        const currentSong = activeSong
            ? `${activeSong.artistName} — ${activeSong.trackName}`
            : 'не выбрана';

        return createStructuredResponse({
            model: routerModel,
            schema: intentSchema,
            schemaName: 'lyrics_bot_intent',
            maxOutputTokens: 500,
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
- «переведи», «объясни смысл», «что значит эта строка» могут ссылаться на текущую песню;
- если пользователь явно прислал текст после двоеточия или в кавычках, помести его в sourceText или fragment;
- не помещай команду пользователя целиком в sourceText;
- если названа песня, извлеки trackName и artistName;
- query заполняй только словами, полезными для поиска песни;
- targetLanguage по умолчанию «русский»;
- не выдумывай название или исполнителя;
- все неприменимые строковые поля должны быть пустыми.

Текущая песня: ${currentSong}.
            `.trim(),
            input: message,
        });
    }

    async function translateText(text, targetLanguage = 'русский') {
        const response = await openai.responses.create({
            model: textModel,
            store: false,
            max_output_tokens: 5000,
            instructions: `
Переведи текст на ${targetLanguage}.

Требования:
- сохраняй строфы и переносы строк;
- передавай смысл естественно, а не дословно там, где это звучит неестественно;
- не добавляй вступление, вывод, пояснения или исходный текст;
- не используй Markdown, HTML, заголовки и служебные символы форматирования;
- не цензурируй смысл без необходимости;
- если строка неоднозначна, выбирай наиболее естественное значение в контексте песни.
            `.trim(),
            input: limitInput(text),
        });

        return response.output_text.trim();
    }



    async function researchSongContext(song) {
        const response = await openai.responses.create({
            model: textModel,
            store: false,
            tools: [
                {
                    type: 'web_search',
                    search_context_size: 'medium',
                },
            ],
            tool_choice: 'required',
            include: ['web_search_call.action.sources'],
            max_output_tokens: 1800,
            instructions: `
Найди проверяемый контекст песни для последующего смыслового анализа.

Изучи только сведения, которые могут влиять на понимание текста:
- официальные комментарии исполнителя, авторов и продюсеров;
- интервью о песне или альбоме;
- обстоятельства создания и выпуска;
- подтверждённые культурные, исторические и языковые отсылки;
- значения имён, терминов, сленга и образов;
- авторские кредиты и достоверные материалы музыкальных изданий.

Приоритет источников:
1. официальные страницы исполнителя, лейбла и издателя;
2. интервью с прямыми цитатами исполнителя или авторов;
3. надёжные музыкальные и новостные издания;
4. справочные источники для отдельных терминов и событий.

Не используй фанатские теории как установленные факты.
Не считай содержание клипа объяснением текста, если связь не подтверждена.
Не подгоняй биографию исполнителя под песню.
Если достоверного контекста нет, прямо укажи это.
Отделяй подтверждённые факты от интерпретаций.

Верни краткую исследовательскую справку без Markdown.
        `.trim(),
            input: `
Исполнитель: ${song.artistName}
Песня: ${song.trackName}
Альбом: ${song.albumName || 'неизвестен'}
        `.trim(),
        });

        return {
            text: response.output_text.trim(),
            sources: extractWebSources(response).slice(0, 6),
        };
    }

    async function explainSong(song, useWebContext = false) {
        const research = useWebContext
            ? await researchSongContext(song)
            : {
                text: 'Дополнительный веб-контекст не запрашивался.',
                sources: [],
            };

        const explanation = await createStructuredResponse({
            model: textModel,
            schema: songExplanationSchema,
            schemaName: 'song_explanation',
            maxOutputTokens: 1600,
            instructions: `
Объясни смысл песни понятным русским языком.

Используй:
- сам текст песни как основной источник;
- найденный открытый контекст только там, где он действительно помогает;
- подтверждённые комментарии исполнителя или авторов;
- сведения об исторических, культурных и языковых отсылках.

Строго разделяй:
- факты, подтверждённые источниками;
- наиболее вероятное прочтение текста;
- неоднозначные или возможные трактовки.

Не объясняй песню исключительно через биографию исполнителя.
Не выдавай совпадение с событиями жизни исполнителя за доказанный замысел.
Не используй фанатские теории как факты.
Если открытые источники не подтверждают конкретную трактовку, прямо скажи об этом.
Если публичного объяснения автора нет, анализируй текст самостоятельно, но обозначай это как интерпретацию.

Требования к ответу:
- сначала сформулируй главную мысль;
- затем дай от 2 до 4 содержательных разделов;
- не пересказывай песню построчно;
- избегай повторов и общих фраз;
- не используй Markdown или HTML;
- не добавляй предложение продолжить разговор.
        `.trim(),
            input: `
Песня: ${song.artistName} — ${song.trackName}

Текст:
${limitInput(song.lyrics)}

Контекст из открытых источников:
${limitInput(research.text, 10000)}
        `.trim(),
        });

        return {
            ...explanation,
            sources: research.sources,
        };
    }

    async function explainFragment(fragment, song) {
        const songContext = song
            ? `
Песня: ${song.artistName} — ${song.trackName}

Контекст текста:
${limitInput(song.lyrics)}
            `.trim()
            : 'Песня не выбрана. Объясни выражение как самостоятельную фразу.';

        return createStructuredResponse({
            model: textModel,
            schema: fragmentExplanationSchema,
            schemaName: 'fragment_explanation',
            maxOutputTokens: 800,
            instructions: `
Объясни указанную строку или фразу по-русски.

Требования:
- отвечай кратко и конкретно;
- отдельно укажи буквальный смысл, смысл в контексте и эмоциональный оттенок;
- если трактовок несколько, перечисли только наиболее вероятные;
- не воспроизводи остальной текст песни;
- не используй Markdown и HTML;
- не добавляй предложение продолжить разговор;
- не утверждай то, чего нельзя понять из текста.
            `.trim(),
            input: `
${songContext}

Фраза:
${limitInput(fragment, 3000)}
            `.trim(),
        });
    }

    function extractWebSources(response) {
        const sources = response.output
            .filter(item => item.type === 'message')
            .flatMap(item => item.content || [])
            .flatMap(content => content.annotations || [])
            .filter(annotation => annotation.type === 'url_citation')
            .map(annotation => ({
                title: annotation.title,
                url: annotation.url,
            }));

        return [
            ...new Map(
                sources.map(source => [source.url, source]),
            ).values(),
        ];
    }

    return {
        routeMessage,
        translateText,
        explainSong,
        explainFragment,
    };
}
