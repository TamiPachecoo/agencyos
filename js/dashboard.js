// Seeded data — placeholder until Supabase is wired in (charter step 3).
const PROJECTS = [
  { name: "Método Persea", status: "active", nextMilestone: "—", hoursThisWeek: 0, openTasks: 0 },
  { name: "Camarim Mineiro", status: "active", nextMilestone: "—", hoursThisWeek: 0, openTasks: 0 },
  { name: "Vicaf Hydro", status: "in progress", nextMilestone: "—", hoursThisWeek: 0, openTasks: 0 },
  { name: "Amarelinha", status: "in progress", nextMilestone: "Audit existing repo", hoursThisWeek: 0, openTasks: 0 },
];

function renderProjectCard(project) {
  const badgeClass = project.status === "active" ? "badge-active" : "badge-progress";
  const card = document.createElement("article");
  card.className = "card";
  card.innerHTML = `
    <span class="badge ${badgeClass}">${project.status}</span>
    <h2>${project.name}</h2>
    <div class="card-meta">
      <div class="card-meta-row"><span>Next</span><span>${project.nextMilestone}</span></div>
      <div class="card-meta-row"><span>Hours this week</span><span>${project.hoursThisWeek}</span></div>
      <div class="card-meta-row"><span>Open tasks</span><span>${project.openTasks}</span></div>
    </div>
  `;
  return card;
}

function renderDashboard() {
  const grid = document.getElementById("project-grid");
  grid.replaceChildren(...PROJECTS.map(renderProjectCard));
}

renderDashboard();
