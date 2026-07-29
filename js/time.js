function getWeekStart(date = new Date()) {
  const d = new Date(date);
  const day = d.getDay(); // 0 = Sunday
  const diffToMonday = (day === 0 ? -6 : 1) - day;
  d.setDate(d.getDate() + diffToMonday);
  d.setHours(0, 0, 0, 0);
  return d;
}

function getMonthStart(date = new Date()) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function toISODate(date) {
  return date.toISOString().slice(0, 10);
}

async function fetchProjects() {
  const { data, error } = await supabaseClient.from("projects").select("id, name").order("name");
  if (error) throw error;
  return data;
}

async function fetchEntriesSince(sinceDate) {
  const { data, error } = await supabaseClient
    .from("time_entries")
    .select("id, project_id, entry_date, hours")
    .gte("entry_date", toISODate(sinceDate));
  if (error) throw error;
  return data;
}

async function fetchRecentEntries(limit = 15) {
  const { data, error } = await supabaseClient
    .from("time_entries")
    .select("id, entry_date, hours, note, projects(name)")
    .order("entry_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data;
}

function sumByProject(entries) {
  const totals = {};
  for (const entry of entries) {
    totals[entry.project_id] = (totals[entry.project_id] || 0) + Number(entry.hours);
  }
  return totals;
}

function renderBreakdown(projects, weekEntries, monthEntries) {
  const weekTotals = sumByProject(weekEntries);
  const monthTotals = sumByProject(monthEntries);

  const rows = projects
    .map((p) => ({
      name: p.name,
      week: weekTotals[p.id] || 0,
      month: monthTotals[p.id] || 0,
    }))
    .sort((a, b) => b.week - a.week);

  const body = document.getElementById("breakdown-body");
  body.replaceChildren(
    ...rows.map((row) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `<td>${row.name}</td><td>${row.week.toFixed(2)}</td><td>${row.month.toFixed(2)}</td>`;
      return tr;
    })
  );

  const weekTotal = rows.reduce((sum, r) => sum + r.week, 0);
  const monthTotal = rows.reduce((sum, r) => sum + r.month, 0);
  document.getElementById("breakdown-footer").innerHTML = `
    <tr><td>Total</td><td>${weekTotal.toFixed(2)}</td><td>${monthTotal.toFixed(2)}</td></tr>
  `;
}

function renderRecentEntries(entries) {
  const list = document.getElementById("entries-list");
  if (entries.length === 0) {
    list.innerHTML = '<p class="lead-detail-contact">No entries yet.</p>';
    return;
  }
  list.replaceChildren(
    ...entries.map((entry) => {
      const row = document.createElement("div");
      row.className = "entry-row";
      row.innerHTML = `
        <span class="entry-date">${entry.entry_date}</span>
        <span class="entry-project">${entry.projects?.name || "—"}</span>
        <span class="entry-hours">${Number(entry.hours).toFixed(2)}h</span>
        <span class="entry-note">${entry.note || ""}</span>
        <button type="button" class="btn btn-secondary entry-delete" data-id="${entry.id}">Delete</button>
      `;
      row.querySelector(".entry-delete").addEventListener("click", () => deleteEntry(entry.id));
      return row;
    })
  );
}

async function deleteEntry(id) {
  const { error } = await supabaseClient.from("time_entries").delete().eq("id", id);
  if (error) {
    alert(`Couldn't delete entry: ${error.message}`);
    return;
  }
  await refresh();
}

let projectsCache = [];

async function refresh() {
  const [weekEntries, monthEntries, recentEntries] = await Promise.all([
    fetchEntriesSince(getWeekStart()),
    fetchEntriesSince(getMonthStart()),
    fetchRecentEntries(),
  ]);
  renderBreakdown(projectsCache, weekEntries, monthEntries);
  renderRecentEntries(recentEntries);
}

async function init() {
  document.getElementById("entry-date").value = toISODate(new Date());

  projectsCache = await fetchProjects();
  const select = document.getElementById("project-select");
  select.replaceChildren(
    ...projectsCache.map((p) => {
      const option = document.createElement("option");
      option.value = p.id;
      option.textContent = p.name;
      return option;
    })
  );

  document.getElementById("entry-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(event.target);
    const { error } = await supabaseClient.from("time_entries").insert({
      project_id: formData.get("projectId"),
      entry_date: formData.get("entryDate"),
      hours: formData.get("hours"),
      note: formData.get("note") || null,
    });
    if (error) {
      alert(`Couldn't log hours: ${error.message}`);
      return;
    }
    event.target.reset();
    document.getElementById("entry-date").value = toISODate(new Date());
    await refresh();
  });

  await refresh();
}

init().catch((error) => {
  console.error("Failed to load time tracking:", error);
  document.querySelector(".app-main").innerHTML +=
    '<p style="color: var(--color-danger);">Couldn\'t load time data. Check the console for details.</p>';
});
