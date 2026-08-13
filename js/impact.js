function escapeHtml(value) {
  if (value == null) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const FREQUENCY_LABELS = {
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
  quarterly: "Quarterly",
  yearly: "Yearly",
  ad_hoc: "Ad hoc",
};

let state = {
  projects: [],
  workflows: [],
  measurementsByWorkflowId: {},
};

function projectName(projectId) {
  const project = state.projects.find((p) => p.id === projectId);
  return project ? project.name : "Unknown project";
}

// --- Data ---

async function fetchImpactData() {
  const [{ data: projects, error: projectsError }, { data: workflows, error: workflowsError }, { data: measurements, error: measurementsError }] =
    await Promise.all([
      supabaseClient.from("projects").select("id, name, memory_industries, memory_capabilities, memory_problem_solved").order("name"),
      supabaseClient.from("impact_workflows").select("*").eq("is_active", true).order("workflow_name"),
      supabaseClient.from("impact_measurements").select("*").order("measured_at"),
    ]);

  if (projectsError) throw projectsError;
  if (workflowsError) throw workflowsError;
  if (measurementsError) throw measurementsError;

  const measurementsByWorkflowId = {};
  for (const m of measurements || []) {
    (measurementsByWorkflowId[m.workflow_id] = measurementsByWorkflowId[m.workflow_id] || []).push(m);
  }

  state = { projects: projects || [], workflows: workflows || [], measurementsByWorkflowId };
}

// --- Render: whole page ---

async function renderImpactPage() {
  await fetchImpactData();

  const agg = aggregatePortfolioImpact(state.workflows);
  renderImpactKpiRow(agg);
  renderImpactHoursChart();
  renderImpactTrendChart();
  renderWorkflowsList();
  renderImpactEvidenceChart(agg);
  renderPortfolioMatrix();
  renderMeasurementsDue();
  populateSalesEvidenceProjectFilter();
  renderSalesEvidence();
}

function renderImpactKpiRow(agg) {
  const el = document.getElementById("impact-kpi-row");
  const tiles = [
    { label: "Total identified / yr", value: formatImpactHours(agg.totalIdentifiedHours) },
    { label: "Verified (measured + confirmed)", value: formatImpactHours(agg.verifiedHours) },
    { label: "Workdays recovered / yr", value: `${Math.round(agg.workdaysRecovered).toLocaleString()} days` },
    { label: "Missing baselines", value: agg.missingBaselineCount, warn: agg.missingBaselineCount > 0 },
    { label: "Stale measurements", value: agg.staleCount, warn: agg.staleCount > 0 },
  ];
  el.innerHTML = tiles
    .map(
      (t) => `
    <div class="kpi-tile ${t.warn ? "kpi-tile-warn" : ""}">
      <span class="kpi-tile-value">${t.value}</span>
      <span class="kpi-tile-label">${t.label}</span>
    </div>
  `
    )
    .join("");
}

function renderImpactHoursChart() {
  const byProject = {};
  for (const workflow of state.workflows) {
    const impact = computeWorkflowImpact(workflow);
    if (impact.annualHoursSaved == null) continue;
    byProject[workflow.project_id] = (byProject[workflow.project_id] || 0) + impact.annualHoursSaved;
  }
  const rows = Object.entries(byProject)
    .map(([projectId, hours]) => ({ label: projectName(projectId), hours }))
    .sort((a, b) => b.hours - a.hours);
  renderHoursBarChart(document.getElementById("impact-hours-chart"), rows);
}

function renderImpactTrendChart() {
  const points = buildImpactTrend(state.workflows, state.measurementsByWorkflowId);
  renderTrendLineChart(document.getElementById("impact-trend-chart"), points);
}

function renderImpactEvidenceChart(agg) {
  renderEvidenceChart(document.getElementById("impact-evidence-chart"), agg);
}

// --- Render: workflows list (the CRUD surface) ---

function workflowStatusLine(workflow) {
  const impact = computeWorkflowImpact(workflow);
  if (!impact.hasBaseline) return { text: "Baseline needed", cls: "impact-status-needed" };
  if (!impact.hasCurrent) return { text: "No current measurement", cls: "impact-status-needed" };
  return { text: `${formatImpactHours(impact.annualHoursSaved)} · ${Math.round(impact.timeReductionPercent)}% reduction`, cls: "impact-status-ok" };
}

function freshnessBadgeFromStatus(status) {
  return `<span class="freshness-badge freshness-${status}">${FRESHNESS_LABELS[status]}</span>`;
}

function freshnessBadge(lastMeasuredAt) {
  return freshnessBadgeFromStatus(impactFreshnessStatus(lastMeasuredAt));
}

function evidenceBadge(level) {
  return `<span class="evidence-badge evidence-badge-${level}">${EVIDENCE_LABELS[level] || level}</span>`;
}

function renderWorkflowsList() {
  const container = document.getElementById("impact-workflows-list");
  if (state.workflows.length === 0) {
    container.innerHTML = `<p class="lead-detail-contact">No workflows tracked yet. Add one to start measuring impact.</p>`;
    return;
  }

  const byProject = {};
  for (const workflow of state.workflows) {
    (byProject[workflow.project_id] = byProject[workflow.project_id] || []).push(workflow);
  }

  container.innerHTML = Object.entries(byProject)
    .map(([projectId, workflows]) => {
      const rows = workflows
        .map((workflow) => {
          const status = workflowStatusLine(workflow);
          const before = workflow.before_minutes_per_occurrence;
          const current = workflow.current_minutes_per_occurrence;
          const beforeAfter =
            before == null
              ? "Baseline needed"
              : `${before} min → ${current == null ? "?" : current} min`;
          return `
          <div class="workflow-row" data-workflow-id="${workflow.id}">
            <div class="workflow-row-main">
              <strong>${escapeHtml(workflow.workflow_name)}</strong>
              <span class="lead-detail-contact">${FREQUENCY_LABELS[workflow.frequency] || workflow.frequency} · ${escapeHtml(beforeAfter)} · ${workflow.people_impacted} ${workflow.people_impacted === 1 ? "person" : "people"}</span>
              <span class="${status.cls}">${status.text}</span>
            </div>
            <div class="workflow-row-badges">
              ${evidenceBadge(workflow.evidence_level)}
              ${freshnessBadge(workflow.last_measured_at)}
            </div>
            <div class="workflow-row-actions">
              <button type="button" class="btn btn-secondary" data-log-measurement="${workflow.id}">Log measurement</button>
              <button type="button" class="btn btn-secondary" data-edit-workflow="${workflow.id}">Edit</button>
              <button type="button" class="btn btn-danger" data-archive-workflow="${workflow.id}">Archive</button>
            </div>
          </div>
        `;
        })
        .join("");

      return `
        <div class="workflow-project-group">
          <h3>${escapeHtml(projectName(projectId))}</h3>
          ${rows}
        </div>
      `;
    })
    .join("");
}

// --- Render: portfolio matrix ---

function renderPortfolioMatrix() {
  const body = document.getElementById("impact-matrix-body");
  const byProject = {};
  for (const workflow of state.workflows) {
    const impact = computeWorkflowImpact(workflow);
    const bucket = (byProject[workflow.project_id] = byProject[workflow.project_id] || {
      measured: 0,
      client_confirmed: 0,
      estimated: 0,
      worstFreshness: "fresh",
      count: 0,
    });
    bucket.count++;
    if (impact.annualHoursSaved != null) {
      bucket[workflow.evidence_level] = (bucket[workflow.evidence_level] || 0) + impact.annualHoursSaved;
    }
    const freshness = impactFreshnessStatus(workflow.last_measured_at);
    const order = ["fresh", "review_soon", "stale", "baseline_needed"];
    if (order.indexOf(freshness) > order.indexOf(bucket.worstFreshness)) bucket.worstFreshness = freshness;
  }

  const entries = Object.entries(byProject);
  if (entries.length === 0) {
    body.innerHTML = `<tr><td colspan="6" class="lead-detail-contact">No workflows tracked yet.</td></tr>`;
    return;
  }

  body.innerHTML = entries
    .map(([projectId, bucket]) => {
      const total = bucket.measured + bucket.client_confirmed + bucket.estimated;
      return `
      <tr>
        <td>${escapeHtml(projectName(projectId))}</td>
        <td>${formatImpactHours(bucket.measured)}</td>
        <td>${formatImpactHours(bucket.client_confirmed)}</td>
        <td>${formatImpactHours(bucket.estimated)}</td>
        <td><strong>${formatImpactHours(total)}</strong></td>
        <td>${freshnessBadgeFromStatus(bucket.worstFreshness)}</td>
      </tr>
    `;
    })
    .join("");
}

// --- Render: measurements due ---

function renderMeasurementsDue() {
  const container = document.getElementById("impact-due-list");
  const due = state.workflows
    .map((w) => ({ workflow: w, freshness: impactFreshnessStatus(w.last_measured_at) }))
    .filter((w) => w.freshness === "stale" || w.freshness === "review_soon" || w.freshness === "baseline_needed")
    .sort((a, b) => {
      const order = { baseline_needed: 0, stale: 1, review_soon: 2 };
      return order[a.freshness] - order[b.freshness];
    });

  if (due.length === 0) {
    container.innerHTML = `<p class="lead-detail-contact">Everything's measured within the last 60 days.</p>`;
    return;
  }

  container.innerHTML = due
    .map(
      ({ workflow, freshness }) => `
    <div class="measurement-due-row">
      <div>
        <strong>${escapeHtml(projectName(workflow.project_id))}</strong> — ${escapeHtml(workflow.workflow_name)}
        ${freshnessBadge(workflow.last_measured_at)}
      </div>
      <button type="button" class="btn btn-secondary" data-log-measurement="${workflow.id}">Log measurement</button>
    </div>
  `
    )
    .join("");
}

// --- Render: sales evidence ---

function populateSalesEvidenceProjectFilter() {
  const select = document.getElementById("sales-filter-project");
  select.innerHTML =
    `<option value="">All projects</option>` +
    state.projects.map((p) => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join("");
}

function renderSalesEvidence() {
  const container = document.getElementById("sales-evidence-list");
  const projectFilter = document.getElementById("sales-filter-project").value;
  const evidenceFilter = document.getElementById("sales-filter-evidence").value;
  const textFilter = document.getElementById("sales-filter-text").value.trim().toLowerCase();

  const cards = state.workflows
    .filter((w) => {
      const impact = computeWorkflowImpact(w);
      if (impact.annualHoursSaved == null || impact.timeReductionPercent == null) return false;
      if (projectFilter && w.project_id !== projectFilter) return false;
      if (evidenceFilter && w.evidence_level !== evidenceFilter) return false;
      if (textFilter) {
        const project = state.projects.find((p) => p.id === w.project_id) || {};
        const haystack = [
          project.name,
          project.memory_industries,
          project.memory_capabilities,
          project.memory_problem_solved,
          w.workflow_name,
          w.description,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(textFilter)) return false;
      }
      return true;
    })
    .map((w) => {
      const impact = computeWorkflowImpact(w);
      const project = state.projects.find((p) => p.id === w.project_id) || {};
      return `
      <div class="card sales-evidence-card">
        <p class="sales-evidence-case">Relevant Case: <strong>${escapeHtml(project.name || "—")}</strong></p>
        ${project.memory_industries ? `<p class="card-meta-row"><span>Industry</span><span>${escapeHtml(project.memory_industries)}</span></p>` : ""}
        <p class="card-meta-row"><span>Problem</span><span>${escapeHtml(project.memory_problem_solved || w.description || w.workflow_name)}</span></p>
        <p class="card-meta-row"><span>Impact</span><span>${formatImpactHours(impact.annualHoursSaved)} recovered</span></p>
        <p class="card-meta-row"><span>Reduction</span><span>${Math.round(impact.timeReductionPercent)}%</span></p>
        <p class="card-meta-row"><span>People impacted</span><span>${w.people_impacted}</span></p>
        <p class="card-meta-row"><span>Evidence</span><span>${evidenceBadge(w.evidence_level)}</span></p>
      </div>
    `;
    })
    .join("");

  container.innerHTML = cards || `<p class="lead-detail-contact">No workflows match those filters yet.</p>`;
}

["sales-filter-project", "sales-filter-evidence", "sales-filter-text"].forEach((id) => {
  document.getElementById(id).addEventListener("input", renderSalesEvidence);
});

// --- Workflow form (create/edit) ---

const workflowFormDialog = document.getElementById("workflow-form-dialog");

function openWorkflowForm(workflow) {
  renderWorkflowForm(workflow || null);
  workflowFormDialog.showModal();
}

function renderWorkflowForm(workflow) {
  const isNew = !workflow;
  const container = document.getElementById("workflow-form-content");
  container.innerHTML = `
    <h2>${isNew ? "Add workflow" : `Edit ${escapeHtml(workflow.workflow_name)}`}</h2>
    <form id="workflow-form" class="dialog-form">
      <label>Project
        <select name="projectId" required>
          ${state.projects.map((p) => `<option value="${p.id}" ${workflow && workflow.project_id === p.id ? "selected" : ""}>${escapeHtml(p.name)}</option>`).join("")}
        </select>
      </label>
      <label>Workflow name
        <input type="text" name="workflowName" value="${escapeHtml(workflow?.workflow_name || "")}" placeholder="e.g., Payroll preparation" required />
      </label>
      <label>Description (optional)
        <textarea name="description">${escapeHtml(workflow?.description || "")}</textarea>
      </label>
      <label>Frequency
        <select name="frequency">
          ${Object.entries(FREQUENCY_LABELS).map(([value, label]) => `<option value="${value}" ${workflow?.frequency === value ? "selected" : (!workflow && value === "weekly") ? "selected" : ""}>${label}</option>`).join("")}
        </select>
      </label>
      <label>Occurrences per year (optional — overrides frequency default, required for "Ad hoc")
        <input type="number" name="occurrencesPerPeriod" min="0" step="1" value="${workflow?.occurrences_per_period ?? ""}" />
      </label>
      <label>People impacted
        <input type="number" name="peopleImpacted" min="0" step="1" value="${workflow?.people_impacted ?? 1}" required />
      </label>
      <label>Before — minutes per occurrence (baseline)
        <input type="number" name="beforeMinutes" min="0" step="0.1" value="${workflow?.before_minutes_per_occurrence ?? ""}" placeholder="Leave blank if not yet measured" />
      </label>
      <label>Current — minutes per occurrence
        <input type="number" name="currentMinutes" min="0" step="0.1" value="${workflow?.current_minutes_per_occurrence ?? ""}" placeholder="Leave blank if not yet measured" />
      </label>
      <label>Evidence level
        <select name="evidenceLevel">
          ${EVIDENCE_LEVELS.map((level) => `<option value="${level}" ${workflow?.evidence_level === level ? "selected" : ""}>${EVIDENCE_LABELS[level]}</option>`).join("")}
        </select>
      </label>
      <label>Evidence notes (optional)
        <textarea name="evidenceNotes">${escapeHtml(workflow?.evidence_notes || "")}</textarea>
      </label>
      <label>Hourly value in $ (optional — for estimated capacity value)
        <input type="number" name="hourlyValue" min="0" step="0.01" value="${workflow?.hourly_value ?? ""}" />
      </label>
      <label>Baseline recorded on
        <input type="date" name="baselineRecordedAt" value="${workflow?.baseline_recorded_at ? workflow.baseline_recorded_at.slice(0, 10) : ""}" />
      </label>
      <label>Last measured on
        <input type="date" name="lastMeasuredAt" value="${workflow?.last_measured_at ? workflow.last_measured_at.slice(0, 10) : ""}" />
      </label>
      <div class="dialog-actions">
        <button type="button" class="btn btn-secondary" data-close-dialog>Cancel</button>
        <button type="submit" class="btn btn-primary">${isNew ? "Add workflow" : "Save"}</button>
      </div>
    </form>
  `;

  document.getElementById("workflow-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(event.target);
    const payload = {
      project_id: formData.get("projectId"),
      workflow_name: formData.get("workflowName").trim(),
      description: formData.get("description").trim() || null,
      frequency: formData.get("frequency"),
      occurrences_per_period: formData.get("occurrencesPerPeriod") || null,
      people_impacted: Number(formData.get("peopleImpacted")),
      before_minutes_per_occurrence: formData.get("beforeMinutes") || null,
      current_minutes_per_occurrence: formData.get("currentMinutes") || null,
      evidence_level: formData.get("evidenceLevel"),
      evidence_notes: formData.get("evidenceNotes").trim() || null,
      hourly_value: formData.get("hourlyValue") || null,
      baseline_recorded_at: formData.get("baselineRecordedAt") || null,
      last_measured_at: formData.get("lastMeasuredAt") || null,
    };

    try {
      if (isNew) {
        const { error } = await supabaseClient.from("impact_workflows").insert([payload]);
        if (error) throw error;
      } else {
        const { error } = await supabaseClient.from("impact_workflows").update(payload).eq("id", workflow.id);
        if (error) throw error;
      }
      workflowFormDialog.close();
      await renderImpactPage();
    } catch (error) {
      console.error("Failed to save workflow:", error);
      alert(`Couldn't save workflow: ${error.message}`);
    }
  });
}

// --- Measurement form (adds history + updates the workflow's "current") ---

const measurementFormDialog = document.getElementById("measurement-form-dialog");

function openMeasurementForm(workflow) {
  const container = document.getElementById("measurement-form-content");
  const today = new Date().toISOString().slice(0, 10);
  container.innerHTML = `
    <h2>Log measurement</h2>
    <p class="lead-detail-contact">${escapeHtml(projectName(workflow.project_id))} — ${escapeHtml(workflow.workflow_name)}</p>
    <form id="measurement-form" class="dialog-form">
      <label>Measured on
        <input type="date" name="measuredAt" value="${today}" required />
      </label>
      <label>Minutes per occurrence
        <input type="number" name="minutes" min="0" step="0.1" required />
      </label>
      <label>Evidence level
        <select name="evidenceLevel">
          ${EVIDENCE_LEVELS.map((level) => `<option value="${level}" ${workflow.evidence_level === level ? "selected" : ""}>${EVIDENCE_LABELS[level]}</option>`).join("")}
        </select>
      </label>
      <label>Source (optional)
        <input type="text" name="source" placeholder="Client call, time log, observed session..." />
      </label>
      <label>Notes (optional)
        <textarea name="notes"></textarea>
      </label>
      <div class="dialog-actions">
        <button type="button" class="btn btn-secondary" data-close-dialog>Cancel</button>
        <button type="submit" class="btn btn-primary">Save measurement</button>
      </div>
    </form>
  `;

  document.getElementById("measurement-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(event.target);
    const measuredAt = formData.get("measuredAt");
    const minutes = Number(formData.get("minutes"));
    const evidenceLevel = formData.get("evidenceLevel");

    try {
      const { error: insertError } = await supabaseClient.from("impact_measurements").insert([
        {
          workflow_id: workflow.id,
          measured_at: measuredAt,
          minutes_per_occurrence: minutes,
          evidence_level: evidenceLevel,
          source: formData.get("source").trim() || null,
          notes: formData.get("notes").trim() || null,
        },
      ]);
      if (insertError) throw insertError;

      const { error: updateError } = await supabaseClient
        .from("impact_workflows")
        .update({ current_minutes_per_occurrence: minutes, evidence_level: evidenceLevel, last_measured_at: measuredAt })
        .eq("id", workflow.id);
      if (updateError) throw updateError;

      measurementFormDialog.close();
      await renderImpactPage();
    } catch (error) {
      console.error("Failed to save measurement:", error);
      alert(`Couldn't save measurement: ${error.message}`);
    }
  });
}

// --- Event delegation for row actions + dialog close ---

document.addEventListener("click", async (event) => {
  const closeBtn = event.target.closest("[data-close-dialog]");
  if (closeBtn) closeBtn.closest("dialog").close();

  const logBtn = event.target.closest("[data-log-measurement]");
  if (logBtn) {
    const workflow = state.workflows.find((w) => w.id === logBtn.dataset.logMeasurement);
    if (workflow) openMeasurementForm(workflow);
  }

  const editBtn = event.target.closest("[data-edit-workflow]");
  if (editBtn) {
    const workflow = state.workflows.find((w) => w.id === editBtn.dataset.editWorkflow);
    if (workflow) openWorkflowForm(workflow);
  }

  const archiveBtn = event.target.closest("[data-archive-workflow]");
  if (archiveBtn) {
    const workflow = state.workflows.find((w) => w.id === archiveBtn.dataset.archiveWorkflow);
    if (workflow && confirm(`Archive "${workflow.workflow_name}"? Its measurement history is kept, but it drops out of active totals.`)) {
      const { error } = await supabaseClient.from("impact_workflows").update({ is_active: false }).eq("id", workflow.id);
      if (error) {
        alert(`Couldn't archive workflow: ${error.message}`);
      } else {
        await renderImpactPage();
      }
    }
  }
});

document.getElementById("add-workflow-btn").addEventListener("click", () => openWorkflowForm(null));

// --- Auth gate: this whole page depends on impact_workflows/impact_measurements,
// which are RLS-restricted to authenticated sessions. ---

let impactAuthResolved = false;

// Reloading on a later change (rather than trying to patch the DOM back and
// forth) keeps this simple and avoids leaving stale dialogs/state around —
// this only fires if the session changes while already sitting on this page
// (e.g. signing out from the header, or signing in from another tab).
function onAuthChanged() {
  if (impactAuthResolved) window.location.reload();
}

getAuthSession().then((session) => {
  impactAuthResolved = true;
  if (session) {
    renderImpactPage().catch((error) => {
      console.error("Failed to load impact data:", error);
      document.getElementById("impact-main").innerHTML = `<p style="color: var(--color-danger);">Couldn't load impact data. Check the console for details.</p>`;
    });
  } else {
    renderSignInPrompt(document.getElementById("impact-main"), "Sign in to view and manage Client Impact data.");
  }
});
