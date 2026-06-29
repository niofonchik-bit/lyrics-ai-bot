const sessions = new Map();

function createSession() {
    return {
        activeSong: null,
        searchResults: [],
        pendingAction: null,
        messageIds: new Set(),
    };
}

export function getSession(chatId) {
    if (!sessions.has(chatId)) {
        sessions.set(chatId, createSession());
    }

    return sessions.get(chatId);
}

export function trackMessage(chatId, messageId) {
    if (messageId != null) {
        getSession(chatId).messageIds.add(messageId);
    }
}

export function untrackMessage(chatId, messageId) {
    getSession(chatId).messageIds.delete(messageId);
}

export function resetSession(chatId) {
    sessions.set(chatId, createSession());
}
