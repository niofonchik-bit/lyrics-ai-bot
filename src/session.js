const sessions = new Map();

export function getSession(chatId) {
    if (!sessions.has(chatId)) {
        sessions.set(chatId, {
            activeSong: null,
            searchResults: [],
            pendingAction: null,
        });
    }

    return sessions.get(chatId);
}
