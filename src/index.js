import { config } from './config.js';
import { createAiService } from './ai.js';
import { searchLyrics } from './lyrics.js';
import { getSession } from './session.js';
import { createTelegramClient } from './telegram.js';
import {
    createSearchKeyboard,
    createSongActionsKeyboard,
    formatSongTitle,
    splitText,
} from './text.js';

const telegram = createTelegramClient(config.telegramToken);
const ai = createAiService({
    apiKey: config.openaiApiKey,
    routerModel: config.routerModel,
    textModel: config.textModel,
});

const helpText = `
Я умею искать тексты песен и обсуждать их обычным языком.

Примеры:
• Numb Linkin Park
• найди текст The Emptiness Machine
• переведи Numb от Linkin Park
• переведи эту песню
• объясни смысл песни
• что значит фраза "I've become so numb"
• переведи: I tried so hard and got so far

После выбора песни я запоминаю её до перезапуска бота.
`.trim();

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function sendLongMessage(chatId, text) {
    for (const chunk of splitText(text)) {
        await telegram.sendMessage(chatId, chunk);
    }
}

async function showSong(chatId, song) {
    await telegram.sendMessage(chatId, `🎵 ${formatSongTitle(song)}`);

    if (song.instrumental && !song.lyrics) {
        await telegram.sendMessage(chatId, 'У этой композиции нет вокального текста.');
        return;
    }

    await sendLongMessage(chatId, song.lyrics);
    await telegram.sendMessage(
        chatId,
        'Можно попросить перевод, общий разбор или объяснение отдельной строки.',
        createSongActionsKeyboard(),
    );
}

async function showSearchResults(chatId, songs, pendingAction = null) {
    const session = getSession(chatId);
    session.searchResults = songs;
    session.pendingAction = pendingAction;

    const list = songs
        .map((song, index) => `${index + 1}. ${formatSongTitle(song)}`)
        .join('\n');

    await telegram.sendMessage(
        chatId,
        `Нашёл несколько вариантов:\n\n${list}\n\nВыбери нужный:`,
        createSearchKeyboard(songs),
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
        await telegram.sendMessage(
            chatId,
            'Сначала укажи название песни или выбери её из результатов поиска.',
        );
        return;
    }

    if (!song.lyrics) {
        await telegram.sendMessage(
            chatId,
            'У выбранной композиции нет текста для обработки.',
        );
        return;
    }

    await telegram.sendChatAction(chatId);

    if (action === 'translate') {
        const translation = await ai.translateText(
            song.lyrics,
            options.targetLanguage || 'русский',
        );

        await telegram.sendMessage(
            chatId,
            `🌍 Перевод: ${formatSongTitle(song)}`,
        );
        await sendLongMessage(chatId, translation);
        return;
    }

    if (action === 'explain_song') {
        const explanation = await ai.explainSong(song);

        await telegram.sendMessage(
            chatId,
            `💡 Смысл песни: ${formatSongTitle(song)}`,
        );
        await sendLongMessage(chatId, explanation);
        return;
    }

    if (action === 'explain_fragment') {
        if (!options.fragment) {
            await telegram.sendMessage(
                chatId,
                'Пришли строку и напиши, например: «что значит эта фраза?»',
            );
            return;
        }

        const explanation = await ai.explainFragment(options.fragment, song);
        await sendLongMessage(chatId, explanation);
    }
}

async function searchAndContinue(chatId, intent, pendingAction = null) {
    await telegram.sendChatAction(chatId);
    const songs = await findSongs(intent);

    if (!songs.length) {
        await telegram.sendMessage(
            chatId,
            'Не нашёл подходящий текст. Попробуй добавить исполнителя или проверить название.',
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

async function handleMessage(message) {
    const chatId = message.chat.id;
    const text = message.text?.trim();

    if (!text) {
        return;
    }

    if (text.startsWith('/start') || text.startsWith('/help')) {
        await telegram.sendMessage(chatId, helpText);
        return;
    }

    const session = getSession(chatId);
    await telegram.sendChatAction(chatId);

    const intent = await ai.routeMessage(text, session.activeSong);

    if (intent.action === 'help') {
        await telegram.sendMessage(chatId, helpText);
        return;
    }

    if (intent.action === 'search') {
        await searchAndContinue(chatId, intent);
        return;
    }

    if (intent.action === 'translate') {
        if (intent.sourceText) {
            const translation = await ai.translateText(
                intent.sourceText,
                intent.targetLanguage || 'русский',
            );

            await sendLongMessage(chatId, translation);
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

    if (intent.action === 'explain_fragment') {
        const fragment = intent.fragment || intent.sourceText;

        if (!fragment) {
            await telegram.sendMessage(
                chatId,
                'Пришли конкретную строку или фразу, которую нужно объяснить.',
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

        const explanation = await ai.explainFragment(
            fragment,
            session.activeSong,
        );

        await sendLongMessage(chatId, explanation);
        return;
    }

    await telegram.sendMessage(chatId, helpText);
}

async function handleCallbackQuery(callbackQuery) {
    const chatId = callbackQuery.message?.chat.id;
    const data = callbackQuery.data || '';

    if (!chatId) {
        return;
    }

    await telegram.answerCallbackQuery(callbackQuery.id);

    const session = getSession(chatId);

    if (data.startsWith('pick:')) {
        const index = Number(data.slice('pick:'.length));
        const song = session.searchResults[index];

        if (!song) {
            await telegram.sendMessage(
                chatId,
                'Результаты поиска устарели. Повтори запрос.',
            );
            return;
        }

        session.activeSong = song;

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
            await telegram.sendMessage(
                chatId,
                'Не удалось обработать запрос. Попробуй ещё раз немного позже.',
            );
        }
    }
}

async function startPolling() {
    let offset = 0;

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
