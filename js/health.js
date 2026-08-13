function escapeHtml(value) {
  if (value == null) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const OPEN_STATUSES = new Set(["new", "investigating", "fix_in_progress"]);

const SEVERITY_LABELS = { critical: "Critical", needs_attention: "Needs Attention", healthy: "Healthy", unknown: "Unknown" };
const STATUS_LABELS = { new: "New", investigating: "Investigating", fix_in_progress: "Fix In Progress", resolved: "Resolved" };
const CATEGORY_LABELS = {
  deployment: "Deployment",
  database: "Database",
  auth: "Auth",
  configuration: "Configuration",
  workflow: "Workflow",
  security: "Security",
  stale: "Stale",
  other: "Other",
};

let state = { projects: [], reports: [], findings: [] };

function severityLabel(value) {
  return SEVERITY_LABELS[value] || value;
}

function statusLabel(value) {
  return STATUS_LABELS[value] || value;
}

function categoryLabel(value) {
  return CATEGORY_LABELS[value] || value || "General";
}

function formatDate(value) {
  return value ? new Date(value).toLocaleDateString() : "—";
}

function formatDateTime(value) {
  return value ? new Date(value).toLocaleString() : "—";
}

// --- Data ---

async function fetchHealthData() {
  const [{ data: projects, error: projectsError }, { data: reports, error: reportsError }, { data: findings, error: findingsError }] =
    await Promise.all([
      supabaseClient.from("projects").select("id, name, status").order("name"),
      supabaseClient.from("technical_health_reports").select("*").order("checked_at", { ascending: false }).limit(52),
      supabaseClient.from("technical_health_findings").select("*").order("detected_at", { ascending: false }),
    ]);

  if (projectsError) throw projectsError;
  if (reportsError) throw reportsError;
  if (findingsError) throw findingsError;

  state = { projects: projects || [], reports: reports || [], findings: findings || [] };
}

function findingsForReport(reportId) {
  return state.findings.filter((f) => f.report_id === reportId);
}

function projectSeverity(projectId) {
  const openFindings = state.findings.filter((f) => f.project_id === projectId && OPEN_STATUSES.has(f.status));
  if (openFindings.some((f) => f.severity === "critical")) return "critical";
  if (openFindings.some((f) => f.severity === "needs_attention")) return "needs_attention";
  return state.reports.length ? "healthy" : "unknown";
}

// --- Render: whole page ---

async function renderHealthPage() {
  await fetchHealthData();

  const open = state.findings.filter((f) => OPEN_STATUSES.has(f.status));

  document.getElementById("critical-count").textContent = open.filter((f) => f.severity === "critical").length;
  document.getElementById("attention-count").textContent = open.filter((f) => f.severity === "needs_attention").length;
  document.getElementById("open-count").textContent = open.length;
  document.getElementById("healthy-count").textContent = state.projects.filter((p) => projectSeverity(p.id) === "healthy").length;
  document.getElementById("last-check").textContent = state.reports[0] ? `Last check ${formatDate(state.reports[0].checked_at)}` : "No health check recorded yet";

  renderAttentionList(open);
  renderProjectHealthGrid(open);
  renderReportArchive();
}

function renderAttentionList(open) {
  const attention = open
    .filter((f) => f.severity === "critical" || f.severity === "needs_attention")
    .sort((a, b) => (a.severity === "critical" ? 0 : 1) - (b.severity === "critical" ? 0 : 1));

  document.getElementById("attention-list").innerHTML = attention.length
    ? attention
        .map(
          (f) => `
      <button type="button" class="attention-card ${escapeHtml(f.severity)}" data-open-finding="${f.id}">
        <span class="severity-dot"></span>
        <span>
          <span class="status-pill ${escapeHtml(f.severity)}">${escapeHtml(severityLabel(f.severity))}</span>
          <p><strong>${escapeHtml(f.title)}</strong></p>
          <small>${escapeHtml(f.project_name || "Unassigned")} · ${escapeHtml(categoryLabel(f.category))}</small>
        </span>
        <span>${escapeHtml(f.recommended_action || "Review")}</span>
      </button>
    `
        )
        .join("")
    : `<div class="empty-state">Nothing needs immediate attention right now.</div>`;
}

function renderProjectHealthGrid(open) {
  document.getElementById("project-health-grid").innerHTML = state.projects
    .map((p) => {
      const severity = projectSeverity(p.id);
      const openForProject = open.filter((f) => f.project_id === p.id);
      return `
      <article class="project-health-card">
        <h4>${escapeHtml(p.name)}</h4>
        <span class="status-pill ${severity}">${escapeHtml(severityLabel(severity))}</span>
        <p>${openForProject.length} open finding${openForProject.length === 1 ? "" : "s"}</p>
      </article>
    `;
    })
    .join("");
}

function renderReportArchive() {
  document.getElementById("report-archive").innerHTML = state.reports.length
    ? state.reports
        .map(
          (r) => `
      <button type="button" class="report-row" data-open-report="${r.id}">
        <strong>${formatDate(r.checked_at)}</strong>
        <span class="status-pill ${escapeHtml(r.overall_status || "unknown")}">${escapeHtml(severityLabel(r.overall_status || "unknown"))}</span>
        <span>${escapeHtml(r.summary || "Weekly technical health check")}</span>
        <span>${Number(r.projects_checked || 0)} projects</span>
      </button>
    `
        )
        .join("")
    : `<div class="empty-state">Weekly reports will appear here after the first saved health check.</div>`;
}

// --- Finding detail dialog ---

function openFindingDialog(finding) {
  renderFindingDialog(finding);
  document.getElementById("finding-dialog").showModal();
}

function renderFindingDialog(finding) {
  const container = document.getElementById("finding-dialog-content");
  const sourceRefs = Array.isArray(finding.source_refs) ? finding.source_refs : [];

  container.innerHTML = `
    <h2>${escapeHtml(finding.title)}</h2>
    <p class="lead-detail-contact">${escapeHtml(finding.project_name || "Unassigned")} · ${escapeHtml(categoryLabel(finding.category))} · detected ${formatDate(finding.detected_at)}</p>

    <div class="card-meta-row"><span>Severity</span><span class="status-pill ${escapeHtml(finding.severity)}">${escapeHtml(severityLabel(finding.severity))}</span></div>
    <div class="card-meta-row"><span>Status</span><span class="status-pill ${escapeHtml(finding.status)}">${escapeHtml(statusLabel(finding.status))}</span></div>
    ${finding.resolved_at ? `<div class="card-meta-row"><span>Resolved</span><span>${formatDate(finding.resolved_at)}</span></div>` : ""}

    ${finding.details ? `<h3>Details</h3><p>${escapeHtml(finding.details)}</p>` : ""}
    ${finding.likely_cause ? `<h3>Likely cause</h3><p>${escapeHtml(finding.likely_cause)}</p>` : ""}
    ${finding.recommended_action ? `<h3>Recommended action</h3><p>${escapeHtml(finding.recommended_action)}</p>` : ""}
    ${
      sourceRefs.length
        ? `<h3>Sources</h3><ul class="health-finding-list">${sourceRefs.map((ref) => `<li>${escapeHtml(typeof ref === "string" ? ref : JSON.stringify(ref))}</li>`).join("")}</ul>`
        : ""
    }

    <form id="finding-status-form" class="dialog-form" data-finding-id="${finding.id}">
      <label>Update status
        <select name="status">
          ${Object.keys(STATUS_LABELS)
            .map((value) => `<option value="${value}" ${finding.status === value ? "selected" : ""}>${STATUS_LABELS[value]}</option>`)
            .join("")}
        </select>
      </label>
      <div class="dialog-actions">
        <button type="button" class="btn btn-secondary" data-close-dialog>Close</button>
        <button type="submit" class="btn btn-primary">Save status</button>
      </div>
    </form>
  `;
}

async function updateFindingStatus(findingId, status) {
  const { error } = await supabaseClient
    .from("technical_health_findings")
    .update({ status, resolved_at: status === "resolved" ? new Date().toISOString() : null })
    .eq("id", findingId);
  if (error) throw error;
}

// --- Report detail dialog ---

function openReportDialog(report) {
  renderReportDialog(report);
  document.getElementById("report-dialog").showModal();
}

function renderReportDialog(report) {
  const container = document.getElementById("report-dialog-content");
  const findings = findingsForReport(report.id);
  const sourcesChecked = Array.isArray(report.sources_checked) ? report.sources_checked : [];

  container.innerHTML = `
    <h2>Health check — ${formatDateTime(report.checked_at)}</h2>
    <p class="lead-detail-contact">${escapeHtml(report.summary || "Weekly technical health check")}</p>

    <div class="card-meta-row"><span>Overall status</span><span class="status-pill ${escapeHtml(report.overall_status || "unknown")}">${escapeHtml(severityLabel(report.overall_status || "unknown"))}</span></div>
    <div class="card-meta-row"><span>Projects checked</span><span>${Number(report.projects_checked || 0)}</span></div>
    <div class="card-meta-row"><span>Sources checked</span><span>${sourcesChecked.length ? escapeHtml(sourcesChecked.join(", ")) : "—"}</span></div>

    <h3>Findings in this report</h3>
    ${
      findings.length
        ? `<ul class="health-finding-list">
        ${findings
          .map(
            (f) => `
          <li>
            <button type="button" class="attention-card ${escapeHtml(f.severity)}" data-open-finding="${f.id}">
              <span class="severity-dot"></span>
              <span>
                <span class="status-pill ${escapeHtml(f.severity)}">${escapeHtml(severityLabel(f.severity))}</span>
                <p><strong>${escapeHtml(f.title)}</strong></p>
                <small>${escapeHtml(f.project_name || "Unassigned")} · ${escapeHtml(categoryLabel(f.category))}</small>
              </span>
              <span class="status-pill ${escapeHtml(f.status)}">${escapeHtml(statusLabel(f.status))}</span>
            </button>
          </li>
        `
          )
          .join("")}
      </ul>`
        : `<div class="empty-state">No findings recorded on this report.</div>`
    }

    <div class="dialog-actions">
      <button type="button" class="btn btn-secondary" data-close-dialog>Close</button>
    </div>
  `;
}

// --- Event delegation: open dialogs, close dialogs, save status ---

document.addEventListener("click", (event) => {
  const closeBtn = event.target.closest("[data-close-dialog]");
  if (closeBtn) closeBtn.closest("dialog").close();

  const findingBtn = event.target.closest("[data-open-finding]");
  if (findingBtn) {
    const finding = state.findings.find((f) => f.id === findingBtn.dataset.openFinding);
    if (finding) openFindingDialog(finding);
  }

  const reportBtn = event.target.closest("[data-open-report]");
  if (reportBtn) {
    const report = state.reports.find((r) => r.id === reportBtn.dataset.openReport);
    if (report) openReportDialog(report);
  }
});

document.addEventListener("submit", async (event) => {
  const form = event.target.closest("#finding-status-form");
  if (!form) return;
  event.preventDefault();

  const findingId = form.dataset.findingId;
  const status = new FormData(form).get("status");
  const submitBtn = form.querySelector('button[type="submit"]');
  submitBtn.disabled = true;

  try {
    await updateFindingStatus(findingId, status);
    await renderHealthPage();
    document.getElementById("finding-dialog").close();
  } catch (error) {
    alert(`Couldn't update finding status: ${error.message}`);
  } finally {
    submitBtn.disabled = false;
  }
});

// --- Auth gate: this whole page depends on technical_health_reports/findings,
// which are RLS-restricted to authenticated sessions (see supabase/technical_health.sql). ---

let healthAuthResolved = false;

// Reloading on a later change keeps this simple, same as the Impact page —
// only fires if the session changes while already sitting on this page.
function onAuthChanged() {
  if (healthAuthResolved) window.location.reload();
}

getAuthSession().then((session) => {
  healthAuthResolved = true;
  if (session) {
    renderHealthPage().catch((error) => {
      console.error("Failed to load health data:", error);
      document.getElementById("health-main").innerHTML = `<p style="color: var(--color-danger);">Couldn't load technical health data. Check the console for details.</p>`;
    });
  } else {
    renderSignInPrompt(document.getElementById("health-main"), "Sign in to view Technical Health data.");
  }
});
