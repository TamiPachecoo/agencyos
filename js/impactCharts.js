// Shared chart renderers for Client Impact data — used by both the dashboard's
// compact "Client Impact Summary" charts and the full versions on the Impact
// page, so the same numbers always render the same way in both places.
// Depends on js/impactCalc.js for the numbers; renders plain HTML/SVG, no
// charting library (see CLAUDE.md — vanilla JS, no framework migrations).

function chartsEscapeHtml(value) {
  if (value == null) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatImpactHours(hours) {
  return `${Math.round(hours).toLocaleString()} hrs/yr`;
}

// rows: [{ label, hours }] — caller decides sort/limit.
function renderHoursBarChart(container, rows) {
  if (!rows || rows.length === 0) {
    container.innerHTML = `<p class="chart-empty">No measured impact yet — add a workflow to get started.</p>`;
    return;
  }
  const max = Math.max(...rows.map((r) => r.hours), 1);
  container.innerHTML = `
    <div class="hours-bar-chart">
      ${rows
        .map(
          (r) => `
        <div class="hours-bar-row">
          <span class="hours-bar-label" title="${chartsEscapeHtml(r.label)}">${chartsEscapeHtml(r.label)}</span>
          <span class="hours-bar-track">
            <span class="hours-bar-fill" style="width:${((r.hours / max) * 100).toFixed(1)}%"></span>
          </span>
          <span class="hours-bar-value">${formatImpactHours(r.hours)}</span>
        </div>
      `
        )
        .join("")}
    </div>
  `;
}

// points: [{ date, totalAnnualHoursSaved }] sorted ascending by date.
function renderTrendLineChart(container, points) {
  if (!points || points.length < 2) {
    container.innerHTML = `<p class="chart-empty">Log a second measurement on any workflow to see a trend.</p>`;
    return;
  }
  const width = 640;
  const height = 180;
  const padding = 30;
  const times = points.map((p) => new Date(p.date).getTime());
  const values = points.map((p) => p.totalAnnualHoursSaved);
  const minX = Math.min(...times);
  const maxX = Math.max(...times);
  const maxY = Math.max(...values, 1);
  const x = (t) => padding + (maxX === minX ? 0 : ((t - minX) / (maxX - minX)) * (width - padding * 2));
  const y = (v) => height - padding - (v / maxY) * (height - padding * 2);

  const pathD = points
    .map((p, i) => `${i === 0 ? "M" : "L"}${x(new Date(p.date).getTime()).toFixed(1)},${y(p.totalAnnualHoursSaved).toFixed(1)}`)
    .join(" ");

  const dots = points
    .map((p) => {
      const cx = x(new Date(p.date).getTime()).toFixed(1);
      const cy = y(p.totalAnnualHoursSaved).toFixed(1);
      const label = `${new Date(p.date).toLocaleDateString()} — ${formatImpactHours(p.totalAnnualHoursSaved)}`;
      return `<circle cx="${cx}" cy="${cy}" r="4" class="trend-dot" tabindex="0" data-label="${chartsEscapeHtml(label)}"><title>${chartsEscapeHtml(label)}</title></circle>`;
    })
    .join("");

  container.innerHTML = `
    <div class="trend-chart-wrap">
      <svg viewBox="0 0 ${width} ${height}" class="trend-chart" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Total annualized hours saved over time">
        <line x1="${padding}" y1="${height - padding}" x2="${width - padding}" y2="${height - padding}" class="trend-axis" />
        <path d="${pathD}" class="trend-line" fill="none" />
        ${dots}
      </svg>
      <div class="trend-tooltip" id="trend-tooltip-${container.id || "x"}" hidden></div>
    </div>
  `;

  const wrap = container.querySelector(".trend-chart-wrap");
  const tooltip = container.querySelector(".trend-tooltip");
  container.querySelectorAll(".trend-dot").forEach((dot) => {
    const show = (clientX, clientY) => {
      tooltip.textContent = dot.dataset.label;
      tooltip.hidden = false;
      const rect = wrap.getBoundingClientRect();
      tooltip.style.left = `${Math.min(clientX - rect.left + 12, rect.width - 140)}px`;
      tooltip.style.top = `${clientY - rect.top - 8}px`;
    };
    dot.addEventListener("mouseenter", (e) => show(e.clientX, e.clientY));
    dot.addEventListener("mouseleave", () => { tooltip.hidden = true; });
    dot.addEventListener("focus", () => {
      const rect = dot.getBoundingClientRect();
      show(rect.left, rect.top);
    });
    dot.addEventListener("blur", () => { tooltip.hidden = true; });
  });
}

// agg: result of aggregatePortfolioImpact() from js/impactCalc.js
function renderEvidenceChart(container, agg) {
  const segments = [
    { label: "Measured", hours: agg.measuredHours, cls: "evidence-fill-measured" },
    { label: "Client Confirmed", hours: agg.clientConfirmedHours, cls: "evidence-fill-confirmed" },
    { label: "Estimated", hours: agg.estimatedHours, cls: "evidence-fill-estimated" },
  ];
  const total = agg.totalIdentifiedHours;
  if (!total) {
    container.innerHTML = `<p class="chart-empty">No impact hours identified yet.</p>`;
    return;
  }
  container.innerHTML = `
    <div class="evidence-bar">
      ${segments
        .filter((s) => s.hours > 0)
        .map((s) => `<span class="evidence-segment ${s.cls}" style="width:${((s.hours / total) * 100).toFixed(1)}%"></span>`)
        .join("")}
    </div>
    <div class="evidence-legend">
      ${segments
        .map(
          (s) => `
        <span class="evidence-legend-item">
          <span class="evidence-dot ${s.cls}"></span>
          ${s.label}: ${formatImpactHours(s.hours)} (${total ? Math.round((s.hours / total) * 100) : 0}%)
        </span>
      `
        )
        .join("")}
    </div>
  `;
}

// buckets: { healthy, needsAttention, critical, unknown } — project counts.
function renderHealthDistributionChart(container, buckets) {
  const total = buckets.healthy + buckets.needsAttention + buckets.critical + buckets.unknown;
  const segments = [
    { label: "Healthy", count: buckets.healthy, cls: "health-fill-healthy" },
    { label: "Needs Attention", count: buckets.needsAttention, cls: "health-fill-attention" },
    { label: "Critical", count: buckets.critical, cls: "health-fill-critical" },
    { label: "Unknown", count: buckets.unknown, cls: "health-fill-unknown" },
  ];
  if (!total) {
    container.innerHTML = `<p class="chart-empty">No projects yet.</p>`;
    return;
  }
  container.innerHTML = `
    <div class="evidence-bar">
      ${segments
        .filter((s) => s.count > 0)
        .map((s) => `<span class="evidence-segment ${s.cls}" style="width:${((s.count / total) * 100).toFixed(1)}%"></span>`)
        .join("")}
    </div>
    <div class="evidence-legend">
      ${segments.map((s) => `<span class="evidence-legend-item"><span class="evidence-dot ${s.cls}"></span>${s.label}: ${s.count}</span>`).join("")}
    </div>
    <p class="chart-footnote">"Critical" needs technical health data, which isn't tracked yet — buckets above are based on milestones &amp; impact freshness only.</p>
  `;
}
