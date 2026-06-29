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

function escapeHtmlAttribute(value = '') {
    return escapeHtml(value)
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}

function getSafeUrl(value) {
    try {
        const url = new URL(value);

        return ['http:', 'https:'].includes(url.protocol)
            ? url.toString()
            : '';
    } catch {
        return '';
    }
}

function createLink(text, url) {
    const safeUrl = getSafeUrl(url);

    if (!safeUrl) {
        return escapeHtml(text);
    }

    return `<a href="${escapeHtmlAttribute(safeUrl)}">${escapeHtml(text)}</a>`;
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
                {
                    text: '👥 Авторы',
                    callback_data: 'action:credits',
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

function renderSources(sources) {
    if (!sources?.length) {
        return '';
    }

    const links = sources
        .map((source, index) => (
            `${index + 1}. ${createLink(source.title || source.url, source.url)}`
        ))
        .join('\n');

    return `<b>Источники</b>\n${links}`;
}

export function renderSongExplanation(song, explanation) {
    const blocks = [
        `<b>💡 Смысл песни: ${escapeHtml(formatSongTitle(song))}</b>`,
    ];

    for (const paragraph of explanation.paragraphs || []) {
        blocks.push(...createParagraphBlocks('', paragraph));
    }

    for (const detail of explanation.details || []) {
        blocks.push(...createParagraphBlocks(detail.title, detail.text));
    }

    if (explanation.sourceNote) {
        blocks.push(`<i>${escapeHtml(explanation.sourceNote)}</i>`);
    }

    const sources = renderSources(explanation.sources);

    if (sources) {
        blocks.push(sources);
    }

    return packHtmlBlocks(blocks);
}

export function renderFragmentExplanation(fragment, explanation) {
    const blocks = [
        `<b>🔎 Разбор фразы</b>\n<blockquote>${escapeHtml(fragment)}</blockquote>`,
    ];

    if (explanation.literalTranslation) {
        blocks.push(
            `<b>Буквально:</b> ${escapeHtml(explanation.literalTranslation)}`,
        );
    }

    blocks.push(...createParagraphBlocks('', explanation.explanation));

    if (explanation.alternatives?.length) {
        const alternatives = explanation.alternatives
            .map(item => `• ${escapeHtml(item)}`)
            .join('\n');

        blocks.push(`<b>Другие варианты</b>\n${alternatives}`);
    }

    return packHtmlBlocks(blocks);
}

export function renderSongCredits(song, credits) {
    const blocks = [
        `<b>👥 Авторы и участники: ${escapeHtml(formatSongTitle(song))}</b>`,
    ];

    if (credits.summary) {
        blocks.push(...createParagraphBlocks('', credits.summary));
    }

    if (!credits.contributors?.length) {
        blocks.push('Не удалось найти подтверждённые персональные кредиты.');
    }

    for (const contributor of credits.contributors || []) {
        const linkIndex = contributor.profileSourceIndex
            || contributor.creditSourceIndexes?.[0]
            || 0;
        const source = linkIndex > 0
            ? credits.sources?.[linkIndex - 1]
            : null;
        const name = source
            ? createLink(contributor.name, source.url)
            : escapeHtml(contributor.name);
        const roles = contributor.roles?.length
            ? escapeHtml(contributor.roles.join(', '))
            : 'роль не уточнена';
        const note = contributor.note
            ? `\n<i>${escapeHtml(contributor.note)}</i>`
            : '';

        blocks.push(`<b>${name}</b> — ${roles}${note}`);
    }

    if (credits.sourceNote) {
        blocks.push(`<i>${escapeHtml(credits.sourceNote)}</i>`);
    }

    const sources = renderSources(credits.sources);

    if (sources) {
        blocks.push(sources);
    }

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
