// Seeded data — placeholder until Supabase is wired in (charter step 3).
const PROJECTS = [
  { name: "Método Persea", status: "active", nextMilestone: "Module 3 content review — Aug 4", hoursThisWeek: 6, openTasks: 3 },
  { name: "Camarim Mineiro", status: "active", nextMilestone: "Bilingual site launch — Aug 10", hoursThisWeek: 9, openTasks: 5 },
  { name: "Vicaf Hydro", status: "in progress", nextMilestone: "Payroll integration — Aug 15", hoursThisWeek: 4, openTasks: 2 },
  { name: "Amarelinha", status: "in progress", nextMilestone: "Audit existing repo", hoursThisWeek: 0, openTasks: 1 },
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

  const dateEl = document.getElementById("today");
  dateEl.textContent = new Date().toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

renderDashboard();
