function escapeHtml(value) {
  if (value == null) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function getWeekStart(date = new Date()) {
  const d = new Date(date);
  const day = d.getDay(); // 0 = Sunday
  const diffToMonday = (day === 0 ? -6 : 1) - day;
  d.setDate(d.getDate() + diffToMonday);
  d.setHours(0, 0, 0, 0);
  return d;
}

function toISODate(date) {
  return date.toISOString().slice(0, 10);
}

async function fetchProjects() {
  const { data, error } = await supabaseClient
    .from("projects")
    .select(
      "id, name, status, next_milestone, next_milestone_date, links, memory_problem_solved, memory_capabilities, memory_industries, memory_patterns, memory_time_note, memory_lessons"
    )
    .order("name");
  if (error) throw error;
  return data;
}

async function fetchOpenTaskCounts() {
  const { data, error } = await supabaseClient.from("tasks").select("project_id").neq("status", "done");
  if (error) throw error;

  const counts = {};
  for (const task of data) {
    counts[task.project_id] = (counts[task.project_id] || 0) + 1;
  }
  return counts;
}

async function fetchHoursThisWeek() {
  const weekStart = toISODate(getWeekStart());
  const { data, error } = await supabaseClient
    .from("time_entries")
    .select("project_id, hours")
    .gte("entry_date", weekStart);
  if (error) throw error;

  const totals = {};
  for (const entry of data) {
    totals[entry.project_id] = (totals[entry.project_id] || 0) + Number(entry.hours);
  }
  return totals;
}

async function fetchPayments() {
  const { data, error } = await supabaseClient.from("payments").select("id, project_id, amount, due_date, paid_date, note");
  if (error) throw error;
  return data || [];
}

async function fetchRecentTimeEntries(limit) {
  const { data, error } = await supabaseClient
    .from("time_entries")
    .select("project_id, entry_date, hours, note, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data || [];
}

// Impact data is RLS-restricted to authenticated sessions — only fetch it if
// signed in, and tell callers apart from "signed in but no data yet" so the
// UI can show "Sign in to view impact data" instead of an empty state.
async function fetchImpactDataIfAuthed(session) {
  if (!session) return null;
  const [{ data: workflows, error: workflowsError }, { data: measurements, error: measurementsError }] = await Promise.all([
    supabaseClient.from("impact_workflows").select("*").eq("is_active", true),
    supabaseClient.from("impact_measurements").select("*").order("measured_at"),
  ]);
  if (workflowsError) throw workflowsError;
  if (measurementsError) throw measurementsError;

  const measurementsByWorkflowId = {};
  for (const m of measurements || []) {
    (measurementsByWorkflowId[m.workflow_id] = measurementsByWorkflowId[m.workflow_id] || []).push(m);
  }
  return { workflows: workflows || [], measurementsByWorkflowId };
}

function formatMilestone(project) {
  if (!project.next_milestone) return "—";
  if (!project.next_milestone_date) return project.next_milestone;
  const date = new Date(`${project.next_milestone_date}T00:00:00`);
  const formatted = date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return `${project.next_milestone} — ${formatted}`;
}

// impactData is: undefined while signed-out, or { hasWorkflows, totalHours,
// dominantEvidence, freshness } once signed in (freshness/totalHours may
// still be null — e.g. workflows exist but none have a baseline yet).
function renderCardImpactRow(impactData) {
  if (impactData === undefined) {
    return `<div class="card-meta-row"><span>Impact</span><span class="card-impact-signin"><a href="pages/signin.html?next=%2Findex.html">Sign in to view</a></span></div>`;
  }
  if (!impactData.hasWorkflows || impactData.totalHours == null) {
    return `<div class="card-meta-row"><span>Impact</span><span class="impact-status-needed">Impact baseline needed</span></div>`;
  }
  return `
    <div class="card-meta-row"><span>Impact</span><span>${formatImpactHours(impactData.totalHours)}</span></div>
    <div class="card-meta-row card-meta-row-badges">
      ${evidenceBadgeSmall(impactData.dominantEvidence)}
      ${freshnessBadgeSmall(impactData.freshness)}
    </div>
  `;
}

function evidenceBadgeSmall(level) {
  if (!level) return "";
  return `<span class="evidence-badge evidence-badge-${level}">${EVIDENCE_LABELS[level] || level}</span>`;
}

function freshnessBadgeSmall(status) {
  if (!status) return "";
  return `<span class="freshness-badge freshness-${status}">${FRESHNESS_LABELS[status]}</span>`;
}

function renderProjectCard(project, hoursThisWeek, openTasks, impactData) {
  const badgeClass = project.status === "active" ? "badge-active" : "badge-progress";
  const card = document.createElement("button");
  card.type = "button";
  card.className = "card project-card";
  card.innerHTML = `
    <span class="badge ${badgeClass}">${escapeHtml(project.status.replace("_", " "))}</span>
    <h2>${escapeHtml(project.name)}</h2>
    <div class="card-meta">
      <div class="card-meta-row"><span>Next</span><span>${escapeHtml(formatMilestone(project))}</span></div>
      <div class="card-meta-row"><span>Hours this week</span><span>${hoursThisWeek}</span></div>
      <div class="card-meta-row"><span>Open tasks</span><span>${openTasks}</span></div>
      <div class="card-meta-row"><span>Technical health</span><span class="impact-status-unknown" title="Not tracked yet in this repo">Not tracked yet</span></div>
      ${renderCardImpactRow(impactData)}
    </div>
    <div id="languages-${project.id}"></div>
  `;
  card.addEventListener("click", () => openProjectDetail(project));
  return card;
}

// Rolls a project's active workflows up into one summary for the card.
function computeProjectImpactSummary(projectId, workflows) {
  const projectWorkflows = workflows.filter((w) => w.project_id === projectId);
  if (projectWorkflows.length === 0) return { hasWorkflows: false, totalHours: null, dominantEvidence: null, freshness: null };

  let totalHours = 0;
  let anyComputed = false;
  const evidenceHours = { estimated: 0, client_confirmed: 0, measured: 0 };
  let worstFreshness = "fresh";
  const freshnessOrder = ["fresh", "review_soon", "stale", "baseline_needed"];

  for (const workflow of projectWorkflows) {
    const impact = computeWorkflowImpact(workflow);
    if (impact.annualHoursSaved != null) {
      totalHours += impact.annualHoursSaved;
      evidenceHours[workflow.evidence_level] += impact.annualHoursSaved;
      anyComputed = true;
    }
    const freshness = impactFreshnessStatus(workflow.last_measured_at);
    if (freshnessOrder.indexOf(freshness) > freshnessOrder.indexOf(worstFreshness)) worstFreshness = freshness;
  }

  const dominantEvidence = anyComputed
    ? Object.entries(evidenceHours).sort((a, b) => b[1] - a[1])[0][0]
    : null;

  return {
    hasWorkflows: true,
    totalHours: anyComputed ? totalHours : null,
    dominantEvidence,
    freshness: worstFreshness,
  };
}

async function loadLanguagesForCard(repoUrl, projectId) {
  const container = document.getElementById(`languages-${projectId}`);
  if (!container) return;

  const parsed = parseGithubRepo(repoUrl);
  if (!parsed) return;

  try {
    const info = await fetchRepoInfo(parsed.owner, parsed.repo);
    if (info.notFound || Object.keys(info.languages).length === 0) return;

    const bar = renderLanguageBar(info.languages);
    container.innerHTML = `<div style="margin-top: var(--space-4); font-size: var(--font-size-xs);">${bar}</div>`;
  } catch (error) {
    // Silently fail if we can't fetch repo info (rate limit, private repo, etc)
  }
}

function renderNewProjectCard() {
  const card = document.createElement("button");
  card.type = "button";
  card.className = "card project-card new-project-card";
  card.innerHTML = `
    <div style="display: flex; align-items: center; justify-content: center; height: 100%; flex-direction: column; gap: var(--space-3); color: var(--color-text-muted);">
      <span style="font-size: var(--font-size-xl); line-height: 1;">+</span>
      <span style="font-size: var(--font-size-sm);">New Project</span>
    </div>
  `;
  card.addEventListener("click", () => openProjectForm(null));
  return card;
}

async function renderDashboard() {
  const grid = document.getElementById("project-grid");
  const session = await getAuthSession();
  const [projects, hoursByProject, openTasksByProject, payments, recentTimeEntries, impactData] = await Promise.all([
    fetchProjects(),
    fetchHoursThisWeek(),
    fetchOpenTaskCounts(),
    fetchPayments(),
    fetchRecentTimeEntries(6),
    fetchImpactDataIfAuthed(session),
  ]);

  const workflows = impactData ? impactData.workflows : undefined;

  const cards = [
    renderNewProjectCard(),
    ...projects.map((project) =>
      renderProjectCard(
        project,
        hoursByProject[project.id] || 0,
        openTasksByProject[project.id] || 0,
        workflows === undefined ? undefined : computeProjectImpactSummary(project.id, workflows)
      )
    ),
  ];

  grid.replaceChildren(...cards);

  // Load languages for all projects after they're added to the DOM
  projects.forEach((project) => {
    const repoUrl = (project.links && project.links.github) || "";
    if (repoUrl) {
      loadLanguagesForCard(repoUrl, project.id);
    }
  });

  const dateEl = document.getElementById("today");
  dateEl.textContent = new Date().toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  const portfolioAgg = workflows ? aggregatePortfolioImpact(workflows) : null;
  const attentionItems = computeAttentionItems(projects, payments, workflows);

  renderExecutiveKpiRow(projects, openTasksByProject, payments, portfolioAgg, attentionItems);
  renderAttentionRequired(attentionItems);
  renderDashboardCharts(projects, workflows, impactData ? impactData.measurementsByWorkflowId : undefined, portfolioAgg);
  renderOperatingPulse(projects, hoursByProject, payments, recentTimeEntries, workflows);
}

// --- Attention Required ---
// Sourced from what actually has a data model in this repo today: overdue
// milestones, overdue/unpaid payments, and impact baseline/staleness. There's
// no Technical Health data model in this repo yet, so "critical" and
// "needs_attention" tiers are always empty here — this is the seam where
// technical findings would plug in once that exists.
function computeAttentionItems(projects, payments, workflows) {
  const items = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (const project of projects) {
    if (project.next_milestone_date && project.status !== "done" && project.status !== "completed") {
      const dueDate = new Date(`${project.next_milestone_date}T00:00:00`);
      if (dueDate < today) {
        items.push({
          tier: "overdue",
          text: `${project.name}: "${project.next_milestone}" was due ${dueDate.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`,
          projectId: project.id,
        });
      }
    }
  }

  for (const payment of payments) {
    if (payment.due_date && !payment.paid_date) {
      const dueDate = new Date(`${payment.due_date}T00:00:00`);
      if (dueDate < today) {
        const project = projects.find((p) => p.id === payment.project_id);
        items.push({
          tier: "overdue",
          text: `Payment overdue${project ? ` — ${project.name}` : ""}: $${Number(payment.amount).toLocaleString()} was due ${dueDate.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`,
          href: "pages/finance.html",
          projectId: payment.project_id,
        });
      }
    }
  }

  if (workflows) {
    for (const workflow of workflows) {
      const impact = computeWorkflowImpact(workflow);
      const project = projects.find((p) => p.id === workflow.project_id);
      const projectName = project ? project.name : "Unknown project";
      if (!impact.hasBaseline || !impact.hasCurrent) {
        items.push({
          tier: "data_needed",
          text: `${projectName}: "${workflow.workflow_name}" needs a baseline measurement`,
          href: "pages/impact.html",
          projectId: workflow.project_id,
        });
      } else {
        const freshness = impactFreshnessStatus(workflow.last_measured_at);
        if (freshness === "stale") {
          items.push({
            tier: "data_needed",
            text: `${projectName}: "${workflow.workflow_name}" hasn't been re-measured in over 120 days`,
            href: "pages/impact.html",
            projectId: workflow.project_id,
          });
        }
      }
    }
  }

  const tierOrder = { critical: 0, needs_attention: 1, overdue: 2, data_needed: 3 };
  items.sort((a, b) => tierOrder[a.tier] - tierOrder[b.tier]);
  return items;
}

const ATTENTION_TIER_LABELS = {
  critical: "Critical",
  needs_attention: "Needs Attention",
  overdue: "Overdue",
  data_needed: "Data Needed",
};

function renderAttentionRequired(items) {
  const container = document.getElementById("attention-required-list");
  if (items.length === 0) {
    container.innerHTML = `<p class="attention-empty">Nothing needs attention right now.</p>`;
    return;
  }
  container.innerHTML = items
    .map(
      (item) => `
    <div class="attention-item attention-item-${item.tier}">
      <span class="attention-tier-badge attention-tier-${item.tier}">${ATTENTION_TIER_LABELS[item.tier]}</span>
      <span class="attention-text">${escapeHtml(item.text)}</span>
      ${item.href ? `<a class="attention-link" href="${item.href}">View →</a>` : ""}
    </div>
  `
    )
    .join("");
}

// --- Executive KPI row ---

function renderExecutiveKpiRow(projects, openTasksByProject, payments, portfolioAgg, attentionItems) {
  const activeProjects = projects.filter((p) => p.status === "active" || p.status === "in_progress").length;
  const projectsNeedingAttention = new Set(attentionItems.map((i) => i.projectId).filter(Boolean)).size;
  const openTasks = Object.values(openTasksByProject).reduce((sum, n) => sum + n, 0);

  const now = new Date();
  const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const revenueThisMonth = payments
    .filter((p) => p.paid_date && p.paid_date.slice(0, 7) === monthKey)
    .reduce((sum, p) => sum + Number(p.amount), 0);

  const tiles = [
    { label: "Active Projects", value: activeProjects, href: "#portfolio-section" },
    { label: "Projects Needing Attention", value: projectsNeedingAttention, href: "#attention-section", warn: projectsNeedingAttention > 0 },
    { label: "Critical Technical Issues", value: "—", note: "Health not tracked yet in this repo" },
    { label: "Open Tasks", value: openTasks, href: "pages/tasks.html" },
    { label: "Revenue This Month", value: `$${Math.round(revenueThisMonth).toLocaleString()}`, href: "pages/finance.html" },
    {
      label: "Client Hours Saved / Year",
      value: portfolioAgg ? formatImpactHours(portfolioAgg.totalIdentifiedHours) : "Sign in to view",
      href: "pages/impact.html",
    },
    {
      label: "Workdays Recovered / Year",
      value: portfolioAgg ? `${Math.round(portfolioAgg.workdaysRecovered).toLocaleString()} days` : "Sign in to view",
      href: "pages/impact.html",
    },
  ];

  document.getElementById("executive-kpi-row").innerHTML = tiles
    .map((t) => {
      const inner = `
        <span class="kpi-tile-value">${t.value}</span>
        <span class="kpi-tile-label">${t.label}</span>
        ${t.note ? `<span class="kpi-tile-note">${t.note}</span>` : ""}
      `;
      const cls = `kpi-tile ${t.warn ? "kpi-tile-warn" : ""} ${t.href ? "kpi-tile-link" : ""}`;
      return t.href ? `<a class="${cls}" href="${t.href}">${inner}</a>` : `<div class="${cls}">${inner}</div>`;
    })
    .join("");
}

// --- Client Impact Summary charts (compact versions of the Impact page's) ---

function renderDashboardCharts(projects, workflows, measurementsByWorkflowId, portfolioAgg) {
  const hoursEl = document.getElementById("dash-hours-chart");
  const trendEl = document.getElementById("dash-trend-chart");
  const healthEl = document.getElementById("dash-health-chart");

  if (!workflows) {
    renderSignInPrompt(hoursEl, "Sign in to see hours saved by project.");
    renderSignInPrompt(trendEl, "Sign in to see the impact trend.");
  } else {
    const byProject = {};
    for (const workflow of workflows) {
      const impact = computeWorkflowImpact(workflow);
      if (impact.annualHoursSaved == null) continue;
      byProject[workflow.project_id] = (byProject[workflow.project_id] || 0) + impact.annualHoursSaved;
    }
    const rows = Object.entries(byProject)
      .map(([projectId, hours]) => ({ label: (projects.find((p) => p.id === projectId) || {}).name || "Unknown", hours }))
      .sort((a, b) => b.hours - a.hours)
      .slice(0, 5);
    renderHoursBarChart(hoursEl, rows);
    renderTrendLineChart(trendEl, buildImpactTrend(workflows, measurementsByWorkflowId));
  }

  renderHealthDistributionChart(healthEl, computeHealthDistribution(projects, workflows));
}

// Buckets projects using what data actually exists in this repo: an overdue
// milestone or stale/missing impact data means "Needs Attention"; no signal
// at all means "Unknown"; anything else is "Healthy". "Critical" always
// stays 0 until there's a real Technical Health data source.
function computeHealthDistribution(projects, workflows) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const buckets = { healthy: 0, needsAttention: 0, critical: 0, unknown: 0 };

  for (const project of projects) {
    const hasMilestoneSignal = !!project.next_milestone_date;
    const projectWorkflows = workflows ? workflows.filter((w) => w.project_id === project.id) : [];
    const hasImpactSignal = projectWorkflows.length > 0;

    const milestoneOverdue = hasMilestoneSignal && new Date(`${project.next_milestone_date}T00:00:00`) < today;
    const impactIssue = projectWorkflows.some((w) => {
      const impact = computeWorkflowImpact(w);
      if (!impact.hasBaseline || !impact.hasCurrent) return true;
      return impactFreshnessStatus(w.last_measured_at) === "stale";
    });

    if (milestoneOverdue || impactIssue) {
      buckets.needsAttention++;
    } else if (hasMilestoneSignal || hasImpactSignal) {
      buckets.healthy++;
    } else {
      buckets.unknown++;
    }
  }
  return buckets;
}

// --- Operating Pulse ---

function renderOperatingPulse(projects, hoursByProject, payments, recentTimeEntries, workflows) {
  renderPulseMilestones(projects);
  renderPulseWorkload(projects, hoursByProject);
  renderPulseActivity(projects, recentTimeEntries);
  renderPulseFinancial(payments);
  renderPulseMeasurementsDue(projects, workflows);
}

function renderPulseMilestones(projects) {
  const el = document.getElementById("pulse-milestones");
  const upcoming = projects
    .filter((p) => p.next_milestone_date && p.status !== "done" && p.status !== "completed")
    .sort((a, b) => new Date(a.next_milestone_date) - new Date(b.next_milestone_date))
    .slice(0, 5);
  if (upcoming.length === 0) {
    el.innerHTML = `<p class="lead-detail-contact">No upcoming milestones set.</p>`;
    return;
  }
  el.innerHTML = upcoming
    .map((p) => `<div class="pulse-row"><span>${escapeHtml(p.name)} — ${escapeHtml(p.next_milestone || "")}</span><span class="lead-detail-contact">${new Date(`${p.next_milestone_date}T00:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span></div>`)
    .join("");
}

function renderPulseWorkload(projects, hoursByProject) {
  const el = document.getElementById("pulse-workload");
  const rows = Object.entries(hoursByProject)
    .map(([projectId, hours]) => ({ name: (projects.find((p) => p.id === projectId) || {}).name || "Unknown", hours }))
    .sort((a, b) => b.hours - a.hours);
  if (rows.length === 0) {
    el.innerHTML = `<p class="lead-detail-contact">No hours logged this week yet.</p>`;
    return;
  }
  el.innerHTML = rows.map((r) => `<div class="pulse-row"><span>${escapeHtml(r.name)}</span><span>${r.hours}h</span></div>`).join("");
}

function renderPulseActivity(projects, recentTimeEntries) {
  const el = document.getElementById("pulse-activity");
  if (recentTimeEntries.length === 0) {
    el.innerHTML = `<p class="lead-detail-contact">No recent activity.</p>`;
    return;
  }
  el.innerHTML = recentTimeEntries
    .map((entry) => {
      const project = projects.find((p) => p.id === entry.project_id);
      return `<div class="pulse-row"><span>${escapeHtml(project ? project.name : "Unknown")} — ${entry.hours}h${entry.note ? `: ${escapeHtml(entry.note)}` : ""}</span><span class="lead-detail-contact">${new Date(entry.entry_date).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span></div>`;
    })
    .join("");
}

function renderPulseFinancial(payments) {
  const el = document.getElementById("pulse-financial");
  const now = new Date();
  const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const received = payments.filter((p) => p.paid_date && p.paid_date.slice(0, 7) === monthKey).reduce((s, p) => s + Number(p.amount), 0);
  const expected = payments.filter((p) => !p.paid_date).reduce((s, p) => s + Number(p.amount), 0);
  el.innerHTML = `
    <div class="pulse-row"><span>Received this month</span><span>$${Math.round(received).toLocaleString()}</span></div>
    <div class="pulse-row"><span>Expected (unpaid)</span><span>$${Math.round(expected).toLocaleString()}</span></div>
  `;
}

function renderPulseMeasurementsDue(projects, workflows) {
  const el = document.getElementById("pulse-measurements-due");
  if (workflows === undefined) {
    renderSignInPrompt(el, "Sign in to see measurements due for review.");
    return;
  }
  const due = workflows.filter((w) => {
    const status = impactFreshnessStatus(w.last_measured_at);
    return status === "stale" || status === "review_soon" || status === "baseline_needed";
  });
  if (due.length === 0) {
    el.innerHTML = `<p class="lead-detail-contact">All impact measurements are current.</p>`;
    return;
  }
  el.innerHTML = due
    .slice(0, 6)
    .map((w) => {
      const project = projects.find((p) => p.id === w.project_id);
      return `<div class="pulse-row"><span>${escapeHtml(project ? project.name : "Unknown")} — ${escapeHtml(w.workflow_name)}</span>${freshnessBadgeSmall(impactFreshnessStatus(w.last_measured_at))}</div>`;
    })
    .join("");
}

// --- Project form dialog: create/edit project details ---

const projectFormDialog = document.getElementById("project-form-dialog");

async function openProjectForm(project) {
  await renderProjectForm(project);
  projectFormDialog.showModal();
}

async function renderProjectForm(project) {
  const isNew = !project;
  const container = document.getElementById("project-form-content");
  const title = isNew ? "New Project" : `Edit ${escapeHtml(project.name)}`;
  const name = project?.name || "";
  const status = project?.status || "active";
  const nextMilestone = project?.next_milestone || "";
  const nextMilestoneDate = project?.next_milestone_date || "";

  container.innerHTML = `
    <h2>${escapeHtml(title)}</h2>
    <form id="project-form" class="dialog-form">
      <label>Project name
        <input type="text" name="name" value="${escapeHtml(name)}" placeholder="e.g., Camarim Mineiro" required />
      </label>
      <label>Status
        <select name="status" required>
          <option value="active" ${status === "active" ? "selected" : ""}>Active</option>
          <option value="in_progress" ${status === "in_progress" ? "selected" : ""}>In Progress</option>
          <option value="paused" ${status === "paused" ? "selected" : ""}>Paused</option>
          <option value="completed" ${status === "completed" ? "selected" : ""}>Completed</option>
        </select>
      </label>
      <label>Next milestone
        <input type="text" name="nextMilestone" value="${escapeHtml(nextMilestone)}" placeholder="e.g., Website launch" />
      </label>
      <label>Milestone date
        <input type="date" name="nextMilestoneDate" value="${escapeHtml(nextMilestoneDate)}" />
      </label>
      <div class="dialog-actions">
        ${isNew ? "" : `<button type="button" class="btn btn-danger" id="delete-project">Delete</button>`}
        <button type="button" class="btn btn-secondary" data-close-dialog>Cancel</button>
        <button type="submit" class="btn btn-primary">${isNew ? "Create" : "Save"}</button>
      </div>
    </form>
  `;

  const form = document.getElementById("project-form");
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(form);
    const projectData = {
      name: formData.get("name").trim(),
      status: formData.get("status"),
      next_milestone: formData.get("nextMilestone").trim() || null,
      next_milestone_date: formData.get("nextMilestoneDate") || null,
    };

    try {
      if (isNew) {
        const { error } = await supabaseClient.from("projects").insert([projectData]);
        if (error) throw error;
        projectFormDialog.close();
        renderDashboard();
      } else {
        const { error } = await supabaseClient.from("projects").update(projectData).eq("id", project.id);
        if (error) throw error;
        projectFormDialog.close();
        renderDashboard();
      }
    } catch (error) {
      console.error("Failed to save project:", error);
      alert(`Couldn't save project: ${error.message}`);
    }
  });

  if (!isNew) {
    const deleteBtn = document.getElementById("delete-project");
    deleteBtn.addEventListener("click", async () => {
      if (confirm(`Delete "${escapeHtml(project.name)}"? This cannot be undone.`)) {
        try {
          const { error } = await supabaseClient.from("projects").delete().eq("id", project.id);
          if (error) throw error;
          projectFormDialog.close();
          renderDashboard();
        } catch (error) {
          console.error("Failed to delete project:", error);
          alert(`Couldn't delete project: ${error.message}`);
        }
      }
    });
  }
}

// --- Project detail dialog: GitHub repo link, description, language breakdown ---

const projectDetailDialog = document.getElementById("project-detail-dialog");

async function openProjectDetail(project) {
  await renderProjectDetail(project);
  projectDetailDialog.showModal();
}

async function fetchProjectQuestionnaires(projectId) {
  const { data, error } = await supabaseClient
    .from("project_questionnaires")
    .select("id, file_name, share_token, created_at")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

async function renderProjectDetail(project) {
  const container = document.getElementById("project-detail-content");
  const repoUrl = (project.links && project.links.github) || "";

  let questionnairesHtml = "";
  try {
    const questionnaires = await fetchProjectQuestionnaires(project.id);
    questionnairesHtml = `
      <h3>Client Questionnaires</h3>
      <p class="lead-detail-contact">Upload custom questionnaires for clients to complete.</p>
      <form id="questionnaire-upload-form" class="dialog-form">
        <label>Upload questionnaire file or folder
          <input type="file" name="questionnaireFile" accept=".html,.pdf,.docx,.zip" required />
          <small style="display: block; margin-top: var(--space-2); color: var(--color-text-muted);">
            Upload a single file (HTML, PDF, DOCX) or a ZIP archive containing a folder
          </small>
        </label>
        <button type="submit" class="btn btn-secondary">Upload</button>
      </form>
      ${questionnaires.length > 0 ? `
        <div id="questionnaires-list" class="questionnaires-list">
          ${questionnaires.map((q) => `
            <div class="questionnaire-item">
              <div class="questionnaire-info">
                <p class="questionnaire-name">${escapeHtml(q.file_name)}</p>
                <p class="lead-detail-contact">Uploaded ${new Date(q.created_at).toLocaleDateString()}</p>
              </div>
              <div class="questionnaire-actions">
                <button type="button" class="btn btn-link" data-copy-link="${q.share_token}">Copy link</button>
                <button type="button" class="btn btn-link btn-danger" data-delete-questionnaire="${q.id}">Delete</button>
              </div>
            </div>
          `).join("")}
        </div>
      ` : '<p class="lead-detail-contact">No questionnaires uploaded yet.</p>'}
    `;
  } catch (error) {
    console.error("Failed to fetch questionnaires:", error);
    questionnairesHtml = `<p style="color: var(--color-danger);">Couldn't load questionnaires.</p>`;
  }

  container.innerHTML = `
    <h2>${escapeHtml(project.name)}</h2>
    <p class="lead-detail-contact">${escapeHtml(formatMilestone(project))}</p>

    <form id="repo-link-form" class="dialog-form">
      <label>GitHub repo
        <input type="url" name="repoUrl" value="${escapeHtml(repoUrl)}" placeholder="https://github.com/owner/repo" />
      </label>
      <button type="submit" class="btn btn-secondary">Save repo link</button>
    </form>

    <div id="repo-info">
      ${repoUrl ? '<p class="lead-detail-contact">Loading repo info…</p>' : ""}
    </div>

    ${questionnairesHtml}

    <h3>Agency Memory</h3>
    <p class="lead-detail-contact">
      A few notes for future you — no scoring or retrieval yet, just don't let it go unrecorded.
    </p>
    <form id="memory-form" class="dialog-form">
      <label>What business problem was solved
        <textarea name="problemSolved">${escapeHtml(project.memory_problem_solved || "")}</textarea>
      </label>
      <label>What capabilities it required
        <textarea name="capabilities">${escapeHtml(project.memory_capabilities || "")}</textarea>
      </label>
      <label>What industries could reuse this
        <textarea name="industries">${escapeHtml(project.memory_industries || "")}</textarea>
      </label>
      <label>Patterns that showed up
        <textarea name="patterns">${escapeHtml(project.memory_patterns || "")}</textarea>
      </label>
      <label>How long it actually took
        <textarea name="timeNote">${escapeHtml(project.memory_time_note || "")}</textarea>
      </label>
      <label>What you'd do differently
        <textarea name="lessons">${escapeHtml(project.memory_lessons || "")}</textarea>
      </label>
      <button type="submit" class="btn btn-secondary">Save Agency Memory</button>
    </form>

    <div class="dialog-actions">
      <button type="button" class="btn btn-secondary" id="edit-project-btn">Edit</button>
      <button type="button" class="btn btn-secondary" data-close-dialog>Close</button>
    </div>
  `;

  document.getElementById("repo-link-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const newUrl = new FormData(event.target).get("repoUrl").trim();
    const updatedLinks = { ...(project.links || {}), github: newUrl || null };
    const { error } = await supabaseClient.from("projects").update({ links: updatedLinks }).eq("id", project.id);
    if (error) {
      alert(`Couldn't save repo link: ${error.message}`);
      return;
    }
    project.links = updatedLinks;
    renderProjectDetail(project);
  });

  const uploadForm = document.getElementById("questionnaire-upload-form");
  if (uploadForm) {
    uploadForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const fileInput = uploadForm.querySelector('input[name="questionnaireFile"]');
      const file = fileInput.files[0];
      if (!file) return;

      try {
        const btn = uploadForm.querySelector('button[type="submit"]');
        btn.disabled = true;
        btn.textContent = "Uploading…";

        console.log("Starting upload for project:", project.id, "file:", file.name);

        const randomBytes = crypto.getRandomValues(new Uint8Array(16));
        const token = Array.from(randomBytes).map(b => b.toString(16).padStart(2, '0')).join('');

        // For ZIP files, store the archive and mark as such
        const isZip = file.name.toLowerCase().endsWith('.zip');
        const displayName = isZip ? file.name.replace(/\.zip$/i, '') : file.name;
        const filePath = `${project.id}/${token}-${file.name}`;

        console.log("Uploading file to storage:", filePath);
        console.log("File details:", { name: file.name, size: file.size, type: file.type });

        const { error: uploadError, data: uploadData } = await supabaseClient.storage
          .from("questionnaires")
          .upload(filePath, file, {
            cacheControl: '3600',
            upsert: false
          });

        if (uploadError) {
          console.error("Storage upload error:", uploadError);
          throw uploadError;
        }

        console.log("File uploaded successfully:", uploadData);

        // Verify the file exists by trying to get its public URL
        const { data: publicUrlData } = supabaseClient.storage
          .from("questionnaires")
          .getPublicUrl(filePath);

        console.log("Public URL generated:", publicUrlData.publicUrl);

        console.log("File uploaded, saving to database");

        const insertData = {
          project_id: project.id,
          file_name: displayName,
          file_path: filePath,
          share_token: token,
        };

        // Only include metadata if it's a ZIP file
        if (isZip) {
          insertData.metadata = { is_zip: true };
        }

        const { error: dbError, data: insertedData } = await supabaseClient
          .from("project_questionnaires")
          .insert(insertData)
          .select();

        if (dbError) {
          console.error("Database insert error:", dbError);
          throw dbError;
        }

        console.log("Questionnaire saved:", insertedData);

        // Clear the file input
        fileInput.value = "";

        // Re-fetch and re-render to show the new questionnaire
        console.log("Re-rendering project detail");
        await renderProjectDetail(project);

        btn.disabled = false;
        btn.textContent = "Upload";
      } catch (error) {
        console.error("Upload failed:", error);
        let message = error.message;
        if (message.includes("Bucket not found")) {
          message = "Storage bucket is initializing. Please try again in a moment.";
          // Try to initialize the bucket
          await initializeQuestionnairesBucket();
        }
        alert(`Couldn't upload questionnaire: ${message}`);
        const btn = uploadForm.querySelector('button[type="submit"]');
        btn.disabled = false;
        btn.textContent = "Upload";
      }
    });
  }

  document.addEventListener("click", async (event) => {
    const copyBtn = event.target.closest("[data-copy-link]");
    if (copyBtn) {
      const token = copyBtn.dataset.copyLink;
      const baseUrl = window.location.origin;
      const link = `${baseUrl}/pages/questionnaire.html?token=${token}`;
      navigator.clipboard.writeText(link);
      const originalText = copyBtn.textContent;
      copyBtn.textContent = "Copied!";
      setTimeout(() => {
        copyBtn.textContent = originalText;
      }, 2000);
    }

    const deleteBtn = event.target.closest("[data-delete-questionnaire]");
    if (deleteBtn) {
      const questionnaireId = deleteBtn.dataset.deleteQuestionnaire;
      if (confirm("Delete this questionnaire? Existing responses will be preserved.")) {
        try {
          const { error } = await supabaseClient
            .from("project_questionnaires")
            .delete()
            .eq("id", questionnaireId);
          if (error) throw error;
          renderProjectDetail(project);
        } catch (error) {
          console.error("Delete failed:", error);
          alert(`Couldn't delete questionnaire: ${error.message}`);
        }
      }
    }
  });

  document.getElementById("memory-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(event.target);
    const updates = {
      memory_problem_solved: formData.get("problemSolved") || null,
      memory_capabilities: formData.get("capabilities") || null,
      memory_industries: formData.get("industries") || null,
      memory_patterns: formData.get("patterns") || null,
      memory_time_note: formData.get("timeNote") || null,
      memory_lessons: formData.get("lessons") || null,
    };
    const { error } = await supabaseClient.from("projects").update(updates).eq("id", project.id);
    if (error) {
      alert(`Couldn't save Agency Memory: ${error.message}`);
      return;
    }
    Object.assign(project, updates);
    alert("Saved.");
  });

  document.getElementById("edit-project-btn").addEventListener("click", () => {
    projectDetailDialog.close();
    openProjectForm(project);
  });

  if (repoUrl) {
    loadRepoInfo(repoUrl);
  }
}

function parseGithubRepo(url) {
  if (!url) return null;
  const match = String(url).match(/github\.com\/([^/\s]+)\/([^/\s#?]+)/i);
  if (!match) return null;
  return { owner: match[1], repo: match[2].replace(/\.git$/, "") };
}

async function fetchRepoInfo(owner, repo) {
  const [metaRes, langRes, readmeRes] = await Promise.all([
    fetch(`https://api.github.com/repos/${owner}/${repo}`),
    fetch(`https://api.github.com/repos/${owner}/${repo}/languages`),
    fetch(`https://api.github.com/repos/${owner}/${repo}/readme`),
  ]);

  if (!metaRes.ok) {
    return { notFound: true };
  }

  const meta = await metaRes.json();
  const languages = langRes.ok ? await langRes.json() : {};

  let readme = null;
  if (readmeRes.ok) {
    const readmeData = await readmeRes.json();
    if (readmeData.content) {
      const bytes = Uint8Array.from(atob(readmeData.content.replace(/\n/g, "")), (c) => c.charCodeAt(0));
      readme = new TextDecoder("utf-8").decode(bytes);
    }
  }

  return { description: meta.description || null, languages, readme, notFound: false };
}

const LANGUAGE_COLORS = {
  JavaScript: "#f1e05a",
  TypeScript: "#3178c6",
  HTML: "#e34c26",
  CSS: "#563d7c",
  Python: "#3572A5",
  Java: "#b07219",
  Ruby: "#701516",
  PHP: "#4F5D95",
  Go: "#00ADD8",
  Rust: "#dea584",
  Shell: "#89e051",
  C: "#555555",
  "C++": "#f34b7d",
  "C#": "#178600",
  Swift: "#F05138",
  Kotlin: "#A97BFF",
  Dart: "#00B4AB",
  Vue: "#41b883",
  SCSS: "#c6538c",
  Dockerfile: "#384d54",
  Markdown: "#083fa1",
  JSON: "#292929",
};

function colorForLanguage(name) {
  if (LANGUAGE_COLORS[name]) return LANGUAGE_COLORS[name];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return `hsl(${Math.abs(hash) % 360}, 55%, 55%)`;
}

function renderLanguageBar(languages) {
  const entries = Object.entries(languages).sort((a, b) => b[1] - a[1]);
  const total = entries.reduce((sum, [, bytes]) => sum + bytes, 0);
  if (total === 0) return '<p class="lead-detail-contact">No language data available.</p>';

  const segments = entries
    .map(([name, bytes]) => {
      const pct = (bytes / total) * 100;
      return `<span class="language-segment" style="width:${pct.toFixed(2)}%; background:${colorForLanguage(name)}"></span>`;
    })
    .join("");

  const legend = entries
    .map(([name, bytes]) => {
      const pct = ((bytes / total) * 100).toFixed(1);
      return `<span class="language-legend-item"><span class="language-dot" style="background:${colorForLanguage(name)}"></span>${escapeHtml(name)} ${pct}%</span>`;
    })
    .join("");

  return `<div class="language-bar">${segments}</div><div class="language-legend">${legend}</div>`;
}

async function loadRepoInfo(repoUrl) {
  const infoEl = document.getElementById("repo-info");
  const parsed = parseGithubRepo(repoUrl);
  if (!parsed) {
    infoEl.innerHTML = '<p style="color: var(--color-danger);">That doesn\'t look like a GitHub repo URL.</p>';
    return;
  }

  try {
    const info = await fetchRepoInfo(parsed.owner, parsed.repo);
    if (info.notFound) {
      infoEl.innerHTML =
        '<p style="color: var(--color-danger);">Repo not found or private (only public repos are supported).</p>';
      return;
    }
    infoEl.innerHTML = `
      ${info.description ? `<p class="lead-detail-contact">${escapeHtml(info.description)}</p>` : ""}
      <h3>Languages</h3>
      ${renderLanguageBar(info.languages)}
      ${info.readme ? `<h3>README</h3><div class="readme-box">${escapeHtml(info.readme)}</div>` : ""}
    `;
  } catch (error) {
    console.error("Failed to load repo info:", error);
    infoEl.innerHTML =
      '<p style="color: var(--color-danger);">Couldn\'t load repo info. Check the console for details.</p>';
  }
}

document.addEventListener("click", (event) => {
  const btn = event.target.closest("[data-close-dialog]");
  if (btn) btn.closest("dialog").close();
});

// Initialize storage bucket for questionnaires (optional - mainly for first-time setup)
async function initializeQuestionnairesBucket() {
  try {
    // Try to create the bucket via Edge Function
    // Note: This may fail on remote deployments (e.g., GitHub Pages) due to CORS
    const response = await fetch(
      'https://kndpvdixtlirwgsqvgjh.supabase.co/functions/v1/init-questionnaire-bucket',
      { method: 'POST' }
    );
    if (response.ok) {
      console.log('Questionnaires bucket initialized');
    }
  } catch (error) {
    // CORS or network errors are expected on GitHub Pages
    // Bucket should already be initialized from local development
    console.log('Questionnaires bucket initialization skipped (expected on GitHub Pages)');
  }
}

// Only initialize on localhost, skip on remote deployments
if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
  initializeQuestionnairesBucket();
}

renderDashboard().catch((error) => {
  console.error("Failed to load dashboard:", error);
  document.getElementById("project-grid").innerHTML =
    '<p style="color: var(--color-danger);">Couldn\'t load projects. Check the console for details.</p>';
});
