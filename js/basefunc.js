// 🚀 УПРОЩЕННАЯ КОНФИГУРАЦИЯ API
const API_CONFIG = {
  ACCESS_TOKEN:
    "1bb263451bb263451bb2634552188a4cfe11bb21bb26345732659ed5d055a6b40f69c20",
  BASE_URL: "https://api.vk.com/method/",
  VERSION: "5.131",
  BATCH_SIZE: 50,
  MIN_DELAY: 5000, // Задержки для защиты от флуд-контроля
  MAX_DELAY: 8000,
};

// Глобальные переменные
let allResults = [];
let filteredResults = [];
let friendsList = new Set(); // Список ID друзей
let friendsData = {}; // Данные о друзьях (ID -> имя)
let processingStats = {
  total: 0,
  processed: 0,
  errors: 0,
  duplicates: 0,
  invalidUrls: 0,
  resolveErrors: 0,
  resolveAttempts: 0,
  apiErrors: 0,
  friendsLoaded: 0,
};
let currentView = "cards";
let currentSort = { field: "first_name", order: "asc" };

// Адаптивные задержки
let requestCount = 0;
let lastMinuteTimestamp = Date.now();

function getAdaptiveDelay() {
  const now = Date.now();
  if (now - lastMinuteTimestamp > 60000) {
    requestCount = 0;
    lastMinuteTimestamp = now;
  }
  requestCount++;

  let delay =
    Math.floor(
      Math.random() * (API_CONFIG.MAX_DELAY - API_CONFIG.MIN_DELAY + 1)
    ) + API_CONFIG.MIN_DELAY;

  if (requestCount > 30) delay *= 2;

  return Math.min(delay, 60000);
}

// Инициализация
document.addEventListener("DOMContentLoaded", function () {
  initEventHandlers();
  console.log("✅ Упрощенное приложение с загрузкой друзей инициализировано");
});

function initEventHandlers() {
  // Обработчик основного CSV файла
  document.getElementById("csvFile").addEventListener("change", function (e) {
    const file = e.target.files[0];
    if (file) {
      showFileStatus("mainFileStatus", `Загружен: ${file.name}`, "success");
      // Автоматически запускаем обработку если оба файла загружены
      checkAndProcessFiles();
    }
  });

  // Обработчик файла со списком друзей
  document
    .getElementById("friendsFile")
    .addEventListener("change", function (e) {
      const file = e.target.files[0];
      if (file) {
        processFriendsFile(file);
      }
    });

  document
    .getElementById("groupBySelect")
    .addEventListener("change", updateDisplay);
  document.getElementById("sortBySelect").addEventListener("change", (e) => {
    currentSort.field = e.target.value;
    updateDisplay();
  });
  document.getElementById("sortOrderSelect").addEventListener("change", (e) => {
    currentSort.order = e.target.value;
    updateDisplay();
  });
  document.getElementById("searchInput").addEventListener("input", (e) => {
    filterResults(e.target.value);
    updateDisplay();
  });
}

// Обработка файла со списком друзей
async function processFriendsFile(file) {
  try {
    showStatus("info", "Загрузка списка друзей...");

    const text = await file.text();
    const lines = text.split("\n").filter((line) => line.trim());

    if (lines.length === 0) {
      showStatus("error", "Файл со списком друзей пуст");
      return;
    }

    friendsList.clear();
    friendsData = {};
    let friendsCount = 0;
    let errors = 0;

    // Определяем заголовки
    const headers = parseCSVLine(lines[0]).map((h) =>
      h.toLowerCase().replace(/"/g, "")
    );
    const hasHeaders = headers.some(
      (h) =>
        h.includes("profile") ||
        h.includes("url") ||
        h.includes("name") ||
        h.includes("id")
    );
    const startIndex = hasHeaders ? 1 : 0;

    // Определяем индексы столбцов
    let urlIndex = -1;
    let nameIndex = -1;

    if (hasHeaders) {
      // Ищем столбец с URL
      urlIndex = headers.findIndex(
        (h) => h.includes("profile") || h.includes("url") || h.includes("link")
      );
      // Ищем столбец с именем
      nameIndex = headers.findIndex(
        (h) => h.includes("name") || h.includes("имя")
      );

      // Если не нашли URL, ищем ID
      if (urlIndex === -1) {
        urlIndex = headers.findIndex(
          (h) => h.includes("id") || h.includes("user")
        );
      }

      // Если ничего не нашли, используем первый столбец
      if (urlIndex === -1) urlIndex = 0;
      if (nameIndex === -1 && headers.length > 1) nameIndex = 1;
    } else {
      // Без заголовков: первый столбец - данные, второй - имя
      urlIndex = 0;
      nameIndex = headers.length > 1 ? 1 : -1;
    }

    console.log(
      `📋 Обработка друзей: URL в столбце ${urlIndex}, имена в столбце ${nameIndex}`
    );

    for (let i = startIndex; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      const parts = parseCSVLine(line);
      if (parts.length === 0) continue;

      // Извлекаем данные пользователя
      const userData = parts[urlIndex]
        ? parts[urlIndex].replace(/"/g, "").trim()
        : "";

      if (!userData) {
        continue;
      }

      // Извлекаем ID из URL или прямого ID
      const userId = await extractUserIdFromProfile(userData);

      if (userId) {
        friendsList.add(userId);

        // Извлекаем имя если есть
        if (nameIndex !== -1 && parts[nameIndex]) {
          const name = parts[nameIndex].replace(/"/g, "").trim();
          if (name) {
            friendsData[userId] = name;
          }
        }

        friendsCount++;

        // Показываем прогресс каждые 50 записей
        if (friendsCount % 50 === 0) {
          showStatus("info", `Обработано друзей: ${friendsCount}...`);
        }
      } else {
        errors++;
        if (errors <= 5) {
          console.warn(
            `Не удалось извлечь ID из строки ${i + 1}: "${userData}"`
          );
        }
      }
    }

    processingStats.friendsLoaded = friendsCount;

    showFileStatus(
      "friendsFileStatus",
      `Загружено друзей: ${friendsCount}${
        errors > 0 ? ` (ошибок: ${errors})` : ""
      }`,
      "success"
    );

    showStatus(
      "success",
      `✅ Список друзей загружен: ${friendsCount} пользователей${
        errors > 0 ? ` (пропущено ${errors} некорректных записей)` : ""
      }`
    );

    // Автоматически запускаем обработку если оба файла загружены
    checkAndProcessFiles();
  } catch (error) {
    console.error("Ошибка при обработке файла друзей:", error);
    showStatus(
      "error",
      `Ошибка при обработке файла со списком друзей: ${error.message}`
    );
  }
}

// Проверка и запуск обработки если оба файла загружены
function checkAndProcessFiles() {
  const mainFile = document.getElementById("csvFile").files[0];
  const friendsFile = document.getElementById("friendsFile").files[0];

  if (mainFile && friendsList.size > 0) {
    processCSV(mainFile);
  } else if (mainFile && !friendsFile) {
    showStatus(
      "warning",
      "Загрузите файл со списком друзей для проверки дружбы"
    );
  }
}

// Основная функция обработки CSV
async function processCSV(file) {
  showStatus("info", "Загрузка основного CSV файла...");

  const text = await file.text();
  const lines = text.split("\n").filter((line) => line.trim());

  if (lines.length === 0) {
    showStatus("error", "Файл пуст");
    return;
  }

  const {
    userIds,
    userNames,
    invalidRows: parseErrors,
    emptyRows,
  } = await parseCSVData(lines);
  const uniqueIds = removeDuplicates(userIds);

  displayParsingReport(
    lines.length - 1,
    emptyRows,
    parseErrors,
    uniqueIds.length
  );
  initProcessingStats(uniqueIds.length);

  await processUsersOptimized(uniqueIds, userNames);
}

// Парсинг CSV
async function parseCSVData(lines) {
  const headers = parseCSVLine(lines[0]).map((h) =>
    h.toLowerCase().replace(/"/g, "")
  );
  const { userDataIndex, nameIndex } = findColumnIndices(headers);

  if (userDataIndex === -1) {
    throw new Error("Не найден столбец с ID/URL пользователей");
  }

  const userIds = [];
  const userNames = {};
  const invalidRows = [];
  let emptyRows = 0;

  for (let i = 1; i < lines.length; i++) {
    const cols = parseCSVLine(lines[i]);

    if (!cols[userDataIndex] || !cols[userDataIndex].trim()) {
      emptyRows++;
      continue;
    }

    const userData = cols[userDataIndex].replace(/"/g, "").trim();

    if (i % 50 === 0) {
      showStatus(
        "info",
        `Анализ строки ${i} из ${lines.length - 1}... (найдено ID: ${
          userIds.length
        })`
      );
    }

    const userId = await extractUserIdFromProfile(userData);

    if (userId) {
      userIds.push(userId);
      if (nameIndex !== -1 && cols[nameIndex]) {
        const name = cols[nameIndex].replace(/"/g, "").trim();
        if (name) userNames[userId] = name;
      }
    } else {
      invalidRows.push({
        row: i,
        data: userData,
        originalData: cols[userDataIndex],
      });
      processingStats.invalidUrls++;
    }
  }

  return { userIds, userNames, invalidRows, emptyRows };
}

// Поиск индексов столбцов
function findColumnIndices(headers) {
  const urlColumns = ["profile_url", "url", "link", "vk_url", "vk_link"];
  const idColumns = ["id", "user_id", "userid", "vk_id", "vkid"];
  const nameColumns = ["name", "username", "full_name", "имя"];

  let userDataIndex = -1;
  let nameIndex = -1;

  for (let col of urlColumns) {
    const index = headers.findIndex((h) => h.includes(col));
    if (index !== -1) {
      userDataIndex = index;
      break;
    }
  }

  if (userDataIndex === -1) {
    for (let col of idColumns) {
      const index = headers.findIndex((h) => h.includes(col));
      if (index !== -1) {
        userDataIndex = index;
        break;
      }
    }
  }

  for (let col of nameColumns) {
    const index = headers.findIndex((h) => h.includes(col));
    if (index !== -1) {
      nameIndex = index;
      break;
    }
  }

  return { userDataIndex, nameIndex };
}

// Обработка пользователей
async function processUsersOptimized(userIds, csvNames = {}) {
  document.getElementById("progressContainer").style.display = "block";
  document.getElementById("statsContainer").style.display = "grid";
  document.getElementById("controlsSection").style.display = "block";

  allResults = [];
  const resolvedIds = userIds.filter((id) => id);
  const batches = createBatches(resolvedIds, API_CONFIG.BATCH_SIZE);

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];

    try {
      showStatus(
        "info",
        `Обработка батча ${i + 1}/${batches.length}: пользователи ${
          i * API_CONFIG.BATCH_SIZE + 1
        }-${Math.min((i + 1) * API_CONFIG.BATCH_SIZE, resolvedIds.length)} из ${
          resolvedIds.length
        }...`
      );

      const users = await fetchUsersBatchOptimized(batch, csvNames);
      allResults.push(...users);
      processingStats.processed += users.length;

      updateProgress();
      updateStats();
      await sleep(getAdaptiveDelay());
    } catch (error) {
      console.error("Ошибка при обработке батча:", error);
      processingStats.errors += batch.length;
      processingStats.apiErrors += batch.length;

      showStatus("error", `Ошибка батча ${i + 1}: ${error.message}`);
      await sleep(getAdaptiveDelay());
    }
  }

  // Сопоставление с загруженным списком друзей
  if (friendsList.size > 0) {
    checkFriendshipFromList(allResults);
  }

  finishProcessing();
}

// Сопоставление пользователей со списком друзей
function checkFriendshipFromList(users) {
  showStatus(
    "info",
    `🔍 Сопоставление лайкеров с загруженным списком из ${friendsList.size} друзей...`
  );

  let friendsFound = 0;
  let notFriends = 0;

  users.forEach((user) => {
    const userId = user.id.toString();

    if (friendsList.has(userId)) {
      user.friend_status = "Друзья";

      // Добавляем имя из списка друзей если есть
      if (
        friendsData[userId] &&
        friendsData[userId] !== user.first_name + " " + user.last_name
      ) {
        user.friend_list_name = friendsData[userId];
      }

      friendsFound++;
      console.log(`✅ Лайкер ${user.id} найден в списке друзей`);
    } else {
      user.friend_status = "Не в списке друзей";
      notFriends++;
    }
  });

  showStatus(
    "success",
    `🏁 Сопоставление лайкеров завершено! Друзей среди лайкеров: ${friendsFound}, не друзей: ${notFriends}`
  );
}

// Получение данных пользователей
async function fetchUsersBatchOptimized(userIds, csvNames = {}) {
  return new Promise((resolve, reject) => {
    const callbackName = `vk_users_callback_${Date.now()}_${Math.random()
      .toString(36)
      .substr(2, 9)}`;

    window[callbackName] = function (response) {
      document.head.removeChild(script);
      delete window[callbackName];

      if (response.error) {
        reject(new Error(response.error.error_msg));
        return;
      }

      if (!response.response || !Array.isArray(response.response)) {
        reject(new Error("Неверный формат ответа API"));
        return;
      }

      const users = response.response.map((user) => {
        return createUserObject(user, csvNames);
      });

      resolve(users);
    };

    const script = document.createElement("script");
    const fields =
      "city,photo_50,can_access_closed,is_closed,domain,screen_name,last_seen,online";
    script.src = `${API_CONFIG.BASE_URL}users.get?user_ids=${userIds.join(
      ","
    )}&fields=${fields}&access_token=${API_CONFIG.ACCESS_TOKEN}&v=${
      API_CONFIG.VERSION
    }&callback=${callbackName}`;

    script.onerror = function () {
      document.head.removeChild(script);
      delete window[callbackName];
      reject(new Error("Ошибка загрузки скрипта"));
    };

    document.head.appendChild(script);

    setTimeout(() => {
      if (window[callbackName]) {
        document.head.removeChild(script);
        delete window[callbackName];
        reject(new Error("Timeout запроса"));
      }
    }, 15000);
  });
}

// Создание объекта пользователя
function createUserObject(user, csvNames) {
  let profileStatus = "Открытый";
  if (user.is_closed) {
    profileStatus = user.can_access_closed ? "Частично закрытый" : "Закрытый";
  }

  const csvName = csvNames[user.id] || csvNames[user.domain] || null;
  const firstName = csvName ? csvName.split(" ")[0] : user.first_name;
  const lastName = csvName
    ? csvName.split(" ").slice(1).join(" ")
    : user.last_name;

  return {
    id: user.id,
    first_name: firstName,
    last_name: lastName,
    photo: user.photo_50,
    city: user.city ? user.city.title : null,
    profile_status: profileStatus,
    is_closed: user.is_closed || false,
    domain: user.domain || user.screen_name || null,
    csv_name: csvName,
    friend_status: "Неизвестно", // Будет обновлено при сопоставлении
    friend_list_name: null, // Имя из списка друзей
    vk_url: `https://vk.com/id${user.id}`,
    last_seen: user.last_seen
      ? new Date(user.last_seen.time * 1000).toLocaleDateString("ru-RU")
      : null,
    online: user.online || 0,
  };
}

// Извлечение ID из профиля
async function extractUserIdFromProfile(userData) {
  if (!userData || userData === "") return null;

  userData = userData.trim().replace(/['"]/g, "");

  if (/^\d+$/.test(userData)) {
    return userData;
  }

  let username = null;

  const patterns = [
    /(?:https?:\/\/)(?:www\.|m\.)?vk\.com\/([^\/\?&#]+)/i,
    /(?:https?:\/\/)(?:www\.|m\.)?vkontakte\.ru\/([^\/\?&#]+)/i,
    /(?:www\.|m\.)?vk\.com\/([^\/\?&#]+)/i,
    /vk\.com\/([^\/\?&#]+)/i,
    /^id(\d+)$/i,
    /^([a-zA-Z0-9_.-]+)$/,
  ];

  for (let pattern of patterns) {
    const match = userData.match(pattern);
    if (match && match[1]) {
      username = match[1].toLowerCase();
      break;
    }
  }

  if (!username) return null;

  if (username.startsWith("id")) {
    const idMatch = username.match(/^id(\d+)$/);
    if (idMatch && idMatch[1]) return idMatch[1];
  }

  if (/^\d+$/.test(username)) return username;

  if (username.length < 3 || username.length > 32) return null;
  if (!/^[a-zA-Z0-9_.-]+$/.test(username)) return null;

  const reservedUsernames = [
    "id",
    "admin",
    "api",
    "www",
    "m",
    "mobile",
    "vk",
    "vkontakte",
    "app",
    "apps",
    "dev",
    "help",
    "support",
    "page",
    "pages",
    "group",
    "groups",
    "club",
    "public",
    "wall",
    "photo",
    "video",
    "audio",
    "doc",
    "market",
    "album",
    "albums",
    "login",
    "logout",
    "register",
    "signup",
    "signin",
    "settings",
    "privacy",
    "terms",
    "about",
    "contact",
    "feedback",
    "bug",
    "report",
    "security",
  ];

  if (reservedUsernames.includes(username)) return null;

  try {
    const attemptNumber = processingStats.resolveAttempts || 0;
    if (attemptNumber > 0) {
      let delay = 200;
      if (attemptNumber % 10 === 0) delay = 400;
      if (attemptNumber % 25 === 0) delay = 800;
      await sleep(delay);
    }

    processingStats.resolveAttempts =
      (processingStats.resolveAttempts || 0) + 1;
    const resolvedId = await resolveUsernameWithJSONP(username);

    if (!resolvedId) {
      processingStats.resolveErrors++;
    }

    return resolvedId;
  } catch (error) {
    processingStats.resolveErrors++;
    console.error(`Ошибка при резолве username ${username}:`, error);
    return null;
  }
}

// Резолв username через JSONP
function resolveUsernameWithJSONP(username) {
  return new Promise((resolve) => {
    const callbackName = `vk_callback_${Date.now()}_${Math.random()
      .toString(36)
      .substr(2, 9)}`;

    window[callbackName] = function (response) {
      document.head.removeChild(script);
      delete window[callbackName];

      if (response.error) {
        console.warn(`Ошибка резолва username "${username}":`, response.error);
        resolve(null);
        return;
      }

      if (response.response) {
        if (response.response.type === "user" && response.response.object_id) {
          console.info(
            `✅ Username "${username}" → ID: ${response.response.object_id}`
          );
          resolve(response.response.object_id.toString());
        } else if (response.response.type === "group") {
          console.warn(`Username "${username}" принадлежит группе, пропускаем`);
          resolve(null);
        } else {
          console.warn(
            `Username "${username}" имеет неизвестный тип: ${response.response.type}`
          );
          resolve(null);
        }
      } else {
        console.info(`Username "${username}" не занят/не найден`);
        resolve(null);
      }
    };

    const script = document.createElement("script");
    script.src = `${
      API_CONFIG.BASE_URL
    }utils.resolveScreenName?screen_name=${encodeURIComponent(
      username
    )}&access_token=${API_CONFIG.ACCESS_TOKEN}&v=${
      API_CONFIG.VERSION
    }&callback=${callbackName}`;

    script.onerror = function () {
      document.head.removeChild(script);
      delete window[callbackName];
      console.error(`Сетевая ошибка при резолве username "${username}"`);
      resolve(null);
    };

    document.head.appendChild(script);

    setTimeout(() => {
      if (window[callbackName]) {
        document.head.removeChild(script);
        delete window[callbackName];
        console.warn(`Timeout при резолве username "${username}"`);
        resolve(null);
      }
    }, 15000);
  });
}

// Вспомогательные функции
function parseCSVLine(line) {
  const result = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

function removeDuplicates(userIds) {
  const uniqueIds = [];
  const seenIds = new Set();

  userIds.forEach((id) => {
    if (!seenIds.has(id)) {
      uniqueIds.push(id);
      seenIds.add(id);
    } else {
      processingStats.duplicates++;
    }
  });

  return uniqueIds;
}

function createBatches(array, batchSize) {
  const batches = [];
  for (let i = 0; i < array.length; i += batchSize) {
    batches.push(array.slice(i, i + batchSize));
  }
  return batches;
}

function showFileStatus(elementId, message, type) {
  const element = document.getElementById(elementId);
  element.textContent = message;
  element.className = `file-status ${type}`;
  element.style.display = "block";
}

function displayParsingReport(totalLines, emptyRows, invalidRows, uniqueCount) {
  let reportMessage = `
📊 Анализ CSV с лайкерами завершен:
• Всего строк в файле: ${totalLines}
• Пустых строк: ${emptyRows}
• Некорректных URL/ID: ${processingStats.invalidUrls}
• Дубликатов: ${processingStats.duplicates}
• Уникальных лайкеров: ${uniqueCount}
${
  friendsList.size > 0
    ? `• Загружено друзей: ${processingStats.friendsLoaded}`
    : ""
}
  `.trim();

  if (invalidRows.length > 0) {
    reportMessage += `\n\n❌ Примеры некорректных строк:`;
    invalidRows.slice(0, 5).forEach((invalid) => {
      const displayData = invalid.originalData || invalid.data;
      reportMessage += `\n• Строка ${invalid.row}: "${
        displayData.length > 50
          ? displayData.substring(0, 50) + "..."
          : displayData
      }"`;
    });
    if (invalidRows.length > 5) {
      reportMessage += `\n• ... и еще ${invalidRows.length - 5} строк`;
    }
    reportMessage += `\n\n💡 Совет: проверьте формат URL - поддерживаются vk.com/username, vk.com/id123456, и прямые ID`;
  }

  showStatus("info", reportMessage);
}

function initProcessingStats(totalCount) {
  processingStats = {
    total: totalCount,
    processed: 0,
    errors: 0,
    duplicates: processingStats.duplicates,
    invalidUrls: processingStats.invalidUrls,
    resolveErrors: processingStats.resolveErrors,
    resolveAttempts: processingStats.resolveAttempts || 0,
    apiErrors: 0,
    friendsLoaded: processingStats.friendsLoaded,
  };
  updateStats();
}

function finishProcessing() {
  filteredResults = [...allResults];
  updateDisplay();
  displayAnalytics(allResults);

  const finalReport = `
🎉 Анализ лайков завершен!

📊 СТАТИСТИКА:
• К обработке: ${processingStats.total}
• Успешно проверено лайкеров: ${processingStats.processed}
• Некорректных URL: ${processingStats.invalidUrls}
• Попыток резолва username: ${processingStats.resolveAttempts || 0}
• Ошибок резолва: ${processingStats.resolveErrors}
• Дубликатов: ${processingStats.duplicates}
• API ошибок: ${processingStats.apiErrors}

✅ Итого в таблице: ${allResults.length} лайкеров
${
  friendsList.size > 0
    ? `\n👥 Сопоставлено с ${processingStats.friendsLoaded} друзьями из списка`
    : ""
}
  `.trim();

  showStatus("success", finalReport);
  document.getElementById("exportButtons").style.display = "flex";
}

// Функции отображения
function switchView(viewType) {
  currentView = viewType;

  const cardViewBtn = document.getElementById("cardViewBtn");
  const tableViewBtn = document.getElementById("tableViewBtn");
  const resultsContainer = document.getElementById("resultsContainer");
  const tableContainer = document.getElementById("tableContainer");

  if (viewType === "cards") {
    cardViewBtn.classList.add("active");
    tableViewBtn.classList.remove("active");
    resultsContainer.style.display = "block";
    tableContainer.style.display = "none";
  } else {
    tableViewBtn.classList.add("active");
    cardViewBtn.classList.remove("active");
    resultsContainer.style.display = "none";
    tableContainer.style.display = "block";
  }

  updateDisplay();
}

function filterResults(searchTerm) {
  if (!searchTerm.trim()) {
    filteredResults = [...allResults];
    return;
  }

  const term = searchTerm.toLowerCase();
  filteredResults = allResults.filter((user) => {
    return (
      user.first_name.toLowerCase().includes(term) ||
      user.last_name.toLowerCase().includes(term) ||
      (user.city && user.city.toLowerCase().includes(term)) ||
      user.id.toString().includes(term) ||
      user.profile_status.toLowerCase().includes(term) ||
      user.friend_status.toLowerCase().includes(term) ||
      (user.friend_list_name &&
        user.friend_list_name.toLowerCase().includes(term))
    );
  });
}

function sortResults(results) {
  return [...results].sort((a, b) => {
    let aVal = a[currentSort.field];
    let bVal = b[currentSort.field];

    if (currentSort.field === "name") {
      aVal = a.first_name + " " + a.last_name;
      bVal = b.first_name + " " + b.last_name;
    }

    if (aVal === null || aVal === undefined) aVal = "";
    if (bVal === null || bVal === undefined) bVal = "";

    let comparison = 0;
    if (typeof aVal === "string" && typeof bVal === "string") {
      comparison = aVal.localeCompare(bVal, "ru");
    } else {
      comparison = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
    }

    return currentSort.order === "desc" ? -comparison : comparison;
  });
}

function updateDisplay() {
  const groupBy = document.getElementById("groupBySelect").value;
  let displayResults = sortResults(filteredResults);

  if (currentView === "cards") {
    displayCardsView(displayResults, groupBy);
  } else {
    displayTableView(displayResults);
  }
}

function displayCardsView(results, groupBy) {
  const container = document.getElementById("resultsContainer");
  container.innerHTML = "";

  if (groupBy === "none") {
    const usersGrid = document.createElement("div");
    usersGrid.className = "users-grid";

    results.forEach((user) => {
      usersGrid.appendChild(createUserCard(user));
    });

    container.appendChild(usersGrid);
  } else {
    const groups = {};
    results.forEach((user) => {
      const groupKey = user[groupBy] || "Не указано";
      if (!groups[groupKey]) groups[groupKey] = [];
      groups[groupKey].push(user);
    });

    const sortedGroups = Object.entries(groups).sort(
      ([, a], [, b]) => b.length - a.length
    );

    sortedGroups.forEach(([groupName, users]) => {
      const citySection = document.createElement("div");
      citySection.className = "city-section";

      const cityHeader = document.createElement("div");
      cityHeader.className = "city-header";
      cityHeader.innerHTML = `
        <span class="city-name">${groupName}</span>
        <span class="city-count">${users.length} чел.</span>
      `;

      const usersGrid = document.createElement("div");
      usersGrid.className = "users-grid";

      users.forEach((user) => {
        usersGrid.appendChild(createUserCard(user));
      });

      citySection.appendChild(cityHeader);
      citySection.appendChild(usersGrid);
      container.appendChild(citySection);
    });
  }
}

function createUserCard(user) {
  const userCard = document.createElement("div");
  userCard.className = "user-card";

  let privacyClass = "privacy-open";
  if (user.profile_status === "Закрытый") privacyClass = "privacy-closed";
  else if (user.profile_status === "Частично закрытый")
    privacyClass = "privacy-partial";

  let friendBadge = "";
  if (user.friend_status !== "Неизвестно") {
    let friendClass = "friend-unknown";
    if (user.friend_status === "Друзья") friendClass = "friend-yes";
    else if (user.friend_status === "Не в списке друзей")
      friendClass = "friend-no";

    friendBadge = `<span class="friend-badge ${friendClass}">${user.friend_status}</span>`;
  }

  userCard.innerHTML = `
    <img src="${user.photo || "https://via.placeholder.com/50"}"
         alt="${user.first_name}"
         class="user-avatar"
         onerror="this.src='https://via.placeholder.com/50'">
    <div class="user-info">
        <h4><a href="${user.vk_url}" target="_blank">${user.first_name} ${
    user.last_name
  }</a> ${user.online ? "🟢" : ""}</h4>
        <p>ID: ${user.id} | ${user.city || "Город не указан"}</p>
        ${
          user.last_seen
            ? `<p style="font-size: 0.85em; color: #666;">Последний визит: ${user.last_seen}</p>`
            : ""
        }
        ${
          user.csv_name
            ? `<p style="font-size: 0.8em; color: #888;">CSV: ${user.csv_name}</p>`
            : ""
        }
        ${
          user.friend_list_name
            ? `<p style="font-size: 0.8em; color: #28a745;">В друзьях как: ${user.friend_list_name}</p>`
            : ""
        }
        <div style="margin-top: 8px;">
          <span class="privacy-badge ${privacyClass}">${
    user.profile_status
  }</span>
          ${friendBadge}
        </div>
    </div>
  `;
  return userCard;
}

function displayTableView(results) {
  const tbody = document.getElementById("resultsTableBody");
  tbody.innerHTML = "";

  results.forEach((user) => {
    const row = document.createElement("tr");

    let privacyClass = "privacy-open";
    if (user.profile_status === "Закрытый") privacyClass = "privacy-closed";
    else if (user.profile_status === "Частично закрытый")
      privacyClass = "privacy-partial";

    let friendClass = "friend-unknown";
    if (user.friend_status === "Друзья") friendClass = "friend-yes";
    else if (user.friend_status === "Не в списке друзей")
      friendClass = "friend-no";

    row.innerHTML = `
      <td class="avatar-cell">
        <img src="${user.photo || "https://via.placeholder.com/40"}"
             alt="${user.first_name}"
             onerror="this.src='https://via.placeholder.com/40'">
      </td>
      <td class="name-cell">
        <a href="${user.vk_url}" target="_blank">${user.first_name} ${
      user.last_name
    }</a>
        ${
          user.csv_name
            ? `<br><small style="color: #888;">CSV: ${user.csv_name}</small>`
            : ""
        }
        ${
          user.friend_list_name
            ? `<br><small style="color: #28a745;">В друзьях: ${user.friend_list_name}</small>`
            : ""
        }
      </td>
      <td>${user.id}</td>
      <td>
        ${
          user.online
            ? '<span style="color: #28a745;">🟢 Онлайн</span>'
            : '<span style="color: #6c757d;">⚫ Оффлайн</span>'
        }
        ${
          user.last_seen
            ? `<br><small style="color: #888;">${user.last_seen}</small>`
            : ""
        }
      </td>
      <td>${user.city || "Не указан"}</td>
      <td><span class="privacy-badge ${privacyClass}">${
      user.profile_status
    }</span></td>
      <td><span class="friend-badge ${friendClass}">${
      user.friend_status
    }</span></td>
    `;

    tbody.appendChild(row);
  });
}

function sortTable(field) {
  if (field === "name") field = "first_name";
  if (field === "avatar") return;

  if (currentSort.field === field) {
    currentSort.order = currentSort.order === "asc" ? "desc" : "asc";
  } else {
    currentSort.field = field;
    currentSort.order = "asc";
  }

  document.getElementById("sortBySelect").value = field;
  document.getElementById("sortOrderSelect").value = currentSort.order;

  updateDisplay();
}

// Экспорт
function exportResults(format) {
  if (format === "csv") {
    exportToCSV();
  } else if (format === "xlsx") {
    exportToXLSX();
  }
}

function exportToCSV() {
  let csv =
    "Имя,Фамилия,ID,Онлайн,Город,Последний_визит,Статус_профиля,Статус_дружбы,Имя_в_списке_друзей,Ссылка,Фото\n";

  filteredResults.forEach((user) => {
    const onlineStatus = user.online ? "Онлайн" : "Оффлайн";
    csv += `"${user.first_name}","${user.last_name}",${
      user.id
    },"${onlineStatus}","${user.city || "Не указан"}","${
      user.last_seen || ""
    }","${user.profile_status}","${user.friend_status}","${
      user.friend_list_name || ""
    }","${user.vk_url}","${user.photo || ""}"\n`;
  });

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  downloadFile(
    blob,
    `vk_users_analysis_${new Date().toISOString().split("T")[0]}.csv`
  );
}

function exportToXLSX() {
  const ws_data = [
    [
      "Имя",
      "Фамилия",
      "ID",
      "Онлайн",
      "Город",
      "Последний визит",
      "Статус профиля",
      "Статус дружбы",
      "Имя в списке друзей",
      "Ссылка",
      "Фото",
    ],
  ];

  filteredResults.forEach((user) => {
    const onlineStatus = user.online ? "Онлайн" : "Оффлайн";
    ws_data.push([
      user.first_name,
      user.last_name,
      user.id,
      onlineStatus,
      user.city || "Не указан",
      user.last_seen || "",
      user.profile_status,
      user.friend_status,
      user.friend_list_name || "",
      user.vk_url,
      user.photo || "",
    ]);
  });

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(ws_data);

  const colWidths = [];
  for (let i = 0; i < ws_data[0].length; i++) {
    let maxLength = 0;
    for (let j = 0; j < ws_data.length; j++) {
      if (ws_data[j][i]) {
        maxLength = Math.max(maxLength, ws_data[j][i].toString().length);
      }
    }
    colWidths.push({ width: Math.min(maxLength + 2, 50) });
  }
  ws["!cols"] = colWidths;

  XLSX.utils.book_append_sheet(wb, ws, "VK Users");
  XLSX.writeFile(
    wb,
    `vk_users_analysis_${new Date().toISOString().split("T")[0]}.xlsx`
  );
}

function downloadFile(blob, filename) {
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
}

// Аналитика
function displayAnalytics(users) {
  document.getElementById("analyticsSection").style.display = "block";

  displayCityAnalytics(users);
  displayProfileAnalytics(users);
  displayFriendshipAnalytics(users);
}

function displayCityAnalytics(users) {
  const cityStats = {};

  users.forEach((user) => {
    const city = user.city || "Не указан";
    cityStats[city] = (cityStats[city] || 0) + 1;
  });

  const container = document.getElementById("cityStats");
  container.innerHTML = "";

  const sortedCities = Object.entries(cityStats)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 15);

  const totalDiv = document.createElement("div");
  totalDiv.innerHTML = `
    <div style="background: #e9ecef; padding: 12px; border-radius: 8px; margin-bottom: 15px; text-align: center;">
      <strong>Всего городов: ${Object.keys(cityStats).length}</strong><br>
      <small>Показано топ-15 городов</small>
    </div>
  `;
  container.appendChild(totalDiv);

  sortedCities.forEach(([city, count]) => {
    const percentage = ((count / users.length) * 100).toFixed(1);
    const cityDiv = document.createElement("div");
    cityDiv.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px 0; border-bottom: 1px solid #f0f0f0;">
        <span style="font-weight: 500;">${city}</span>
        <span style="font-weight: bold; color: #007bff;">${count} (${percentage}%)</span>
      </div>
    `;
    container.appendChild(cityDiv);
  });
}

function displayProfileAnalytics(users) {
  const profileStats = {};
  users.forEach((user) => {
    const status = user.profile_status;
    profileStats[status] = (profileStats[status] || 0) + 1;
  });

  const container = document.getElementById("profileStats");
  container.innerHTML = "";

  Object.entries(profileStats).forEach(([status, count]) => {
    const percentage = ((count / users.length) * 100).toFixed(1);
    const statusDiv = document.createElement("div");
    statusDiv.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px 0; border-bottom: 1px solid #f0f0f0;">
        <span style="font-weight: 500;">${status}</span>
        <span style="font-weight: bold; color: #007bff;">${count} (${percentage}%)</span>
      </div>
    `;
    container.appendChild(statusDiv);
  });
}

function displayFriendshipAnalytics(users) {
  const friendStats = {};
  let totalFriends = 0;
  let totalChecked = 0;
  let notInList = 0;
  let unknown = 0;

  users.forEach((user) => {
    const status = user.friend_status;
    friendStats[status] = (friendStats[status] || 0) + 1;

    if (status === "Друзья") {
      totalFriends++;
      totalChecked++;
    } else if (status === "Не в списке друзей") {
      notInList++;
      totalChecked++;
    } else if (status === "Неизвестно") {
      unknown++;
    }
  });

  const container = document.getElementById("friendshipStats");
  container.innerHTML = "";

  if (totalChecked > 0) {
    const summaryDiv = document.createElement("div");
    summaryDiv.innerHTML = `
      <div style="background: #e8f5e8; padding: 15px; border-radius: 10px; margin-bottom: 20px;">
        <h4 style="color: #28a745; margin-bottom: 10px;">📊 Результаты анализа лайков:</h4>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; font-size: 0.9em;">
          <div><strong>👥 Лайков от друзей:</strong> <span style="color: #28a745; font-weight: bold;">${totalFriends}</span></div>
          <div><strong>📋 Всего лайкеров проверено:</strong> ${totalChecked}</div>
          <div><strong>🎯 % лайков от друзей:</strong> <span style="color: #007bff; font-weight: bold;">${
            totalChecked > 0
              ? ((totalFriends / totalChecked) * 100).toFixed(1)
              : 0
          }%</span></div>
          <div><strong>❌ Лайков от не-друзей:</strong> ${notInList}</div>
          <div><strong>❓ Не проверялись:</strong> ${unknown}</div>
          <div><strong>📁 Размер списка друзей:</strong> ${
            friendsList.size
          }</div>
        </div>
      </div>
    `;
    container.appendChild(summaryDiv);
  } else if (friendsList.size > 0) {
    const summaryDiv = document.createElement("div");
    summaryDiv.innerHTML = `
      <div style="background: #fff3cd; padding: 15px; border-radius: 10px; margin-bottom: 20px;">
        <h4 style="color: #856404; margin-bottom: 10px;">📋 Список друзей загружен:</h4>
        <div style="font-size: 0.9em;">
          <div><strong>📁 Размер списка друзей:</strong> ${friendsList.size}</div>
          <div><strong>⚠️ Лайкеры ещё не сопоставлены</strong></div>
        </div>
      </div>
    `;
    container.appendChild(summaryDiv);
  }

  const sortedStats = Object.entries(friendStats).sort(([, a], [, b]) => b - a);

  sortedStats.forEach(([status, count]) => {
    const percentage = ((count / users.length) * 100).toFixed(1);
    const statusDiv = document.createElement("div");

    let statusColor = "#6c757d";
    let icon = "👤";

    if (status === "Друзья") {
      statusColor = "#28a745";
      icon = "✅";
    } else if (status === "Не в списке друзей") {
      statusColor = "#6c757d";
      icon = "❌";
    } else if (status === "Неизвестно") {
      statusColor = "#6c757d";
      icon = "❓";
    }

    statusDiv.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px 0; border-bottom: 1px solid #f0f0f0;">
        <span style="font-weight: 500;">${icon} ${status}</span>
        <span style="font-weight: bold; color: ${statusColor};">${count} (${percentage}%)</span>
      </div>
    `;
    container.appendChild(statusDiv);
  });
}

// Вспомогательные функции
function updateProgress() {
  const percent = (processingStats.processed / processingStats.total) * 100;
  document.getElementById("progressFill").style.width = percent + "%";
  document.getElementById(
    "progressText"
  ).textContent = `${processingStats.processed}/${processingStats.total}`;
}

function updateStats() {
  const updateElement = (id, value) => {
    const element = document.getElementById(id);
    if (element) {
      // Убираем любые префиксы типа ❌ или ✕
      element.textContent = value.toString();
      // Убираем классы или атрибуты, которые могут добавлять крестики
      element.removeAttribute("data-value");
      element.className = element.className.replace(
        /\b(error|zero|low|failed)\b/g,
        ""
      );
    }
  };

  updateElement("totalUsers", processingStats.total);
  updateElement("processedUsers", processingStats.processed);

  // Считаем уникальные города только из обработанных пользователей
  const cities = new Set();
  allResults.forEach((user) => {
    const city = user.city || "Не указан";
    cities.add(city);
  });
  updateElement("uniqueCities", cities.size);

  // Считаем открытые профили
  const openProfiles = allResults.filter(
    (user) => user.profile_status === "Открытый"
  ).length;
  updateElement("openProfiles", openProfiles);

  // Считаем друзей среди лайкеров
  const friendsInLikes = allResults.filter(
    (user) => user.friend_status === "Друзья"
  ).length;
  updateElement("friendsInLikes", friendsInLikes);
}

function showStatus(type, message) {
  const status = document.getElementById("status");
  status.className = `status ${type}`;
  status.textContent = message;
  status.style.display = "block";
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
