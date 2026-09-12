function describeError(err) {
  const msg = String((err && (err.message || err)) || "Неизвестная ошибка");
  const code = err && err.code;

  if (code === "ENOSPC" || /ENOSPC|no space left on device/i.test(msg)) {
    return {
      title: "Не хватает места на диске",
      message:
        "На диске закончилось свободное место — AnLaunch не смог сохранить файлы (игра, моды или кэш).\n\n" +
        "Что сделать:\n" +
        "1. Освободите несколько гигабайт на диске C: (Корзина, Загрузки, ненужные видео).\n" +
        "2. Очистите временные файлы: Win+R → %TEMP% → удалите старое.\n" +
        "3. Данные лаунчера лежат в %APPDATA%\\AnLaunch — там можно удалить старые версии.\n\n" +
        "После этого просто запустите AnLaunch снова.",
    };
  }

  if (code === "EPERM" || code === "EACCES" || /EPERM|EACCES|access denied/i.test(msg)) {
    return {
      title: "Нет доступа к файлу",
      message:
        "Windows не дала записать файл. Закройте Minecraft, если он запущен, и попробуйте снова.\n" +
        "Антивирус иногда блокирует папку лаунчера — добавьте AnLaunch в исключения.",
    };
  }

  if (/ENOTFOUND|EAI_AGAIN|getaddrinfo/i.test(msg)) {
    return {
      title: "Нет сети",
      message: "Не удалось подключиться к интернету. Проверьте сеть или VPN и попробуйте ещё раз.",
    };
  }

  if (/ETIMEDOUT|ESOCKETTIMEDOUT|timeout|Таймаут/i.test(msg)) {
    return {
      title: "Слишком долго нет ответа",
      message: "Сервер не ответил вовремя. Подождите минуту и повторите.",
    };
  }

  if (/ECONNRESET|ECONNREFUSED|EPIPE/i.test(msg)) {
    return {
      title: "Связь оборвалась",
      message: "Соединение с сервером прервалось. Проверьте интернет и попробуйте снова.",
    };
  }

  if (/HTTP 403|HTTP 401/i.test(msg)) {
    return {
      title: "Сервер отклонил запрос",
      message: "Не удалось скачать файл (доступ запрещён). Подождите минуту и попробуйте ещё раз.",
    };
  }

  return {
    title: "Ошибка AnLaunch",
    message: msg.replace(/\s+at\s+\S+.*/gs, "").trim() || "Что-то пошло не так. Попробуйте ещё раз.",
  };
}

function friendlyError(err) {
  return describeError(err).message;
}

module.exports = { describeError, friendlyError };
