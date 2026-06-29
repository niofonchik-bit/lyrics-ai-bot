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
                'credits',
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
        paragraphs: {
            type: 'array',
            description: 'Связные абзацы разбора. Первый сразу отвечает, о чём песня.',
            items: {
                type: 'string',
            },
            minItems: 1,
            maxItems: 6,
        },
        details: {
            type: 'array',
            description: 'Только конкретные отсылки или детали, которым действительно нужен отдельный акцент.',
            items: {
                type: 'object',
                properties: {
                    title: {
                        type: 'string',
                    },
                    text: {
                        type: 'string',
                    },
                },
                required: ['title', 'text'],
                additionalProperties: false,
            },
            maxItems: 4,
        },
        sourceNote: {
            type: 'string',
            description: 'Короткая оговорка об источниках или неопределённости. Пустая строка, если она не нужна.',
        },
    },
    required: ['paragraphs', 'details', 'sourceNote'],
    additionalProperties: false,
};

const fragmentExplanationSchema = {
    type: 'object',
    properties: {
        literalTranslation: {
            type: 'string',
            description: 'Буквальный перевод фразы. Пустая строка, если перевод не нужен.',
        },
        explanation: {
            type: 'string',
            description: 'Главное объяснение смысла фразы в контексте.',
        },
        alternatives: {
            type: 'array',
            description: 'Другие правдоподобные трактовки. Пустой массив, если их нет.',
            items: {
                type: 'string',
            },
            maxItems: 3,
        },
    },
    required: ['literalTranslation', 'explanation', 'alternatives'],
    additionalProperties: false,
};

const songCreditsSchema = {
    type: 'object',
    properties: {
        summary: {
            type: 'string',
            description: 'Одна короткая фраза о полноте найденных данных. Пустая строка, если не нужна.',
        },
        contributors: {
            type: 'array',
            items: {
                type: 'object',
                properties: {
                    name: {
                        type: 'string',
                    },
                    roles: {
                        type: 'array',
                        items: {
                            type: 'string',
                        },
                    },
                    note: {
                        type: 'string',
                        description: 'Короткое уточнение. Пустая строка, если не требуется.',
                    },
                    profileSourceIndex: {
                        type: 'integer',
                        description: 'Номер источника со страницей человека. 0, если такой страницы нет.',
                    },
                    creditSourceIndexes: {
                        type: 'array',
                        items: {
                            type: 'integer',
                        },
                    },
                },
                required: [
                    'name',
                    'roles',
                    'note',
                    'profileSourceIndex',
                    'creditSourceIndexes',
                ],
                additionalProperties: false,
            },
            maxItems: 50,
        },
        sourceNote: {
            type: 'string',
            description: 'Сообщение о неполных или противоречивых кредитах. Пустая строка, если не нужно.',
        },
    },
    required: ['summary', 'contributors', 'sourceNote'],
    additionalProperties: false,
};

const naturalWritingStyle = `
# Манера письма

Пиши как человек, который хорошо разбирается в музыке и спокойно объясняет её знакомому. Тон живой, уверенный и доброжелательный, но без пафоса, рекламных формулировок и лекционного голоса.

Начинай сразу с содержательного ответа. Не трать первый абзац на вступление о том, что песня «интересная», «многослойная» или «заслуживает внимания».

Используй обычные русские слова. Конкретная мысль лучше абстрактных формулировок вроде «эмоциональная динамика», «смысловой пласт» или «нарративная конструкция», если без них можно обойтись.

Чередуй короткие и средние предложения. Не делай все абзацы одинаковыми по длине и строению. Один абзац должен развивать одну мысль.

Не повторяй одну идею в начале, в отдельных разделах и в финальном выводе. Если мысль уже сказана достаточно ясно, двигайся дальше и закончи ответ без обязательного итога.

Не используй привычные шаблоны машинного текста:
- «это не просто X, а Y»;
- «не столько X, сколько Y»;
- «не только X, но и Y»;
- «важно отметить»;
- «стоит отметить»;
- «таким образом»;
- «в конечном счёте»;
- «песня исследует тему»;
- «композиция служит метафорой»;
- «на нескольких уровнях»;
- «здесь речь идёт о»;
- «можно сказать, что».

Не строй текст из симметричных противопоставлений и красивых, но пустых обобщений. Не приписывай каждой строке «глубокий символизм».

Когда факт подтверждён источником, сообщай его прямо. Когда это трактовка, обозначь неопределённость один раз рядом с этой мыслью: «похоже», «скорее всего», «эту строку можно понять как». Не повторяй оговорку в каждом абзаце.

Ориентир по стилю:

Плохо: «Это не просто песня о движении, а настоящий манифест внутренней свободы и самоопределения».
Хорошо: «Песня построена вокруг желания двигаться дальше без оглядки на чужие ожидания».

Плохо: «Таким образом, композиция исследует многогранную тему эмоциональной трансформации».
Хорошо: «К финалу раздражение сменяется решимостью: герой уже не спорит с прошлым, а уходит».
`.trim();

function limitInput(text = '', maxLength = 30000) {
    return text.length > maxLength ? text.slice(0, maxLength) : text;
}

function extractWebSources(response) {
    const sources = [];

    for (const item of response.output || []) {
        if (item.type === 'web_search_call') {
            for (const source of item.action?.sources || []) {
                if (source?.url) {
                    sources.push({
                        title: source.title || source.url,
                        url: source.url,
                    });
                }
            }
        }

        if (item.type !== 'message') {
            continue;
        }

        for (const content of item.content || []) {
            for (const annotation of content.annotations || []) {
                if (annotation.type === 'url_citation' && annotation.url) {
                    sources.push({
                        title: annotation.title || annotation.url,
                        url: annotation.url,
                    });
                }
            }
        }
    }

    return [
        ...new Map(
            sources.map(source => [source.url, source]),
        ).values(),
    ];
}

function normalizeSourceIndexes(indexes, sources) {
    return [...new Set(indexes)]
        .filter(index => (
            Number.isInteger(index)
            && index > 0
            && index <= sources.length
        ));
}

function normalizeSongCredits(credits, sources) {
    const contributors = [];
    const knownNames = new Map();

    for (const contributor of credits.contributors || []) {
        const name = contributor.name?.trim();

        if (!name) {
            continue;
        }

        const key = name.toLocaleLowerCase('ru');
        const roles = [...new Set(
            (contributor.roles || [])
                .map(role => role.trim())
                .filter(Boolean),
        )];
        const creditSourceIndexes = normalizeSourceIndexes(
            contributor.creditSourceIndexes || [],
            sources,
        );
        const profileSourceIndex = (
            contributor.profileSourceIndex > 0
            && contributor.profileSourceIndex <= sources.length
        )
            ? contributor.profileSourceIndex
            : 0;

        if (knownNames.has(key)) {
            const existing = knownNames.get(key);
            existing.roles = [...new Set([...existing.roles, ...roles])];
            existing.creditSourceIndexes = [...new Set([
                ...existing.creditSourceIndexes,
                ...creditSourceIndexes,
            ])];

            if (!existing.profileSourceIndex && profileSourceIndex) {
                existing.profileSourceIndex = profileSourceIndex;
            }

            if (!existing.note && contributor.note?.trim()) {
                existing.note = contributor.note.trim();
            }

            continue;
        }

        const normalizedContributor = {
            name,
            roles,
            note: contributor.note?.trim() || '',
            profileSourceIndex,
            creditSourceIndexes,
        };

        knownNames.set(key, normalizedContributor);
        contributors.push(normalizedContributor);
    }

    return {
        summary: credits.summary?.trim() || '',
        contributors,
        sourceNote: credits.sourceNote?.trim() || '',
        sources,
    };
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
        verbosity = 'low',
    }) {
        const response = await openai.responses.create({
            model,
            store: false,
            max_output_tokens: maxOutputTokens,
            instructions,
            input,
            text: {
                verbosity,
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
- credits: показать авторов, продюсеров, исполнителей и других участников создания песни;
- help: пользователь просит помощь;
- unknown: запрос не относится к возможностям бота.

Правила:
- обычная строка с названием песни или исполнителем означает search;
- «переведи», «объясни смысл», «что значит эта строка», «кто написал», «покажи авторов» могут ссылаться на текущую песню;
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
            text: {
                verbosity: 'low',
            },
            instructions: `
Переведи текст на ${targetLanguage}.

Сохраняй строфы и переносы строк. Передавай смысл естественно: дословный перевод подходит только там, где он нормально звучит на целевом языке.

Не добавляй вступление, вывод, пояснения, исходный текст, Markdown, HTML или служебные символы. Не сглаживай грубость и эмоциональную окраску оригинала без причины. Если строка неоднозначна, выбери значение, которое лучше всего подходит к соседним строкам.
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
            text: {
                verbosity: 'low',
            },
            instructions: `
Найди проверяемый контекст песни, который действительно помогает понять её текст.

Ищи официальные комментарии исполнителя, авторов и продюсеров, интервью о песне или альбоме, обстоятельства создания и выпуска, подтверждённые культурные и языковые отсылки, значения имён, сленга и образов.

Приоритет источников: официальные страницы исполнителя и лейбла, прямые интервью, авторитетные музыкальные издания и справочные источники. Фанатские теории можно упомянуть только как неподтверждённые и только если они заметно распространены.

Не связывай текст с биографией исполнителя без источника. Не используй клип как доказательство смысла песни, если авторы не подтвердили связь. Если официального объяснения нет, скажи об этом одной короткой фразой.

Верни компактные исследовательские заметки без Markdown и без общего литературного разбора песни.
            `.trim(),
            input: `
Исполнитель: ${song.artistName}
Песня: ${song.trackName}
Альбом: ${song.albumName || 'неизвестен'}
            `.trim(),
        });

        return {
            text: response.output_text.trim(),
            sources: extractWebSources(response).slice(0, 12),
        };
    }

    async function explainSong(song, useWebContext = false) {
        const research = useWebContext
            ? await researchSongContext(song)
            : {
                text: '',
                sources: [],
            };

        const modeInstructions = useWebContext
            ? `
Используй найденный контекст только там, где он меняет или уточняет понимание текста. Отделяй подтверждённые сведения от собственной интерпретации, но не превращай ответ в отчёт о проверке фактов. Если официального объяснения нет, достаточно один раз сказать об этом в sourceNote.
            `.trim()
            : `
Опирайся прежде всего на текст песни. Не придумывай намерения автора и не ссылайся на биографические факты, которых нет во входных данных. sourceNote обычно должна быть пустой.
            `.trim();

        const explanation = await createStructuredResponse({
            model: textModel,
            schema: songExplanationSchema,
            schemaName: 'song_explanation',
            maxOutputTokens: useWebContext ? 1900 : 1300,
            instructions: `
# Задача

Объясни смысл песни по-русски так, чтобы ответ было приятно читать в Telegram.

${modeInstructions}

# Содержание

Первый абзац должен сразу и конкретно объяснять, о чём песня. Дальше раскрой только те образы, повороты или отсылки, без которых смысл остаётся неполным.

Обычно достаточно 2–4 абзацев. Для сложной песни можно написать больше, но каждый абзац должен добавлять новую мысль. Не пересказывай текст построчно. Не делай обязательный финальный вывод.

Поле details используй только для конкретных отсылок, имён, игры слов или фактов, которые удобнее вынести отдельно. Оно может быть пустым.

${naturalWritingStyle}

Не используй Markdown или HTML внутри полей ответа.
            `.trim(),
            input: `
Песня: ${song.artistName} — ${song.trackName}
Альбом: ${song.albumName || 'неизвестен'}

Текст:
${limitInput(song.lyrics)}

${useWebContext ? `Проверенный контекст из открытых источников:\n${limitInput(research.text, 10000)}` : ''}
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
            maxOutputTokens: 700,
            instructions: `
Объясни указанную строку или фразу по-русски.

Сначала дай буквальный перевод только тогда, когда он помогает. В explanation сразу объясни, что фраза значит в контексте песни и какой у неё оттенок. Обычно достаточно одного плотного абзаца. alternatives используй только для действительно правдоподобных вариантов прочтения.

Не пересказывай остальной текст, не дроби ответ на формальные разделы и не заканчивай повтором уже сказанного.

${naturalWritingStyle}

Не используй Markdown или HTML внутри полей ответа.
            `.trim(),
            input: `
${songContext}

Фраза:
${limitInput(fragment, 3000)}
            `.trim(),
        });
    }

    async function researchSongCredits(song) {
        const response = await openai.responses.create({
            model: textModel,
            store: false,
            tools: [
                {
                    type: 'web_search',
                    search_context_size: 'high',
                },
            ],
            tool_choice: 'required',
            include: ['web_search_call.action.sources'],
            max_output_tokens: 3000,
            text: {
                verbosity: 'low',
            },
            instructions: `
Найди максимально полный и проверяемый список людей, участвовавших в создании конкретной песни.

Проверь исполнителей и приглашённых артистов, авторов текста, композиторов, продюсеров, аранжировщиков, программистов, инструменталистов, вокальных продюсеров, звукорежиссёров, инженеров записи, редакторов, специалистов по сведению и мастерингу, а также других людей, прямо указанных в официальных кредитах.

Не добавляй компании, лейблы и студии в список людей. Не выводи человека только потому, что он обычно работает с артистом. Не угадывай роли по профессии человека.

Приоритет источников:
1. официальные страницы релиза, лейбла и издателя;
2. буклеты и официальные кредиты альбома;
3. базы прав на произведения и каталоги издателей;
4. MusicBrainz, Discogs, AllMusic и другие каталоги с кредитами;
5. надёжные музыкальные издания.

Для каждого найденного человека зафиксируй точное имя, все подтверждённые роли и источник, где эти роли указаны. По возможности найди отдельную официальную или справочную страницу самого человека. Отмечай противоречия между источниками. Объединяй повторяющиеся записи одного человека.

Верни исследовательские заметки с фактами и ссылочными цитатами. Не пиши художественное вступление и не объясняй смысл песни.
            `.trim(),
            input: `
Исполнитель: ${song.artistName}
Песня: ${song.trackName}
Альбом: ${song.albumName || 'неизвестен'}
Продолжительность: ${song.duration || 'неизвестна'}
            `.trim(),
        });

        return {
            text: response.output_text.trim(),
            sources: extractWebSources(response).slice(0, 30),
        };
    }

    async function getSongCredits(song) {
        const research = await researchSongCredits(song);
        const indexedSources = research.sources
            .map((source, index) => (
                `[${index + 1}] ${source.title}\n${source.url}`
            ))
            .join('\n\n');

        const credits = await createStructuredResponse({
            model: textModel,
            schema: songCreditsSchema,
            schemaName: 'song_credits',
            maxOutputTokens: 3200,
            instructions: `
Собери из исследовательских заметок список людей, участвовавших в создании песни.

Включай только людей и роли, которые подтверждаются заметками и перечисленными источниками. Не заполняй пробелы догадками. Если один человек указан несколько раз, объедини все его роли в одну запись. Названия ролей переводи на русский и формулируй коротко.

profileSourceIndex — номер источника с отдельной страницей человека. Если такой страницы среди источников нет, укажи 0.

creditSourceIndexes — номера источников, подтверждающих участие и роли человека. Используй только номера из предоставленного списка. Не придумывай URL и номера.

summary не должна пересказывать список. sourceNote используй для важных пробелов или противоречий. Если данные выглядят полными и согласованными, эти поля могут быть пустыми.
            `.trim(),
            input: `
Песня: ${song.artistName} — ${song.trackName}
Альбом: ${song.albumName || 'неизвестен'}

Исследовательские заметки:
${limitInput(research.text, 18000)}

Пронумерованные источники:
${limitInput(indexedSources, 16000)}
            `.trim(),
        });

        return normalizeSongCredits(credits, research.sources);
    }

    return {
        routeMessage,
        translateText,
        explainSong,
        explainFragment,
        getSongCredits,
    };
}
