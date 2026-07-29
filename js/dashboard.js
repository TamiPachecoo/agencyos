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

function formatMilestone(project) {
  if (!project.next_milestone) return "—";
  if (!project.next_milestone_date) return project.next_milestone;
  const date = new Date(`${project.next_milestone_date}T00:00:00`);
  const formatted = date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return `${project.next_milestone} — ${formatted}`;
}

function renderProjectCard(project, hoursThisWeek, openTasks) {
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
    </div>
  `;
  card.addEventListener("click", () => openProjectDetail(project));
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

// --- Project detail dialog: GitHub repo link, description, language breakdown ---

const projectDetailDialog = document.getElementById("project-detail-dialog");

function openProjectDetail(project) {
  renderProjectDetail(project);
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
        <label>Upload questionnaire file
          <input type="file" name="questionnaireFile" accept=".html,.pdf,.docx" required />
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

        const randomBytes = crypto.getRandomValues(new Uint8Array(16));
        const token = Array.from(randomBytes).map(b => b.toString(16).padStart(2, '0')).join('');
        const filePath = `${project.id}/${token}-${file.name}`;

        const { error: uploadError } = await supabaseClient.storage
          .from("questionnaires")
          .upload(filePath, file);

        if (uploadError) throw uploadError;

        const { error: dbError } = await supabaseClient
          .from("project_questionnaires")
          .insert({
            project_id: project.id,
            file_name: file.name,
            file_path: filePath,
            share_token: token,
          });

        if (dbError) throw dbError;

        renderProjectDetail(project);
      } catch (error) {
        console.error("Upload failed:", error);
        alert(`Couldn't upload questionnaire: ${error.message}`);
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

renderDashboard().catch((error) => {
  console.error("Failed to load dashboard:", error);
  document.getElementById("project-grid").innerHTML =
    '<p style="color: var(--color-danger);">Couldn\'t load projects. Check the console for details.</p>';
});
