export function getUserErrorMessage(error) {
    if (error?.status === 401 || error?.code === 'invalid_api_key') {
        return 'OpenAI отклонил API-ключ. Проверь OPENAI_API_KEY в Railway Variables.';
    }

    if (
        error?.status === 429 ||
        error?.code === 'insufficient_quota' ||
        error?.type === 'insufficient_quota'
    ) {
        return 'Для OpenAI API недостаточно средств или не настроен биллинг.';
    }

    if (error?.code === 'unsupported_country_region_territory') {
        return 'OpenAI API недоступен из региона, из которого выполняется запрос.';
    }

    if (error?.status === 404 || error?.code === 'model_not_found') {
        return 'У API-проекта нет доступа к выбранной модели. Проверь OPENAI_ROUTER_MODEL и OPENAI_TEXT_MODEL.';
    }

    return `Не удалось обработать запрос: ${error?.message || 'неизвестная ошибка'}`;
}
