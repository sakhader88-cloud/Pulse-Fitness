const COLOR_HEX = {
  violet: "#8B5CF6",
  cyan: "#22D3EE",
  mint: "#34D399",
  orange: "#FB923C",
  pink: "#F472B6"
};

let CURRENT_USER = null;
let selectedEmoji = "💧";
let selectedColor = "violet";
let deferredInstallPrompt = null;

// ============ Utilities ============

function qs(sel) { return document.querySelector(sel); }
function qsa(sel) { return Array.from(document.querySelectorAll(sel)); }

async function api(method, url, body) {
  const res = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Something went wrong.");
  return data;
}

function todayLabel() {
  return new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
}

// ============ Auth ============

async function checkSession() {
  const { user } = await api("GET", "/api/auth/me");
  if (user) {
    CURRENT_USER = user;
    showApp();
  } else {
    showAuth();
  }
}

function showAuth() {
  qs("#auth-screen").classList.remove("hidden");
  qs("#app-shell").classList.add("hidden");
}

function showApp() {
  qs("#auth-screen").classList.add("hidden");
  qs("#app-shell").classList.remove("hidden");
  qs("#greeting").textContent = `Hey, ${CURRENT_USER.name.split(" ")[0]}`;
  qs("#app-date").textContent = todayLabel();
  qs("#profile-name").textContent = CURRENT_USER.name;
  qs("#profile-email").textContent = CURRENT_USER.email;
  qs("#profile-avatar").textContent = CURRENT_USER.name.charAt(0).toUpperCase();
  loadToday();
}

function setupAuthTabs() {
  qsa(".auth-tab").forEach(tab => {
    tab.addEventListener("click", () => {
      qsa(".auth-tab").forEach(t => t.classList.toggle("active", t === tab));
      const isLogin = tab.dataset.tab === "login";
      qs("#login-form").classList.toggle("hidden", !isLogin);
      qs("#register-form").classList.toggle("hidden", isLogin);
    });
  });
}

function setupAuthForms() {
  qs("#login-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const status = qs("#login-status");
    status.textContent = "";
    status.className = "form-status";
    try {
      const { user } = await api("POST", "/api/auth/login", {
        email: qs("#login-email").value,
        password: qs("#login-password").value
      });
      CURRENT_USER = user;
      showApp();
    } catch (err) {
      status.textContent = err.message;
      status.classList.add("err");
    }
  });

  qs("#register-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const status = qs("#register-status");
    status.textContent = "";
    status.className = "form-status";
    try {
      const { user } = await api("POST", "/api/auth/register", {
        name: qs("#register-name").value,
        email: qs("#register-email").value,
        password: qs("#register-password").value
      });
      CURRENT_USER = user;
      showApp();
    } catch (err) {
      status.textContent = err.message;
      status.classList.add("err");
    }
  });

  qs("#logout-btn").addEventListener("click", async () => {
    await api("POST", "/api/auth/logout");
    CURRENT_USER = null;
    showAuth();
  });
}

// ============ Navigation ============

function setupNav() {
  qsa(".nav-btn").forEach(btn => {
    btn.addEventListener("click", () => switchScreen(btn.dataset.screen));
  });
}

function switchScreen(name) {
  qsa(".nav-btn").forEach(b => b.classList.toggle("active", b.dataset.screen === name));
  qsa(".screen").forEach(s => s.classList.toggle("active", s.id === `screen-${name}`));

  if (name === "today") loadToday();
  if (name === "habits") loadHabitsManage();
  if (name === "workouts") loadWorkouts();
  if (name === "stats") loadStats();
}

// ============ Today screen ============

function checkIconSvg() {
  return `<svg viewBox="0 0 24 24" fill="none"><path d="M5 13l4 4L19 7" stroke="#0B0B14" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

async function loadToday() {
  const habits = await api("GET", "/api/habits");
  const list = qs("#today-habit-list");

  if (!habits.length) {
    list.innerHTML = `<p class="empty-state">No habits yet — add your first one in the Habits tab.</p>`;
  } else {
    list.innerHTML = habits.map(h => `
      <div class="habit-item">
        <div class="habit-emoji" style="--habit-color:${COLOR_HEX[h.color] || COLOR_HEX.violet}">${h.emoji}</div>
        <div class="habit-info">
          <div class="habit-name">${escapeHtml(h.name)}</div>
          <div class="habit-freq">${h.frequency}</div>
        </div>
        <button class="habit-check ${h.doneToday ? "checked" : ""}" data-habit-id="${h.id}">
          ${checkIconSvg()}
        </button>
      </div>
    `).join("");

    qsa(".habit-check").forEach(btn => {
      btn.addEventListener("click", () => toggleHabit(btn.dataset.habitId, btn));
    });
  }

  const done = habits.filter(h => h.doneToday).length;
  const total = habits.length;
  qs("#ring-value").textContent = `${done}/${total}`;
  const pct = total ? done / total : 0;
  const circumference = 440;
  qs("#ring-fill").style.strokeDashoffset = String(circumference - circumference * pct);
}

async function toggleHabit(id, btn) {
  btn.classList.toggle("checked");
  try {
    const { doneToday } = await api("POST", `/api/habits/${id}/checkin`);
    btn.classList.toggle("checked", doneToday);
    loadToday();
  } catch {
    btn.classList.toggle("checked");
  }
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

// ============ Habits management screen ============

function trashIconSvg() {
  return `<svg viewBox="0 0 24 24" fill="none"><path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0l-1 14a2 2 0 01-2 2H7a2 2 0 01-2-2L4 6h16z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

async function loadHabitsManage() {
  const habits = await api("GET", "/api/habits");
  const list = qs("#habits-manage-list");

  if (!habits.length) {
    list.innerHTML = `<p class="empty-state">Nothing here yet. Tap "+ Add" to create your first habit.</p>`;
    return;
  }

  list.innerHTML = habits.map(h => `
    <div class="habit-item">
      <div class="habit-emoji" style="--habit-color:${COLOR_HEX[h.color] || COLOR_HEX.violet}">${h.emoji}</div>
      <div class="habit-info">
        <div class="habit-name">${escapeHtml(h.name)}</div>
        <div class="habit-freq">${h.frequency}</div>
      </div>
      <button class="trash-btn" data-habit-id="${h.id}">${trashIconSvg()}</button>
    </div>
  `).join("");

  qsa(".trash-btn[data-habit-id]").forEach(btn => {
    btn.addEventListener("click", async () => {
      await api("DELETE", `/api/habits/${btn.dataset.habitId}`);
      loadHabitsManage();
    });
  });
}

// ============ Add habit modal ============

function setupAddHabitModal() {
  qs("#open-add-habit").addEventListener("click", () => openModal("modal-add-habit"));

  qsa("#emoji-grid .emoji-opt").forEach(btn => {
    btn.addEventListener("click", () => {
      qsa("#emoji-grid .emoji-opt").forEach(b => b.classList.remove("selected"));
      btn.classList.add("selected");
      selectedEmoji = btn.dataset.emoji;
    });
  });

  qsa("#color-grid .color-opt").forEach(btn => {
    btn.addEventListener("click", () => {
      qsa("#color-grid .color-opt").forEach(b => b.classList.remove("selected"));
      btn.classList.add("selected");
      selectedColor = btn.dataset.color;
    });
  });

  qs("#add-habit-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const status = qs("#add-habit-status");
    status.textContent = "";
    status.className = "form-status";
    try {
      await api("POST", "/api/habits", {
        name: qs("#habit-name").value,
        emoji: selectedEmoji,
        color: selectedColor,
        frequency: "daily"
      });
      closeModal();
      qs("#add-habit-form").reset();
      selectedEmoji = "💧";
      selectedColor = "violet";
      qsa("#emoji-grid .emoji-opt").forEach((b, i) => b.classList.toggle("selected", i === 0));
      qsa("#color-grid .color-opt").forEach((b, i) => b.classList.toggle("selected", i === 0));
      loadHabitsManage();
      loadToday();
    } catch (err) {
      status.textContent = err.message;
      status.classList.add("err");
    }
  });
}

// ============ Workouts screen ============

async function loadWorkouts() {
  const workouts = await api("GET", "/api/workouts");
  const list = qs("#workout-list");

  if (!workouts.length) {
    list.innerHTML = `<p class="empty-state">No workouts logged yet. Tap "+ Log" to add one.</p>`;
    return;
  }

  list.innerHTML = workouts.map(w => `
    <div class="workout-item">
      <div class="workout-top">
        <span class="workout-type">${escapeHtml(w.type)}</span>
        <span class="workout-date">${formatDate(w.date)}</span>
      </div>
      <div class="workout-meta">${w.durationMin} min${w.calories ? ` · ${w.calories} kcal` : ""}</div>
      ${w.notes ? `<div class="workout-notes">"${escapeHtml(w.notes)}"</div>` : ""}
      <button class="trash-btn" data-workout-id="${w.id}">${trashIconSvg()}</button>
    </div>
  `).join("");

  qsa(".trash-btn[data-workout-id]").forEach(btn => {
    btn.addEventListener("click", async () => {
      await api("DELETE", `/api/workouts/${btn.dataset.workoutId}`);
      loadWorkouts();
    });
  });
}

function formatDate(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function setupAddWorkoutModal() {
  qs("#open-add-workout").addEventListener("click", () => {
    qs("#workout-date").value = new Date().toISOString().slice(0, 10);
    openModal("modal-add-workout");
  });

  qs("#add-workout-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const status = qs("#add-workout-status");
    status.textContent = "";
    status.className = "form-status";
    try {
      await api("POST", "/api/workouts", {
        type: qs("#workout-type").value,
        durationMin: qs("#workout-duration").value,
        calories: qs("#workout-calories").value,
        date: qs("#workout-date").value,
        notes: qs("#workout-notes").value
      });
      closeModal();
      qs("#add-workout-form").reset();
      loadWorkouts();
    } catch (err) {
      status.textContent = err.message;
      status.classList.add("err");
    }
  });
}

// ============ Stats screen ============

async function loadStats() {
  const stats = await api("GET", "/api/stats");

  qs("#stat-grid").innerHTML = `
    <div class="stat-card"><div class="stat-value">${stats.bestStreak}</div><div class="stat-label">Best streak</div></div>
    <div class="stat-card"><div class="stat-value">${stats.totalWorkouts}</div><div class="stat-label">Workouts logged</div></div>
    <div class="stat-card"><div class="stat-value">${stats.totalMinutes}</div><div class="stat-label">Minutes trained</div></div>
    <div class="stat-card"><div class="stat-value">${stats.totalCheckinsEver}</div><div class="stat-label">Habits checked off</div></div>
  `;

  const maxCompletion = Math.max(0.001, ...stats.last7.map(d => d.completion));
  qs("#bar-chart").innerHTML = stats.last7.map(d => {
    const heightPct = Math.max(4, Math.round((d.completion / maxCompletion) * 100));
    return `
      <div class="bar-col">
        <div class="bar-fill ${d.doneCount > 0 ? "has-data" : ""}" style="height:${heightPct}%"></div>
        <span class="bar-day-label">${d.label}</span>
      </div>
    `;
  }).join("");

  const streakList = qs("#streak-list");
  if (!stats.habitStreaks.length) {
    streakList.innerHTML = `<p class="empty-state">Add a habit to start building streaks.</p>`;
  } else {
    streakList.innerHTML = stats.habitStreaks.map(h => `
      <div class="streak-row">
        <span>${h.emoji} ${escapeHtml(h.name)}</span>
        <span class="streak-flame">${h.streak > 0 ? "🔥 " : ""}${h.streak} day${h.streak === 1 ? "" : "s"}</span>
      </div>
    `).join("");
  }
}

// ============ Modals ============

function openModal(id) {
  qs("#modal-backdrop").classList.remove("hidden");
  qsa(".modal").forEach(m => m.classList.toggle("hidden", m.id !== id));
}
function closeModal() {
  qs("#modal-backdrop").classList.add("hidden");
  qsa(".modal").forEach(m => m.classList.add("hidden"));
}
function setupModalClose() {
  qsa("[data-close-modal]").forEach(btn => btn.addEventListener("click", closeModal));
  qs("#modal-backdrop").addEventListener("click", (e) => {
    if (e.target.id === "modal-backdrop") closeModal();
  });
}

// ============ PWA install ============

function setupInstallPrompt() {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
  });

  const triggerInstall = async () => {
    if (!deferredInstallPrompt) return;
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
  };

  qs("#install-btn").addEventListener("click", triggerInstall);
  qs("#profile-install-btn").addEventListener("click", triggerInstall);
}

function registerServiceWorker() {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("/service-worker.js").catch(() => {});
  }
}

// ============ Init ============

document.addEventListener("DOMContentLoaded", () => {
  setupAuthTabs();
  setupAuthForms();
  setupNav();
  setupAddHabitModal();
  setupAddWorkoutModal();
  setupModalClose();
  setupInstallPrompt();
  registerServiceWorker();
  checkSession();
});
