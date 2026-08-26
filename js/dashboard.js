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

function renderProjectCard(project, hoursThisWeek, openTasks, healthStatus) {
  const badgeClass = project.status === "active" ? "badge-active" : "badge-progress";
  const card = document.createElement("button");
  card.type = "button";
  card.className = "card project-card";

  let healthHtml = "";
  if (healthStatus) {
    const deployIcon = healthMonitor.getStatusIcon(healthStatus.deployment);
    const supabaseIcon = healthMonitor.getStatusIcon(healthStatus.supabase);
    const deployColor = healthMonitor.getStatusColor(healthStatus.deployment);
    const supabaseColor = healthMonitor.getStatusColor(healthStatus.supabase);

    healthHtml = `
      <div class="card-health-badge" title="System Health">
        <span class="health-dot" style="color: ${deployColor};" title="Deployment: ${healthStatus.deployment}">●</span>
        <span class="health-dot" style="color: ${supabaseColor};" title="Database: ${healthStatus.supabase}">●</span>
      </div>
    `;
  }

  card.innerHTML = `
    <div class="card-header">
      <span class="badge ${badgeClass}">${escapeHtml(project.status.replace("_", " "))}</span>
      ${healthHtml}
    </div>
    <h2>${escapeHtml(project.name)}</h2>
    <div class="card-meta">
      <div class="card-meta-row"><span>Next</span><span>${escapeHtml(formatMilestone(project))}</span></div>
      <div class="card-meta-row"><span>Hours this week</span><span>${hoursThisWeek}</span></div>
      <div class="card-meta-row"><span>Open tasks</span><span>${openTasks}</span></div>
    </div>
    <div id="languages-${project.id}"></div>
  `;
  card.addEventListener("click", () => openProjectDetail(project));
  return card;
}

async function loadLanguagesForCard(repoUrl, projectId) {
  const container = document.getElementById(`languages-${projectId}`);
  if (!container) return;

  const parsed = parseGithubRepo(repoUrl);
  if (!parsed) {
    console.warn(`Could not parse GitHub URL: ${repoUrl}`);
    return;
  }

  try {
    const info = await fetchRepoInfo(parsed.owner, parsed.repo);
    if (info.notFound) {
      console.warn(`GitHub repo not found: ${parsed.owner}/${parsed.repo}`);
      return;
    }
    if (Object.keys(info.languages).length === 0) {
      console.info(`No language data for: ${parsed.owner}/${parsed.repo}`);
      return;
    }

    const bar = renderLanguageBar(info.languages);
    container.innerHTML = `<div style="margin-top: var(--space-4); font-size: var(--font-size-xs);">${bar}</div>`;
  } catch (error) {
    console.error(`Failed to load languages for ${repoUrl}:`, error);
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
  const [projects, hoursByProject, openTasksByProject] = await Promise.all([
    fetchProjects(),
    fetchHoursThisWeek(),
    fetchOpenTaskCounts(),
  ]);

  // Get health status for all projects
  const projectHealthMap = {};
  Object.keys(healthMonitor.config).forEach((key) => {
    const config = healthMonitor.config[key];
    const projectName = config.name;
    projectHealthMap[projectName] = healthMonitor.status[key] || null;
  });

  const cards = [
    renderNewProjectCard(),
    ...projects.map((project) => {
      const healthStatus = projectHealthMap[project.name];
      return renderProjectCard(
        project,
        hoursByProject[project.id] || 0,
        openTasksByProject[project.id] || 0,
        healthStatus
      );
    })
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
  const vercelUrl = (project.links && project.links.vercel) || "";
  const supabaseUrl = (project.links && project.links.supabase) || "";

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

  // Get health status and Supabase info
  const configKey = Object.keys(healthMonitor.config).find(k => healthMonitor.config[k].name === project.name);
  const config = configKey ? healthMonitor.config[configKey] : null;
  const healthStatus = config ? healthMonitor.status[configKey] : null;
  const deploymentColor = healthStatus ? healthMonitor.getStatusColor(healthStatus.deployment) : "#999";
  const supabaseColor = healthStatus ? healthMonitor.getStatusColor(healthStatus.supabase) : "#999";

  // Extract project ID from Supabase URL (e.g., "https://kndpvdixtlirwgsqvgjh.supabase.co" -> "kndpvdixtlirwgsqvgjh")
  const supabaseProjectId = config ? config.supabaseUrl.match(/https:\/\/([a-z0-9]+)\.supabase\.co/)?.[1] : null;
  const supabaseDashboardUrl = supabaseProjectId ? `https://app.supabase.com/project/${supabaseProjectId}/advisors?type=security` : null;

  let healthHtml = "";
  if (healthStatus && config) {
    healthHtml = `
      <div style="background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--radius-md); padding: var(--space-4); margin-bottom: var(--space-5);">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--space-3);">
          <h3 style="margin: 0;">System Health</h3>
          ${supabaseDashboardUrl ? `<a href="${supabaseDashboardUrl}" target="_blank" rel="noopener noreferrer" style="color: var(--color-accent); text-decoration: none; font-size: var(--font-size-sm); border: 1px solid var(--color-accent); padding: var(--space-2) var(--space-3); border-radius: var(--radius-sm); cursor: pointer;">View Supabase Advisors →</a>` : ''}
        </div>
        <div style="display: flex; gap: var(--space-4); flex-wrap: wrap;">
          <div style="flex: 1; min-width: 150px;">
            <p style="font-size: var(--font-size-xs); color: var(--color-text-muted); margin: 0 0 var(--space-2);">Deployment</p>
            <div style="display: flex; align-items: center; gap: var(--space-2);">
              <span style="font-size: 20px; color: ${deploymentColor};">●</span>
              <span>${escapeHtml(healthStatus.deployment)}</span>
            </div>
          </div>
          <div style="flex: 1; min-width: 150px;">
            <p style="font-size: var(--font-size-xs); color: var(--color-text-muted); margin: 0 0 var(--space-2);">Database</p>
            <div style="display: flex; align-items: center; gap: var(--space-2);">
              <span style="font-size: 20px; color: ${supabaseColor};">●</span>
              <span>${escapeHtml(healthStatus.supabase)}</span>
            </div>
          </div>
        </div>
        <p style="font-size: var(--font-size-xs); color: var(--color-text-muted); margin: var(--space-3) 0 0; line-height: 1.5;">
          <strong>What needs attention:</strong> Click "View Supabase Advisors" to see security issues (RLS, exposed functions) and performance recommendations.
        </p>
      </div>
    `;
  }

  container.innerHTML = `
    <h2>${escapeHtml(project.name)}</h2>
    <p class="lead-detail-contact">${escapeHtml(formatMilestone(project))}</p>

    ${healthHtml}

    <h3>Project Links</h3>
    <form id="repo-link-form" class="dialog-form">
      <label>GitHub repo
        <input type="text" name="repoUrl" value="${escapeHtml(repoUrl)}" placeholder="https://github.com/owner/repo" />
      </label>
      <label>Vercel deployment
        <input type="text" name="vercelUrl" value="${escapeHtml(vercelUrl)}" placeholder="https://project.vercel.app or https://custom-domain.app" />
      </label>
      <label>Supabase project
        <input type="text" name="supabaseUrl" value="${escapeHtml(supabaseUrl)}" placeholder="https://project.supabase.co" />
      </label>
      <button type="submit" class="btn btn-secondary">Save project links</button>
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
    const formData = new FormData(event.target);
    const githubUrl = formData.get("repoUrl").trim();
    const vercelUrl = formData.get("vercelUrl").trim();
    const supabaseUrl = formData.get("supabaseUrl").trim();

    const updatedLinks = {
      ...(project.links || {}),
      github: githubUrl || null,
      vercel: vercelUrl || null,
      supabase: supabaseUrl || null
    };

    const { error } = await supabaseClient.from("projects").update({ links: updatedLinks }).eq("id", project.id);
    if (error) {
      alert(`Couldn't save project links: ${error.message}`);
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

// Initialize health monitor
healthMonitor.startAutoCheck();

renderDashboard().catch((error) => {
  console.error("Failed to load dashboard:", error);
  document.getElementById("project-grid").innerHTML =
    '<p style="color: var(--color-danger);">Couldn\'t load projects. Check the console for details.</p>';
});
