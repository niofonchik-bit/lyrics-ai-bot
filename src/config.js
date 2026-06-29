function getRequiredEnv(name) {
    const value = process.env[name]?.trim();

    if (!value) {
        throw new Error(`Не задана переменная окружения ${name}`);
    }

    return value;
}

export const config = Object.freeze({
    telegramToken: getRequiredEnv('TELEGRAM_BOT_TOKEN'),
    openaiApiKey: getRequiredEnv('OPENAI_API_KEY'),
    routerModel: process.env.OPENAI_ROUTER_MODEL?.trim() || 'gpt-5.4-nano',
    textModel: process.env.OPENAI_TEXT_MODEL?.trim() || 'gpt-5.4-mini',
});
