// Client Impact — shared calculation helpers.
//
// Unlike other page logic in this app (which duplicates small utils per page,
// see CLAUDE.md), this file is loaded by both js/dashboard.js (executive KPIs,
// Attention Required, dashboard charts) and js/impact.js (the detailed Impact
// page). Impact numbers appear in both places and must always agree, so the
// math lives in one place. Rules: docs/IMPACT_CALCULATIONS.md.

const IMPACT_ANNUAL_MULTIPLIERS = {
  daily: 260,
  weekly: 52,
  monthly: 12,
  quarterly: 4,
  yearly: 1,
};

const EVIDENCE_LEVELS = ["estimated", "client_confirmed", "measured"];

const EVIDENCE_LABELS = {
  estimated: "Estimated",
  client_confirmed: "Client Confirmed",
  measured: "Measured",
};

const FRESHNESS_LABELS = {
  fresh: "Fresh",
  review_soon: "Review Soon",
  stale: "Stale",
  baseline_needed: "Baseline Needed",
};

function impactAnnualOccurrences(workflow) {
  if (workflow.occurrences_per_period != null && workflow.occurrences_per_period !== "") {
    return Number(workflow.occurrences_per_period);
  }
  if (workflow.frequency === "ad_hoc") return 0;
  return IMPACT_ANNUAL_MULTIPLIERS[workflow.frequency] || 0;
}

// Core per-workflow calculation. Returns nulls (never 0) when data is missing
// so callers can render "Baseline needed" / "No current measurement" instead
// of a misleading zero.
function computeWorkflowImpact(workflow) {
  const before = workflow.before_minutes_per_occurrence;
  const current = workflow.current_minutes_per_occurrence;
  const hasBaseline = before != null;
  const hasCurrent = current != null;

  const result = {
    hasBaseline,
    hasCurrent,
    timeSavedMinutesPerOccurrence: null,
    annualMinutesSaved: null,
    annualHoursSaved: null,
    monthlyHoursSaved: null,
    weeklyHoursSaved: null,
    workdaysRecovered: null,
    timeReductionPercent: null,
    estimatedCapacityValue: null,
  };

  if (!hasBaseline || !hasCurrent) return result;

  const occurrences = impactAnnualOccurrences(workflow);
  const perOccurrence = Math.max(Number(before) - Number(current), 0);
  const annualMinutes = perOccurrence * occurrences;
  const annualHours = annualMinutes / 60;

  result.timeSavedMinutesPerOccurrence = perOccurrence;
  result.annualMinutesSaved = annualMinutes;
  result.annualHoursSaved = annualHours;
  result.monthlyHoursSaved = annualHours / 12;
  result.weeklyHoursSaved = annualHours / 52;
  result.workdaysRecovered = annualHours / 8;
  result.timeReductionPercent = Number(before) > 0 ? ((Number(before) - Number(current)) / Number(before)) * 100 : null;
  if (workflow.hourly_value != null) {
    result.estimatedCapacityValue = annualHours * Number(workflow.hourly_value);
  }
  return result;
}

function impactFreshnessStatus(lastMeasuredAt) {
  if (!lastMeasuredAt) return "baseline_needed";
  const days = (Date.now() - new Date(lastMeasuredAt).getTime()) / 86400000;
  if (days <= 60) return "fresh";
  if (days <= 120) return "review_soon";
  return "stale";
}

// Portfolio-level rollup. Never collapses evidence quality — separate totals
// for measured / client_confirmed / estimated, plus the two combined figures.
function aggregatePortfolioImpact(workflows) {
  const totals = { estimated: 0, client_confirmed: 0, measured: 0 };
  let totalIdentifiedHours = 0;
  let missingBaselineCount = 0;
  let staleCount = 0;
  let reviewSoonCount = 0;

  for (const workflow of workflows) {
    const impact = computeWorkflowImpact(workflow);
    const freshness = impactFreshnessStatus(workflow.last_measured_at);

    if (!impact.hasBaseline || !impact.hasCurrent) {
      missingBaselineCount++;
    } else if (freshness === "stale") {
      staleCount++;
    } else if (freshness === "review_soon") {
      reviewSoonCount++;
    }

    if (impact.annualHoursSaved != null) {
      totals[workflow.evidence_level] = (totals[workflow.evidence_level] || 0) + impact.annualHoursSaved;
      totalIdentifiedHours += impact.annualHoursSaved;
    }
  }

  return {
    measuredHours: totals.measured,
    clientConfirmedHours: totals.client_confirmed,
    estimatedHours: totals.estimated,
    totalIdentifiedHours,
    verifiedHours: totals.measured + totals.client_confirmed,
    workdaysRecovered: totalIdentifiedHours / 8,
    missingBaselineCount,
    staleCount,
    reviewSoonCount,
  };
}

// Builds the "Impact Trend" series: total portfolio annual-hours-saved as of
// each point in time a measurement was recorded, using each workflow's most
// recent known reading as of that moment. Matches the handoff's framing —
// "total annualized impact across the portfolio as measurements are added or
// improved" — rather than reconstructing a full historical ledger.
function buildImpactTrend(workflows, measurementsByWorkflowId) {
  const events = [];
  for (const workflow of workflows) {
    const measurements = measurementsByWorkflowId[workflow.id] || [];
    for (const m of measurements) {
      events.push({ workflowId: workflow.id, date: m.measured_at, minutes: m.minutes_per_occurrence });
    }
  }
  events.sort((a, b) => new Date(a.date) - new Date(b.date));
  if (events.length === 0) return [];

  const latestCurrent = {};
  const points = [];
  for (const event of events) {
    latestCurrent[event.workflowId] = event.minutes;
    let totalHours = 0;
    for (const workflow of workflows) {
      const current = latestCurrent[workflow.id];
      if (current == null || workflow.before_minutes_per_occurrence == null) continue;
      const perOccurrence = Math.max(Number(workflow.before_minutes_per_occurrence) - Number(current), 0);
      totalHours += (perOccurrence * impactAnnualOccurrences(workflow)) / 60;
    }
    points.push({ date: event.date, totalAnnualHoursSaved: totalHours });
  }
  return points;
}
