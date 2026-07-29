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
    .select("id, name, status, next_milestone, next_milestone_date")
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

function formatMilestone(project) {
  if (!project.next_milestone) return "—";
  if (!project.next_milestone_date) return project.next_milestone;
  const date = new Date(`${project.next_milestone_date}T00:00:00`);
  const formatted = date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return `${project.next_milestone} — ${formatted}`;
}

function renderProjectCard(project, hoursThisWeek, openTasks) {
  const badgeClass = project.status === "active" ? "badge-active" : "badge-progress";
  const card = document.createElement("article");
  card.className = "card";
  card.innerHTML = `
    <span class="badge ${badgeClass}">${project.status.replace("_", " ")}</span>
    <h2>${project.name}</h2>
    <div class="card-meta">
      <div class="card-meta-row"><span>Next</span><span>${formatMilestone(project)}</span></div>
      <div class="card-meta-row"><span>Hours this week</span><span>${hoursThisWeek}</span></div>
      <div class="card-meta-row"><span>Open tasks</span><span>${openTasks}</span></div>
    </div>
  `;
  return card;
}

async function renderDashboard() {
  const grid = document.getElementById("project-grid");
  const [projects, hoursByProject, openTasksByProject] = await Promise.all([
    fetchProjects(),
    fetchHoursThisWeek(),
    fetchOpenTaskCounts(),
  ]);

  grid.replaceChildren(
    ...projects.map((project) =>
      renderProjectCard(project, hoursByProject[project.id] || 0, openTasksByProject[project.id] || 0)
    )
  );

  const dateEl = document.getElementById("today");
  dateEl.textContent = new Date().toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

renderDashboard().catch((error) => {
  console.error("Failed to load dashboard:", error);
  document.getElementById("project-grid").innerHTML =
    '<p style="color: var(--color-danger);">Couldn\'t load projects. Check the console for details.</p>';
});
