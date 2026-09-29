const USAGE_FUNCTION_URL = `${SUPABASE_URL}/functions/v1/get-app-usage-dashboard`;
const USAGE_CODE_KEY = "agencyos_usage_dashboard_code";

let usageRangeDays = 30;
let currentUsageData = null;

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

function formatShortDate(value) {
  return new Date(`${value}T12:00:00`).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function plural(value, label) {
  return `${value} ${label}${value === 1 ? "" : "s"}`;
}

function chartMax(values) {
  return Math.max(1, ...values);
}

function totalActivity(app) {
  return app.accesses_range + app.usage_events_range;
}

function renderSegmentedControl() {
  document.getElementById("usage-range").innerHTML = [7, 30, 90].map((days) => `
    <button type="button" class="usage-range-btn ${usageRangeDays === days ? "active" : ""}" data-range-days="${days}">
      ${days}d
    </button>
  `).join("");
}

function renderBars(points) {
  const max = chartMax(points.map((point) => point.accesses + point.usage_events));
  return `
    <div class="usage-chart-bars">
      ${points.map((point) => {
        const accessHeight = Math.max(2, Math.round((point.accesses / max) * 128));
        const usageHeight = Math.max(2, Math.round((point.usage_events / max) * 128));
        return `
          <div class="usage-chart-day" title="${usageEscapeHtml(formatShortDate(point.date))}: ${point.accesses} access, ${point.usage_events} usage">
            <span class="usage-chart-bar usage-chart-access" style="height:${accessHeight}px"></span>
            <span class="usage-chart-bar usage-chart-action" style="height:${usageHeight}px"></span>
          </div>
        `;
      }).join("")}
    </div>
  `;
}

function renderRankedBars(items, emptyLabel) {
  if (!items || !items.length) return `<p class="usage-muted">${usageEscapeHtml(emptyLabel)}</p>`;
  const max = chartMax(items.map((item) => item.count));
  return `
    <div class="usage-ranked-bars">
      ${items.map((item) => `
        <div class="usage-ranked-row">
          <span>${usageEscapeHtml(item.name)}</span>
          <div class="usage-ranked-track"><i style="width:${Math.round((item.count / max) * 100)}%"></i></div>
          <strong>${item.count}</strong>
        </div>
      `).join("")}
    </div>
  `;
}

function renderDonut(totals) {
  const accesses = totals.accesses || 0;
  const usage = totals.usage_events || 0;
  const total = accesses + usage;
  const usagePct = total ? Math.round((usage / total) * 100) : 0;
  return `
    <div class="usage-donut" style="--usage-pct:${usagePct}">
      <div>
        <strong>${usagePct}%</strong>
        <span>usage mix</span>
      </div>
    </div>
  `;
}

function renderInsights(data) {
  const insights = [];
  if (data.insights.top_app) {
    insights.push({
      label: "Most used app",
      value: data.insights.top_app.name,
      detail: plural(data.insights.top_app.usage_events, "meaningful action"),
    });
  }
  insights.push({
    label: "Engagement",
    value: `${data.insights.engagement_rate}%`,
    detail: "actual usage compared with access events",
  });
  if (data.insights.low_usage_apps.length) {
    insights.push({
      label: "Needs follow-up",
      value: data.insights.low_usage_apps.join(", "),
      detail: "people entered, but did not complete tracked actions",
    });
  }
  if (data.insights.dormant_apps.length) {
    insights.push({
      label: "No activity yet",
      value: data.insights.dormant_apps.join(", "),
      detail: "instrumented but no events in this range",
    });
  }

  document.getElementById("usage-insights").innerHTML = insights.map((item) => `
    <article class="usage-insight">
      <span>${usageEscapeHtml(item.label)}</span>
      <strong>${usageEscapeHtml(item.value)}</strong>
      <p>${usageEscapeHtml(item.detail)}</p>
    </article>
  `).join("");
}

function renderAppComparison(apps) {
  const max = chartMax(apps.map(totalActivity));
  document.getElementById("usage-app-comparison").innerHTML = apps.map((app) => {
    const total = totalActivity(app);
    const width = Math.round((total / max) * 100);
    return `
      <div class="usage-app-row">
        <div>
          <strong>${usageEscapeHtml(app.name)}</strong>
          <span>${app.active_users_range} users · ${app.engagement_rate}% engagement</span>
        </div>
        <div class="usage-app-track">
          <i style="width:${width}%"></i>
        </div>
        <span>${total}</span>
      </div>
    `;
  }).join("");
}

function renderAppCards(apps) {
  document.getElementById("usage-app-grid").innerHTML = apps.map((app) => `
    <article class="card usage-app-card">
      <div class="usage-app-head">
        <div>
          <span class="badge badge-active">${usageEscapeHtml(app.app_key)}</span>
          <h2>${usageEscapeHtml(app.name)}</h2>
        </div>
        <span class="usage-last">${usageEscapeHtml(formatUsageDate(app.last_activity))}</span>
      </div>
      <div class="usage-metric-grid">
        <div><strong>${app.active_users_range}</strong><span>users in range</span></div>
        <div><strong>${app.sessions_range}</strong><span>sessions</span></div>
        <div><strong>${app.accesses_range}</strong><span>access</span></div>
        <div><strong>${app.usage_events_range}</strong><span>actual usage</span></div>
      </div>
      <div class="usage-mini-chart">${renderBars(app.daily_trend)}</div>
      <div class="usage-detail-grid">
        <div>
          <h3>Modules</h3>
          ${renderRankedBars(app.top_modules, "No module activity yet")}
        </div>
        <div>
          <h3>Actions</h3>
          ${renderRankedBars(app.top_actions, "No meaningful actions yet")}
        </div>
      </div>
    </article>
  `).join("");
}

function renderReports(reports) {
  const list = document.getElementById("usage-report-list");
  if (!reports || !reports.length) {
    list.innerHTML = `<p class="usage-muted">No saved reports yet.</p>`;
    return;
  }

  list.innerHTML = reports.map((report) => `
    <button type="button" class="usage-report-item" data-report-id="${report.id}">
      <span>${usageEscapeHtml(report.title)}</span>
      <strong>${usageEscapeHtml(formatUsageDate(report.created_at))}</strong>
      <small>${report.range_days}d · ${report.summary ? plural(report.summary.usage_events, "usage action") : "saved snapshot"}</small>
    </button>
  `).join("");
}

function renderUsageDashboard(data) {
  currentUsageData = data;
  const dashboard = document.getElementById("usage-dashboard");
  const totals = data.totals;
  dashboard.style.setProperty("--usage-days", data.range_days || usageRangeDays);

  document.getElementById("usage-summary").innerHTML = `
    <div class="usage-total"><strong>${totals.unique_users}</strong><span>active users</span></div>
    <div class="usage-total"><strong>${totals.sessions}</strong><span>sessions</span></div>
    <div class="usage-total"><strong>${totals.accesses}</strong><span>access events</span></div>
    <div class="usage-total"><strong>${totals.usage_events}</strong><span>actual usage</span></div>
  `;

  document.getElementById("usage-main-chart").innerHTML = renderBars(data.trend);
  document.getElementById("usage-donut-wrap").innerHTML = renderDonut(totals);
  document.getElementById("usage-module-bars").innerHTML = renderRankedBars(data.top_modules, "No module activity yet");
  document.getElementById("usage-action-bars").innerHTML = renderRankedBars(data.top_actions, "No meaningful actions yet");
  document.getElementById("usage-updated").textContent = `Updated ${formatUsageDate(data.generated_at)}`;

  renderInsights(data);
  renderAppComparison(data.apps);
  renderAppCards(data.apps);
  renderReports(data.saved_reports);
  renderSegmentedControl();

  dashboard.hidden = false;
  setUsageState("");
}

async function fetchUsage(path = "") {
  const code = window.sessionStorage.getItem(USAGE_CODE_KEY);
  if (!code) throw new Error("missing_code");
  const response = await fetch(`${USAGE_FUNCTION_URL}${path}`, {
    headers: {
      apikey: SUPABASE_PUBLISHABLE_KEY,
      "x-dashboard-code": code,
    },
  });
  if (!response.ok) {
    if (response.status === 401) {
      window.sessionStorage.removeItem(USAGE_CODE_KEY);
      throw new Error("That access code did not work.");
    }
    throw new Error("Could not load usage analytics.");
  }
  return response.json();
}

async function loadUsageDashboard() {
  const login = document.getElementById("usage-login");
  const dashboard = document.getElementById("usage-dashboard");
  const code = window.sessionStorage.getItem(USAGE_CODE_KEY);

  if (!code) {
    dashboard.hidden = true;
    login.hidden = false;
    setUsageState("");
    return;
  }

  login.hidden = true;
  dashboard.hidden = true;
  setUsageState("Loading usage...");

  try {
    renderUsageDashboard(await fetchUsage(`?range_days=${usageRangeDays}`));
  } catch (error) {
    document.getElementById("usage-login").hidden = false;
    setUsageState(error.message === "missing_code" ? "Enter the access code." : error.message, true);
  }
}

async function saveUsageReport() {
  if (!currentUsageData) return;
  setUsageState("Saving report...");
  const code = window.sessionStorage.getItem(USAGE_CODE_KEY);
  const title = `Usage report - ${usageRangeDays} days - ${new Date().toLocaleDateString()}`;
  const response = await fetch(`${USAGE_FUNCTION_URL}?range_days=${usageRangeDays}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SUPABASE_PUBLISHABLE_KEY,
      "x-dashboard-code": code,
    },
    body: JSON.stringify({ title }),
  });
  if (!response.ok) {
    setUsageState("Could not save report.", true);
    return;
  }
  await loadUsageDashboard();
}

async function loadSavedReport(reportId) {
  setUsageState("Loading saved report...");
  const data = await fetchUsage(`?report_id=${encodeURIComponent(reportId)}`);
  if (!data.saved_report) {
    setUsageState("Saved report not found.", true);
    return;
  }
  renderUsageDashboard({
    ...data.saved_report.report,
    saved_reports: currentUsageData?.saved_reports || [],
    generated_at: data.saved_report.created_at,
  });
  document.getElementById("usage-updated").textContent = `Viewing saved report from ${formatUsageDate(data.saved_report.created_at)}`;
}

document.getElementById("usage-login-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = new FormData(event.target);
  const code = String(form.get("code") || "").trim();
  if (!code) {
    setUsageState("Enter the access code.", true);
    return;
  }
  window.sessionStorage.setItem(USAGE_CODE_KEY, code);
  await loadUsageDashboard();
});

document.getElementById("usage-range").addEventListener("click", (event) => {
  const button = event.target.closest("[data-range-days]");
  if (!button) return;
  usageRangeDays = Number(button.dataset.rangeDays);
  loadUsageDashboard();
});

document.getElementById("usage-refresh").addEventListener("click", () => {
  loadUsageDashboard();
});

document.getElementById("usage-save-report").addEventListener("click", () => {
  saveUsageReport();
});

document.getElementById("usage-report-list").addEventListener("click", (event) => {
  const button = event.target.closest("[data-report-id]");
  if (!button) return;
  loadSavedReport(button.dataset.reportId);
});

document.getElementById("today").textContent = new Date().toLocaleDateString(undefined, {
  weekday: "long",
  month: "long",
  day: "numeric",
});

renderSegmentedControl();
loadUsageDashboard();
