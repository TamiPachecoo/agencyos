const USAGE_FUNCTION_URL = `${SUPABASE_URL}/functions/v1/get-app-usage-dashboard`;

function usageEscapeHtml(value) {
  if (value == null) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function setUsageState(message, isError = false) {
  const state = document.getElementById("usage-state");
  state.textContent = message;
  state.hidden = !message;
  state.classList.toggle("usage-error", isError);
}

function formatUsageDate(value) {
  if (!value) return "No activity yet";
  return new Date(value).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function renderRanked(items, emptyLabel) {
  if (!items || !items.length) return `<span class="usage-muted">${usageEscapeHtml(emptyLabel)}</span>`;
  return `
    <div class="usage-ranked-list">
      ${items.map((item) => `
        <span class="usage-pill">${usageEscapeHtml(item.name)} <strong>${item.count}</strong></span>
      `).join("")}
    </div>
  `;
}

function renderTrend(points) {
  const max = Math.max(1, ...points.map((point) => point.accesses + point.usage_events));
  return `
    <div class="usage-trend" aria-label="30 day app trend">
      ${points.map((point) => {
        const accessHeight = Math.max(2, Math.round((point.accesses / max) * 46));
        const usageHeight = Math.max(2, Math.round((point.usage_events / max) * 46));
        return `
          <div class="usage-trend-day" title="${usageEscapeHtml(point.date)}: ${point.accesses} access, ${point.usage_events} actual usage">
            <span class="usage-bar usage-access" style="height:${accessHeight}px"></span>
            <span class="usage-bar usage-action" style="height:${usageHeight}px"></span>
          </div>
        `;
      }).join("")}
    </div>
  `;
}

function renderUsageDashboard(data) {
  const dashboard = document.getElementById("usage-dashboard");
  const summary = document.getElementById("usage-summary");
  const appGrid = document.getElementById("usage-app-grid");

  const totals = data.apps.reduce((acc, app) => {
    acc.users += app.unique_users_today;
    acc.sessions += app.sessions_today;
    acc.accesses += app.accesses_today;
    acc.usage += app.usage_events_today;
    return acc;
  }, { users: 0, sessions: 0, accesses: 0, usage: 0 });

  summary.innerHTML = `
    <div class="usage-total"><strong>${totals.users}</strong><span>Unique users today</span></div>
    <div class="usage-total"><strong>${totals.sessions}</strong><span>Sessions today</span></div>
    <div class="usage-total"><strong>${totals.accesses}</strong><span>Access events today</span></div>
    <div class="usage-total"><strong>${totals.usage}</strong><span>Actual usage today</span></div>
  `;

  appGrid.innerHTML = data.apps.map((app) => `
    <article class="card usage-app-card">
      <div class="usage-app-head">
        <div>
          <span class="badge badge-active">${usageEscapeHtml(app.app_key)}</span>
          <h2>${usageEscapeHtml(app.name)}</h2>
        </div>
        <span class="usage-last">${usageEscapeHtml(formatUsageDate(app.last_activity))}</span>
      </div>

      <div class="usage-metric-grid">
        <div><strong>${app.unique_users_today}</strong><span>users today</span></div>
        <div><strong>${app.sessions_today}</strong><span>sessions</span></div>
        <div><strong>${app.active_users_7d}</strong><span>active 7d</span></div>
        <div><strong>${app.active_users_30d}</strong><span>active 30d</span></div>
      </div>

      <div class="usage-split">
        <div><strong>${app.accesses_today}</strong><span>access</span></div>
        <div><strong>${app.usage_events_today}</strong><span>actual usage</span></div>
      </div>

      ${renderTrend(app.daily_trend)}

      <div class="usage-detail-grid">
        <div>
          <h3>Modules</h3>
          ${renderRanked(app.top_modules, "No module activity yet")}
        </div>
        <div>
          <h3>Actions</h3>
          ${renderRanked(app.top_actions, "No meaningful actions yet")}
        </div>
      </div>
    </article>
  `).join("");

  dashboard.hidden = false;
  setUsageState("");
}

async function getUsageSession() {
  const { data } = await supabaseClient.auth.getSession();
  return data.session;
}

async function loadUsageDashboard() {
  const login = document.getElementById("usage-login");
  const dashboard = document.getElementById("usage-dashboard");
  const session = await getUsageSession();

  if (!session) {
    dashboard.hidden = true;
    login.hidden = false;
    setUsageState("");
    return;
  }

  login.hidden = true;
  dashboard.hidden = true;
  setUsageState("Loading usage...");

  const response = await fetch(USAGE_FUNCTION_URL, {
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      apikey: SUPABASE_PUBLISHABLE_KEY,
    },
  });

  if (!response.ok) {
    if (response.status === 401) {
      await supabaseClient.auth.signOut();
      document.getElementById("usage-login").hidden = false;
      setUsageState("Please sign in again to view analytics.", true);
      return;
    }
    throw new Error("Could not load usage analytics.");
  }

  renderUsageDashboard(await response.json());
}

document.getElementById("usage-login-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = new FormData(event.target);
  const email = String(form.get("email") || "");
  const password = String(form.get("password") || "");

  setUsageState("Signing in...");
  const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
  if (error) {
    setUsageState(error.message, true);
    return;
  }

  await loadUsageDashboard();
});

document.getElementById("usage-refresh").addEventListener("click", () => {
  loadUsageDashboard().catch((error) => setUsageState(error.message, true));
});

document.getElementById("today").textContent = new Date().toLocaleDateString(undefined, {
  weekday: "long",
  month: "long",
  day: "numeric",
});

loadUsageDashboard().catch((error) => setUsageState(error.message, true));
