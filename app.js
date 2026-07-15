const STORAGE_KEY = "rif_settings_v1";
const DEFAULT_TIMES = ["09:00", "21:00"];

function loadSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) throw new Error("empty");
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed.times) || parsed.times.length === 0) {
      parsed.times = [...DEFAULT_TIMES];
    }
    parsed.shownLog = parsed.shownLog || {};
    parsed.bag = Array.isArray(parsed.bag) ? parsed.bag : [];
    parsed.intenseMode = !!parsed.intenseMode;
    return parsed;
  } catch {
    return { times: [...DEFAULT_TIMES], shownLog: {}, bag: [], intenseMode: false };
  }
}

function saveSettings(s) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
}

let settings = loadSettings();
const timeouts = new Map(); // time -> timeout id

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

function pruneOldLog() {
  const tk = todayKey();
  for (const key of Object.keys(settings.shownLog)) {
    if (key !== tk) delete settings.shownLog[key];
  }
}

function activePool() {
  return settings.intenseMode ? QUOTES.concat(INTENSE_QUOTES) : QUOTES;
}

// Shuffle-bag: draw quotes without repeats until the bag is exhausted, then reshuffle.
function nextQuote() {
  const pool = activePool();
  if (settings.bag.length === 0 || settings.bag.some((i) => i >= pool.length)) {
    const idx = pool.map((_, i) => i);
    for (let i = idx.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [idx[i], idx[j]] = [idx[j], idx[i]];
    }
    settings.bag = idx;
  }
  const i = settings.bag.pop();
  saveSettings(settings);
  return pool[i];
}

// ---------- UI ----------
const quoteCard = document.getElementById("quoteCard");
const nextBtn = document.getElementById("nextBtn");
const permBtn = document.getElementById("permBtn");
const permStatus = document.getElementById("permStatus");
const timesList = document.getElementById("timesList");
const addTimeInput = document.getElementById("addTimeInput");
const addTimeBtn = document.getElementById("addTimeBtn");
const intenseToggle = document.getElementById("intenseToggle");

function showQuote(text) {
  quoteCard.classList.add("fade");
  setTimeout(() => {
    quoteCard.textContent = text;
    quoteCard.classList.remove("fade");
  }, 180);
}

function renderTimes() {
  timesList.innerHTML = "";
  const sorted = [...settings.times].sort();
  for (const t of sorted) {
    const chip = document.createElement("span");
    chip.className = "time-chip";
    chip.innerHTML = `<span>${t}</span>`;
    const removeBtn = document.createElement("button");
    removeBtn.textContent = "×";
    removeBtn.setAttribute("aria-label", `移除 ${t}`);
    removeBtn.addEventListener("click", () => removeTime(t));
    chip.appendChild(removeBtn);
    timesList.appendChild(chip);
  }
}

function addTime(t) {
  if (!t || settings.times.includes(t)) return;
  settings.times.push(t);
  saveSettings(settings);
  renderTimes();
  rescheduleAll();
}

function removeTime(t) {
  settings.times = settings.times.filter((x) => x !== t);
  saveSettings(settings);
  renderTimes();
  rescheduleAll();
}

function renderPermStatus() {
  const perm = "Notification" in window ? Notification.permission : "unsupported";
  permStatus.innerHTML = "";
  const dot = document.createElement("span");
  dot.className = "dot " + (perm === "granted" ? "ok" : perm === "denied" ? "off" : "warn");
  permStatus.appendChild(dot);
  const label = document.createElement("span");
  label.textContent =
    perm === "granted" ? "通知已開啟" :
    perm === "denied" ? "通知被封鎖,請至系統設定開啟" :
    perm === "unsupported" ? "此瀏覽器不支援通知,請先「加入主畫面」再打開" :
    "尚未開啟通知";
  permStatus.appendChild(label);
  permBtn.style.display = (perm === "granted" || perm === "unsupported") ? "none" : "inline-block";
}

async function requestPermission() {
  if (!("Notification" in window)) return;
  try {
    await Notification.requestPermission();
  } catch {
    // ignore
  }
  renderPermStatus();
  registerPeriodicSync();
}

// ---------- Scheduling ----------
function msUntil(timeStr, fromDate = new Date()) {
  const [h, m] = timeStr.split(":").map(Number);
  const target = new Date(fromDate);
  target.setHours(h, m, 0, 0);
  if (target <= fromDate) target.setDate(target.getDate() + 1);
  return target - fromDate;
}

async function fireReminder(time) {
  const quote = nextQuote();
  const tk = todayKey();
  settings.shownLog[tk] = settings.shownLog[tk] || [];
  if (!settings.shownLog[tk].includes(time)) {
    settings.shownLog[tk].push(time);
    saveSettings(settings);
  }
  showQuote(quote);

  if ("Notification" in window && Notification.permission === "granted") {
    try {
      const reg = await navigator.serviceWorker.ready;
      reg.showNotification("該放下內耗了", {
        body: quote,
        icon: "icons/icon-192.png",
        badge: "icons/icon-192.png",
        tag: "daily-reminder",
      });
    } catch {
      // ignore
    }
  }
}

function scheduleTime(time) {
  clearTimeout(timeouts.get(time));
  const delay = msUntil(time);
  const id = setTimeout(() => {
    fireReminder(time);
    scheduleTime(time); // chain to the next day
  }, delay);
  timeouts.set(time, id);
}

function rescheduleAll() {
  for (const id of timeouts.values()) clearTimeout(id);
  timeouts.clear();
  for (const t of settings.times) scheduleTime(t);
}

// If a scheduled time already passed today while the app was closed, catch up once on open.
function catchUpMissed() {
  pruneOldLog();
  const tk = todayKey();
  const now = new Date();
  const shownToday = settings.shownLog[tk] || [];
  for (const t of settings.times) {
    const [h, m] = t.split(":").map(Number);
    const target = new Date(now);
    target.setHours(h, m, 0, 0);
    if (target <= now && !shownToday.includes(t)) {
      fireReminder(t);
    }
  }
}

async function registerPeriodicSync() {
  if (!("serviceWorker" in navigator)) return;
  try {
    const reg = await navigator.serviceWorker.ready;
    if ("periodicSync" in reg) {
      const status = await navigator.permissions.query({ name: "periodic-background-sync" });
      if (status.state === "granted") {
        await reg.periodicSync.register("daily-reminder", {
          minInterval: 12 * 60 * 60 * 1000,
        });
      }
    }
  } catch {
    // Periodic Background Sync isn't available on this browser/OS (e.g. iOS Safari) — that's fine.
  }
}

// ---------- Init ----------
function init() {
  showQuote(nextQuote());
  renderTimes();
  renderPermStatus();
  catchUpMissed();
  rescheduleAll();

  intenseToggle.checked = settings.intenseMode;

  nextBtn.addEventListener("click", () => showQuote(nextQuote()));
  permBtn.addEventListener("click", requestPermission);
  addTimeBtn.addEventListener("click", () => {
    addTime(addTimeInput.value);
  });
  intenseToggle.addEventListener("change", () => {
    settings.intenseMode = intenseToggle.checked;
    settings.bag = [];
    saveSettings(settings);
    showQuote(nextQuote());
  });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      catchUpMissed();
    }
  });

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
}

init();
