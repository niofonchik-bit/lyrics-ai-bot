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
            const error = new Error(
                `Telegram ${method}: ${data.description || response.statusText}`,
            );

            error.status = response.status;
            error.description = data.description;
            throw error;
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

        sendMessage(chatId, text, options = {}) {
            return request('sendMessage', {
                chat_id: chatId,
                text,
                ...options,
            });
        },

        editMessageText(chatId, messageId, text, options = {}) {
            return request('editMessageText', {
                chat_id: chatId,
                message_id: messageId,
                text,
                ...options,
            });
        },

        deleteMessage(chatId, messageId) {
            return request('deleteMessage', {
                chat_id: chatId,
                message_id: messageId,
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

        setMyCommands(commands) {
            return request('setMyCommands', { commands });
        },

        setChatMenuButton() {
            return request('setChatMenuButton', {
                menu_button: {
                    type: 'commands',
                },
            });
        },
    };
}
