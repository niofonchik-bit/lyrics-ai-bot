export function createTelegramClient(token) {
    const apiUrl = `https://api.telegram.org/bot${token}`;

    async function request(method, payload = {}) {
        const response = await fetch(`${apiUrl}/${method}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
        });

        const data = await response.json();

        if (!response.ok || !data.ok) {
            throw new Error(
                `Telegram ${method}: ${data.description || response.statusText}`,
            );
        }

        return data.result;
    }

    return {
        getUpdates(offset) {
            return request('getUpdates', {
                offset,
                timeout: 50,
                allowed_updates: ['message', 'callback_query'],
            });
        },

        sendMessage(chatId, text, replyMarkup) {
            return request('sendMessage', {
                chat_id: chatId,
                text,
                ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
            });
        },

        sendChatAction(chatId, action = 'typing') {
            return request('sendChatAction', {
                chat_id: chatId,
                action,
            });
        },

        answerCallbackQuery(callbackQueryId, text) {
            return request('answerCallbackQuery', {
                callback_query_id: callbackQueryId,
                ...(text ? { text } : {}),
            });
        },
    };
}
