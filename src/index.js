import { config } from './config.js';
import { createAiService } from './ai.js';
import { getUserErrorMessage } from './errors.js';
import { searchLyrics } from './lyrics.js';
import {
    getSession,
    resetSession,
    trackMessage,
    untrackMessage,
} from './session.js';
import { createTelegramClient } from './telegram.js';
import {
    createClearKeyboard,
    createSearchKeyboard,
    createSongActionsKeyboard,
    escapeHtml,
    formatSongTitle,
    renderFragmentExplanation,
    renderSongExplanation,
    renderSongCredits,
    splitText,
} from './text.js';

const telegram = createTelegramClient(config.telegramToken);
const ai = createAiService({
    apiKey: config.openaiApiKey,
    routerModel: config.routerModel,
    textModel: config.textModel,
});

const commands = [
    { command: 'start', description: 'Запустить бота' },
    { command: 'search', description: 'Найти песню по названию' },
    { command: 'current', description: 'Показать выбранную песню' },
    { command: 'translate', description: 'Перевести выбранную песню' },
    { command: 'explain', description: 'Объяснить смысл выбранной песни' },
    { command: 'credits', description: 'Показать авторов и участников записи' },
    { command: 'clear', description: 'Очистить сообщения этого диалога' },
    { command: 'help', description: 'Показать примеры запросов' },
];

const helpText = `
<b>Я умею искать тексты песен и разбирать их смысл.</b>

<b>Примеры:</b>
• Numb Linkin Park
• найди текст The Emptiness Machine
• переведи Numb от Linkin Park
• переведи эту песню
• объясни смысл песни
• покажи авторов песни
• что значит фраза «I've become so numb»
• переведи: I tried so hard and got so far

После выбора песни я запоминаю её до перезапуска бота или команды /clear.
`.trim();

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function sendTrackedMessage(chatId, text, options = {}) {
    const message = await telegram.sendMessage(chatId, text, options);
    trackMessage(chatId, message.message_id);
    return message;
}

async function deleteMessageQuietly(chatId, messageId) {
    try {
        await telegram.deleteMessage(chatId, messageId);
    } catch (error) {
        console.warn(`Не удалось удалить сообщение ${messageId}:`, error.message);
    } finally {
        untrackMessage(chatId, messageId);
    }
}

async function sendLongPlainMessage(chatId, text, replyMarkup) {
    const chunks = splitText(text);

    for (const [index, chunk] of chunks.entries()) {
        const isLast = index === chunks.length - 1;

        await sendTrackedMessage(chatId, chunk, {
            ...(isLast && replyMarkup ? { reply_markup: replyMarkup } : {}),
        });
    }
}

async function sendHtmlMessages(chatId, messages, replyMarkup) {
    for (const [index, message] of messages.entries()) {
        const isLast = index === messages.length - 1;

        await sendTrackedMessage(chatId, message, {
            parse_mode: 'HTML',
            ...(isLast && replyMarkup ? { reply_markup: replyMarkup } : {}),
        });
    }
}

async function withProgress(chatId, steps, task) {
    const normalizedSteps = steps.length ? steps : ['Обрабатываю запрос…'];
    let stepIndex = 0;

    const statusMessage = await sendTrackedMessage(
        chatId,
        `<b>⏳ ${escapeHtml(normalizedSteps[0])}</b>`,
        { parse_mode: 'HTML' },
    );

    await telegram.sendChatAction(chatId).catch(() => {});

    const actionTimer = setInterval(() => {
        telegram.sendChatAction(chatId).catch(() => {});
    }, 4000);

    const progressTimer = setInterval(() => {
        if (stepIndex >= normalizedSteps.length - 1) {
            return;
        }

        stepIndex += 1;

        telegram.editMessageText(
            chatId,
            statusMessage.message_id,
            `<b>⏳ ${escapeHtml(normalizedSteps[stepIndex])}</b>`,
            { parse_mode: 'HTML' },
        ).catch(() => {});
    }, 5500);

    try {
        return await task();
    } finally {
        clearInterval(actionTimer);
        clearInterval(progressTimer);
        await deleteMessageQuietly(chatId, statusMessage.message_id);
    }
}

async function clearChat(chatId) {
    const session = getSession(chatId);
    const messageIds = [...session.messageIds].sort((a, b) => b - a);

    resetSession(chatId);

    for (const messageId of messageIds) {
        try {
            await telegram.deleteMessage(chatId, messageId);
        } catch (error) {
            console.warn(`Не удалось удалить сообщение ${messageId}:`, error.message);
        }
    }
}

async function showSong(chatId, song) {
    await sendTrackedMessage(
        chatId,
        `<b>🎵 ${escapeHtml(formatSongTitle(song))}</b>`,
        { parse_mode: 'HTML' },
    );

    if (song.instrumental && !song.lyrics) {
        await sendTrackedMessage(
            chatId,
            'У этой композиции нет вокального текста.',
            { reply_markup: createClearKeyboard() },
        );
        return;
    }

    await sendLongPlainMessage(
        chatId,
        song.lyrics,
        createSongActionsKeyboard(),
    );
}

async function showSearchResults(chatId, songs, pendingAction = null) {
    const session = getSession(chatId);
    session.searchResults = songs;
    session.pendingAction = pendingAction;

    const list = songs
        .map((song, index) => (
            `${index + 1}. ${escapeHtml(formatSongTitle(song))}`
        ))
        .join('\n');

    await sendTrackedMessage(
        chatId,
        `<b>Нашёл несколько вариантов:</b>\n\n${list}\n\nВыбери нужный:`,
        {
            parse_mode: 'HTML',
            reply_markup: createSearchKeyboard(songs),
        },
    );
}

function hasSongSearch(intent) {
    return Boolean(intent.trackName || intent.artistName || intent.query);
}

async function findSongs(intent) {
    return searchLyrics({
        query: intent.query,
        trackName: intent.trackName,
        artistName: intent.artistName,
    });
}

async function runSongAction(chatId, action, options = {}) {
    const session = getSession(chatId);
    const song = session.activeSong;

    if (!song) {
        await sendTrackedMessage(
            chatId,
            'Сначала укажи название песни или выбери её из результатов поиска.',
            { reply_markup: createClearKeyboard() },
        );
        return;
    }

    const requiresLyrics = [
        'translate',
        'explain_song',
        'deep_explain',
        'explain_fragment',
    ].includes(action);

    if (requiresLyrics && !song.lyrics) {
        await sendTrackedMessage(
            chatId,
            'У выбранной композиции нет текста для обработки.',
            { reply_markup: createClearKeyboard() },
        );
        return;
    }

    if (action === 'translate') {
        const translation = await withProgress(
            chatId,
            [
                'Перевожу текст песни…',
                'Сохраняю смысл и структуру…',
                'Подготавливаю перевод…',
            ],
            () => ai.translateText(
                song.lyrics,
                options.targetLanguage || 'русский',
            ),
        );

        await sendTrackedMessage(
            chatId,
            `<b>🌍 Перевод: ${escapeHtml(formatSongTitle(song))}</b>`,
            { parse_mode: 'HTML' },
        );

        await sendLongPlainMessage(
            chatId,
            translation,
            createSongActionsKeyboard(),
        );
        return;
    }

    if (action === 'explain_song') {
        const explanation = await withProgress(
            chatId,
            [
                'Анализирую смысл песни…',
                'Выделяю основные темы и образы…',
                'Формирую краткий разбор…',
            ],
            () => ai.explainSong(song),
        );

        await sendHtmlMessages(
            chatId,
            renderSongExplanation(song, explanation),
            createSongActionsKeyboard(),
        );
        return;
    }

    if (action === 'deep_explain') {
        const explanation = await withProgress(
            chatId,
            [
                'Ищу интервью и историю песни…',
                'Проверяю отсылки и контекст…',
                'Сопоставляю источники с текстом…',
                'Формирую глубокий разбор…',
            ],
            () => ai.explainSong(song, true),
        );

        await sendHtmlMessages(
            chatId,
            renderSongExplanation(song, explanation),
            createSongActionsKeyboard(),
        );

        return;
    }

    if (action === 'credits') {
        const credits = await withProgress(
            chatId,
            [
                'Ищу официальные кредиты…',
                'Собираю авторов и участников записи…',
                'Проверяю роли и источники…',
            ],
            () => ai.getSongCredits(song),
        );

        await sendHtmlMessages(
            chatId,
            renderSongCredits(song, credits),
            createSongActionsKeyboard(),
        );
        return;
    }

    if (action === 'explain_fragment') {
        if (!options.fragment) {
            await sendTrackedMessage(
                chatId,
                'Пришли строку и напиши, например: «что значит эта фраза?»',
                { reply_markup: createClearKeyboard() },
            );
            return;
        }

        const explanation = await withProgress(
            chatId,
            [
                'Разбираю фразу…',
                'Проверяю её контекст…',
                'Формулирую объяснение…',
            ],
            () => ai.explainFragment(options.fragment, song),
        );

        await sendHtmlMessages(
            chatId,
            renderFragmentExplanation(options.fragment, explanation),
            createSongActionsKeyboard(),
        );
    }
}

async function searchAndContinue(chatId, intent, pendingAction = null) {
    const songs = await withProgress(
        chatId,
        ['Ищу песню…', 'Проверяю найденные варианты…'],
        () => findSongs(intent),
    );

    if (!songs.length) {
        await sendTrackedMessage(
            chatId,
            'Не нашёл подходящий текст. Добавь исполнителя или проверь название.',
            { reply_markup: createClearKeyboard() },
        );
        return;
    }

    if (songs.length === 1) {
        const session = getSession(chatId);
        session.activeSong = songs[0];

        if (pendingAction) {
            await runSongAction(chatId, pendingAction.action, pendingAction);
        } else {
            await showSong(chatId, songs[0]);
        }

        return;
    }

    await showSearchResults(chatId, songs, pendingAction);
}

function parseCommand(text) {
    const match = text.match(/^\/([a-z_]+)(?:@\w+)?(?:\s+([\s\S]*))?$/i);

    if (!match) {
        return null;
    }

    return {
        name: match[1].toLowerCase(),
        args: match[2]?.trim() || '',
    };
}

async function handleCommand(chatId, command) {
    if (command.name === 'start' || command.name === 'help') {
        await sendTrackedMessage(chatId, helpText, {
            parse_mode: 'HTML',
            reply_markup: createClearKeyboard(),
        });
        return;
    }

    if (command.name === 'search') {
        if (!command.args) {
            await sendTrackedMessage(
                chatId,
                'После команды укажи название: /search Numb Linkin Park',
                { reply_markup: createClearKeyboard() },
            );
            return;
        }

        await searchAndContinue(chatId, {
            query: command.args,
            trackName: '',
            artistName: '',
        });
        return;
    }

    if (command.name === 'current') {
        const song = getSession(chatId).activeSong;

        await sendTrackedMessage(
            chatId,
            song
                ? `<b>Текущая песня:</b> ${escapeHtml(formatSongTitle(song))}`
                : 'Сейчас песня не выбрана.',
            {
                parse_mode: 'HTML',
                reply_markup: song
                    ? createSongActionsKeyboard()
                    : createClearKeyboard(),
            },
        );
        return;
    }

    if (command.name === 'translate') {
        await runSongAction(chatId, 'translate', {
            targetLanguage: command.args || 'русский',
        });
        return;
    }

    if (command.name === 'explain') {
        await runSongAction(chatId, 'explain_song');
        return;
    }

    if (command.name === 'credits') {
        await runSongAction(chatId, 'credits');
        return;
    }

    if (command.name === 'clear') {
        await clearChat(chatId);
        return;
    }

    await sendTrackedMessage(chatId, helpText, {
        parse_mode: 'HTML',
        reply_markup: createClearKeyboard(),
    });
}

async function handleMessage(message) {
    const chatId = message.chat.id;
    const text = message.text?.trim();

    if (!text) {
        return;
    }

    trackMessage(chatId, message.message_id);

    const command = parseCommand(text);

    if (command) {
        await handleCommand(chatId, command);
        return;
    }

    const session = getSession(chatId);
    await telegram.sendChatAction(chatId).catch(() => {});

    const intent = await ai.routeMessage(text, session.activeSong);

    if (intent.action === 'help') {
        await sendTrackedMessage(chatId, helpText, {
            parse_mode: 'HTML',
            reply_markup: createClearKeyboard(),
        });
        return;
    }

    if (intent.action === 'search') {
        await searchAndContinue(chatId, intent);
        return;
    }

    if (intent.action === 'translate') {
        if (intent.sourceText) {
            const translation = await withProgress(
                chatId,
                ['Перевожу текст…', 'Подготавливаю результат…'],
                () => ai.translateText(
                    intent.sourceText,
                    intent.targetLanguage || 'русский',
                ),
            );

            await sendLongPlainMessage(
                chatId,
                translation,
                createClearKeyboard(),
            );
            return;
        }

        if (hasSongSearch(intent)) {
            await searchAndContinue(chatId, intent, {
                action: 'translate',
                targetLanguage: intent.targetLanguage,
            });
            return;
        }

        await runSongAction(chatId, 'translate', {
            targetLanguage: intent.targetLanguage,
        });
        return;
    }

    if (intent.action === 'explain_song') {
        if (hasSongSearch(intent)) {
            await searchAndContinue(chatId, intent, {
                action: 'explain_song',
            });
            return;
        }

        await runSongAction(chatId, 'explain_song');
        return;
    }

    if (intent.action === 'credits') {
        if (hasSongSearch(intent)) {
            await searchAndContinue(chatId, intent, {
                action: 'credits',
            });
            return;
        }

        await runSongAction(chatId, 'credits');
        return;
    }

    if (intent.action === 'explain_fragment') {
        const fragment = intent.fragment || intent.sourceText;

        if (!fragment) {
            await sendTrackedMessage(
                chatId,
                'Пришли конкретную строку или фразу, которую нужно объяснить.',
                { reply_markup: createClearKeyboard() },
            );
            return;
        }

        if (hasSongSearch(intent)) {
            await searchAndContinue(chatId, intent, {
                action: 'explain_fragment',
                fragment,
            });
            return;
        }

        const explanation = await withProgress(
            chatId,
            ['Разбираю фразу…', 'Формулирую объяснение…'],
            () => ai.explainFragment(fragment, session.activeSong),
        );

        await sendHtmlMessages(
            chatId,
            renderFragmentExplanation(fragment, explanation),
            session.activeSong
                ? createSongActionsKeyboard()
                : createClearKeyboard(),
        );
        return;
    }

    await sendTrackedMessage(
        chatId,
        'Я могу найти песню, перевести её или объяснить смысл. Используй /help для примеров.',
        { reply_markup: createClearKeyboard() },
    );
}

async function answerCallbackQueryQuietly(callbackQueryId) {
    try {
        await telegram.answerCallbackQuery(callbackQueryId);
    } catch (error) {
        const description = error?.description || error?.message || '';
        const isExpired = (
            description.includes('query is too old')
            || description.includes('query ID is invalid')
        );

        if (!isExpired) {
            console.warn('Не удалось подтвердить нажатие кнопки:', description);
        }
    }
}

async function handleCallbackQuery(callbackQuery) {
    const chatId = callbackQuery.message?.chat.id;
    const messageId = callbackQuery.message?.message_id;
    const data = callbackQuery.data || '';

    if (!chatId) {
        return;
    }

    // callback нужно подтвердить сразу: Telegram хранит его недолго
    await answerCallbackQueryQuietly(callbackQuery.id);

    if (data === 'chat:clear') {
        await clearChat(chatId);
        return;
    }

    const session = getSession(chatId);

    if (data.startsWith('pick:')) {
        const index = Number(data.slice('pick:'.length));
        const song = session.searchResults[index];

        if (!song) {
            await sendTrackedMessage(
                chatId,
                'Результаты поиска устарели. Повтори запрос.',
                { reply_markup: createClearKeyboard() },
            );
            return;
        }

        session.activeSong = song;

        if (messageId) {
            await deleteMessageQuietly(chatId, messageId);
        }

        const pendingAction = session.pendingAction;
        session.pendingAction = null;

        if (pendingAction) {
            await runSongAction(
                chatId,
                pendingAction.action,
                pendingAction,
            );
        } else {
            await showSong(chatId, song);
        }

        return;
    }

    if (data === 'action:translate') {
        await runSongAction(chatId, 'translate', {
            targetLanguage: 'русский',
        });
        return;
    }

    if (data === 'action:explain_song') {
        await runSongAction(chatId, 'explain_song');
        return;
    }

    if (data === 'action:deep_explain') {
        await runSongAction(chatId, 'deep_explain');
        return;
    }

    if (data === 'action:credits') {
        await runSongAction(chatId, 'credits');
    }
}

async function handleUpdate(update) {
    try {
        if (update.message) {
            await handleMessage(update.message);
            return;
        }

        if (update.callback_query) {
            await handleCallbackQuery(update.callback_query);
        }
    } catch (error) {
        console.error(error);

        const chatId =
            update.message?.chat.id ||
            update.callback_query?.message?.chat.id;

        if (chatId) {
            await sendTrackedMessage(
                chatId,
                getUserErrorMessage(error),
                { reply_markup: createClearKeyboard() },
            ).catch(console.error);
        }
    }
}

async function configureBot() {
    try {
        await telegram.setMyCommands(commands);
        await telegram.setChatMenuButton();
        console.log('Меню команд Telegram настроено');
    } catch (error) {
        console.error('Не удалось настроить меню команд:', error);
    }
}

async function startPolling() {
    let offset = 0;

    await configureBot();
    console.log('Lyrics AI Bot запущен');

    while (true) {
        try {
            const updates = await telegram.getUpdates(offset);

            for (const update of updates) {
                offset = update.update_id + 1;
                await handleUpdate(update);
            }
        } catch (error) {
            console.error('Ошибка long polling:', error);
            await sleep(2000);
        }
    }
}

await startPolling();
