const STATUSES = [
  { key: "today", label: "Today" },
  { key: "this_week", label: "This week" },
  { key: "done", label: "Done" },
];

let tasksCache = [];
let projectsCache = [];
let activeFilter = "";

async function fetchProjects() {
  const { data, error } = await supabaseClient.from("projects").select("id, name").order("name");
  if (error) throw error;
  return data;
}

async function fetchTasks() {
  const { data, error } = await supabaseClient
    .from("tasks")
    .select("id, title, status, project_id, projects(name)")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}

function populateProjectSelects() {
  const options = projectsCache.map((p) => `<option value="${p.id}">${p.name}</option>`).join("");

  const filterSelect = document.getElementById("project-filter");
  filterSelect.innerHTML = `<option value="">All projects</option>${options}`;

  document.getElementById("task-project-select").innerHTML = options;
}

function renderTaskCard(task) {
  const card = document.createElement("div");
  card.className = "task-card";
  card.innerHTML = `
    <div class="task-card-top">
      <span class="task-title">${task.title}</span>
      <button type="button" class="task-delete" aria-label="Delete task">×</button>
    </div>
    <div class="task-card-meta">
      <span class="tag">${task.projects?.name || "—"}</span>
      <select class="task-status-select">
        ${STATUSES.map(
          (s) => `<option value="${s.key}" ${s.key === task.status ? "selected" : ""}>${s.label}</option>`
        ).join("")}
      </select>
    </div>
  `;

  card.querySelector(".task-delete").addEventListener("click", () => deleteTask(task.id));
  card.querySelector(".task-status-select").addEventListener("change", (event) => {
    updateTaskStatus(task.id, event.target.value);
  });

  return card;
}

function renderBoard() {
  const board = document.getElementById("task-board");
  const filtered = activeFilter ? tasksCache.filter((t) => t.project_id === activeFilter) : tasksCache;

  board.replaceChildren(
    ...STATUSES.map((status) => {
      const columnTasks = filtered.filter((t) => t.status === status.key);
      const column = document.createElement("section");
      column.className = "pipeline-column";
      column.innerHTML = `<h3>${status.label} <span class="column-count">${columnTasks.length}</span></h3>`;
      const list = document.createElement("div");
      list.className = "pipeline-column-list";
      list.replaceChildren(...columnTasks.map(renderTaskCard));
      column.appendChild(list);
      return column;
    })
  );
}

async function loadTasks() {
  const [projects, tasks] = await Promise.all([fetchProjects(), fetchTasks()]);
  projectsCache = projects;
  tasksCache = tasks;
  populateProjectSelects();
  renderBoard();
}

async function updateTaskStatus(taskId, status) {
  const { error } = await supabaseClient
    .from("tasks")
    .update({ status, completed_at: status === "done" ? new Date().toISOString() : null })
    .eq("id", taskId);
  if (error) {
    alert(`Couldn't update task: ${error.message}`);
    return;
  }
  await loadTasks();
}

async function deleteTask(taskId) {
  const { error } = await supabaseClient.from("tasks").delete().eq("id", taskId);
  if (error) {
    alert(`Couldn't delete task: ${error.message}`);
    return;
  }
  await loadTasks();
}

document.getElementById("project-filter").addEventListener("change", (event) => {
  activeFilter = event.target.value;
  renderBoard();
});

document.getElementById("task-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const formData = new FormData(event.target);
  const { error } = await supabaseClient.from("tasks").insert({
    title: formData.get("title"),
    project_id: formData.get("projectId"),
    status: formData.get("status"),
  });
  if (error) {
    alert(`Couldn't add task: ${error.message}`);
    return;
  }
  event.target.reset();
  await loadTasks();
});

// --- Voice input ---
// Live dictation via the browser's built-in speech recognition — no audio
// file is kept, just the resulting text, filled into the title field as you
// talk. No API key or backend needed; support varies by browser (best in
// Chrome/Edge).

const SpeechRecognitionImpl = window.SpeechRecognition || window.webkitSpeechRecognition;

function setupVoiceInput() {
  const micBtn = document.getElementById("mic-btn");
  const titleInput = document.getElementById("task-title-input");

  if (!SpeechRecognitionImpl) {
    micBtn.disabled = true;
    micBtn.title = "Voice input isn't supported in this browser";
    return;
  }

  let recognition = null;
  let isRecording = false;
  let finalTranscript = "";

  function stopRecording() {
    isRecording = false;
    micBtn.classList.remove("recording");
    micBtn.textContent = "🎤";
  }

  micBtn.addEventListener("click", () => {
    if (isRecording) {
      recognition.stop();
      return;
    }

    recognition = new SpeechRecognitionImpl();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = navigator.language || "en-US";
    finalTranscript = titleInput.value ? `${titleInput.value} ` : "";

    recognition.onresult = (event) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += `${transcript} `;
        } else {
          interim += transcript;
        }
      }
      titleInput.value = (finalTranscript + interim).replace(/\s+/g, " ").trim();
    };

    recognition.onerror = (event) => {
      console.error("Speech recognition error:", event.error);
      stopRecording();
    };

    recognition.onend = stopRecording;

    recognition.start();
    isRecording = true;
    micBtn.classList.add("recording");
    micBtn.textContent = "⏹";
  });
}

setupVoiceInput();

loadTasks().catch((error) => {
  console.error("Failed to load tasks:", error);
  document.getElementById("task-board").innerHTML =
    '<p style="color: var(--color-danger);">Couldn\'t load tasks. Check the console for details.</p>';
});
