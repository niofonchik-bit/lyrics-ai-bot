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

export function escapeHtml(value = '') {
    return String(value)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;');
}

export function formatSongTitle(song) {
    return `${song.artistName} — ${song.trackName}`;
}

export function createSearchKeyboard(songs) {
    return {
        inline_keyboard: [
            ...songs.map((song, index) => [
                {
                    text: `${index + 1}. ${formatSongTitle(song).slice(0, 55)}`,
                    callback_data: `pick:${index}`,
                },
            ]),
            [
                {
                    text: '🗑 Очистить чат',
                    callback_data: 'chat:clear',
                },
            ],
        ],
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
            [
                {
                    text: '🔎 Глубокий разбор',
                    callback_data: 'action:deep_explain',
                },
            ],
            [
                {
                    text: '🗑 Очистить чат',
                    callback_data: 'chat:clear',
                },
            ],
        ],
    };
}

export function createClearKeyboard() {
    return {
        inline_keyboard: [
            [
                {
                    text: '🗑 Очистить чат',
                    callback_data: 'chat:clear',
                },
            ],
        ],
    };
}

function createParagraphBlocks(title, text) {
    const parts = splitText(text, 2800);

    return parts.map((part, index) => {
        const heading = index === 0 && title
            ? `<b>${escapeHtml(title)}</b>\n`
            : '';

        return `${heading}${escapeHtml(part)}`;
    });
}

export function renderSongExplanation(song, explanation) {
    const blocks = [
        `<b>💡 Смысл песни: ${escapeHtml(formatSongTitle(song))}</b>`,
        ...createParagraphBlocks('', explanation.summary),
    ];

    for (const section of explanation.sections) {
        const sectionText = [
            section.explanation,
            ...section.points.map(point => `• ${point}`),
        ].filter(Boolean).join('\n');

        blocks.push(...createParagraphBlocks(section.title, sectionText));
    }

    blocks.push(...createParagraphBlocks('Итог', explanation.conclusion));

    if (explanation.sources?.length) {
        const sources = explanation.sources
            .map((source, index) => (
                `${index + 1}. <a href="${escapeHtml(source.url)}">`
                + `${escapeHtml(source.title || source.url)}</a>`
            ))
            .join('\n');

        blocks.push(`<b>Источники</b>\n${sources}`);
    }

    return packHtmlBlocks(blocks);
}

export function renderFragmentExplanation(fragment, explanation) {
    const blocks = [
        `<b>🔎 Разбор фразы</b>\n<blockquote>${escapeHtml(fragment)}</blockquote>`,
        ...createParagraphBlocks('Буквальный смысл', explanation.literalMeaning),
        ...createParagraphBlocks('Смысл в контексте', explanation.contextualMeaning),
        ...createParagraphBlocks('Оттенок и образ', explanation.nuance),
        ...createParagraphBlocks('Коротко', explanation.conclusion),
    ];

    return packHtmlBlocks(blocks);
}

export function packHtmlBlocks(blocks, limit = 3900) {
    const messages = [];
    let current = '';

    for (const block of blocks.filter(Boolean)) {
        const candidate = current ? `${current}\n\n${block}` : block;

        if (candidate.length <= limit) {
            current = candidate;
            continue;
        }

        if (current) {
            messages.push(current);
        }

        current = block;
    }

    if (current) {
        messages.push(current);
    }

    return messages;
}
