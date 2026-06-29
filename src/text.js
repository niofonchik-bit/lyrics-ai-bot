export function splitText(text, limit = 3900) {
    const chunks = [];
    let remaining = text.trim();

    while (remaining.length > limit) {
        let splitAt = remaining.lastIndexOf('\n', limit);

        if (splitAt < limit * 0.5) {
            splitAt = remaining.lastIndexOf(' ', limit);
        }

        if (splitAt < 1) {
            splitAt = limit;
        }

        chunks.push(remaining.slice(0, splitAt).trim());
        remaining = remaining.slice(splitAt).trim();
    }

    if (remaining) {
        chunks.push(remaining);
    }

    return chunks;
}

export function formatSongTitle(song) {
    return `${song.artistName} — ${song.trackName}`;
}

export function createSearchKeyboard(songs) {
    return {
        inline_keyboard: songs.map((song, index) => [
            {
                text: `${index + 1}. ${formatSongTitle(song).slice(0, 55)}`,
                callback_data: `pick:${index}`,
            },
        ]),
    };
}

export function createSongActionsKeyboard() {
    return {
        inline_keyboard: [
            [
                {
                    text: '🌍 Перевести',
                    callback_data: 'action:translate',
                },
                {
                    text: '💡 Объяснить смысл',
                    callback_data: 'action:explain_song',
                },
            ],
        ],
    };
}
