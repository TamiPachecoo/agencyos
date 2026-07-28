const STAGES = [
  { key: "new", label: "New lead" },
  { key: "discovery_scheduled", label: "Discovery scheduled" },
  { key: "prototype_in_progress", label: "Prototype in progress" },
  { key: "presented", label: "Presented" },
  { key: "won", label: "Won" },
  { key: "lost", label: "Lost" },
];

const PROTOTYPE_STATUSES = ["not_started", "building", "ready_to_present", "presented"];

let leadsCache = [];

async function fetchLeads() {
  const { data, error } = await supabaseClient
    .from("leads")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}

function formatLabel(value) {
  return value ? value.replace(/_/g, " ") : "";
}

function renderBoard(leads) {
  const board = document.getElementById("pipeline-board");
  board.replaceChildren(
    ...STAGES.map((stage) => {
      const stageLeads = leads.filter((lead) => lead.stage === stage.key);
      const column = document.createElement("section");
      column.className = "pipeline-column";
      column.innerHTML = `<h3>${stage.label} <span class="column-count">${stageLeads.length}</span></h3>`;
      const list = document.createElement("div");
      list.className = "pipeline-column-list";
      list.replaceChildren(...stageLeads.map(renderLeadCard));
      column.appendChild(list);
      return column;
    })
  );
}

function renderLeadCard(lead) {
  const notesCount = Array.isArray(lead.notes) ? lead.notes.length : 0;
  const card = document.createElement("button");
  card.type = "button";
  card.className = "lead-card";
  card.innerHTML = `
    <strong>${lead.business_name || lead.contact_name}</strong>
    ${lead.business_name ? `<span class="lead-card-contact">${lead.contact_name}</span>` : ""}
    <div class="lead-card-meta">
      ${lead.source ? `<span class="tag">${lead.source}</span>` : "<span></span>"}
      <span class="lead-card-notes">${notesCount} note${notesCount === 1 ? "" : "s"}</span>
    </div>
    ${lead.prototype_status ? `<span class="badge badge-progress">${formatLabel(lead.prototype_status)}</span>` : ""}
  `;
  card.addEventListener("click", () => openLeadDetail(lead.id));
  return card;
}

async function loadBoard() {
  leadsCache = await fetchLeads();
  renderBoard(leadsCache);
}

// --- New lead dialog ---

const newLeadDialog = document.getElementById("new-lead-dialog");
document.getElementById("new-lead-btn").addEventListener("click", () => newLeadDialog.showModal());

document.getElementById("new-lead-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.target;
  const formData = new FormData(form);
  const { error } = await supabaseClient.from("leads").insert({
    contact_name: formData.get("contactName"),
    business_name: formData.get("businessName") || null,
    source: formData.get("source") || null,
    contact_info: {
      email: formData.get("email") || null,
      phone: formData.get("phone") || null,
    },
  });
  if (error) {
    alert(`Couldn't add lead: ${error.message}`);
    return;
  }
  form.reset();
  newLeadDialog.close();
  await loadBoard();
});

// --- Lead detail dialog ---

const leadDetailDialog = document.getElementById("lead-detail-dialog");

function openLeadDetail(leadId) {
  const lead = leadsCache.find((item) => item.id === leadId);
  if (!lead) return;
  renderLeadDetail(lead);
  leadDetailDialog.showModal();
}

function renderLeadDetail(lead) {
  const notes = Array.isArray(lead.notes) ? [...lead.notes].reverse() : [];
  const contactInfo = lead.contact_info || {};
  const container = document.getElementById("lead-detail-content");

  container.innerHTML = `
    <h2>${lead.business_name || lead.contact_name}</h2>
    ${lead.business_name ? `<p class="lead-detail-contact">${lead.contact_name}</p>` : ""}
    <p class="lead-detail-contact">
      ${contactInfo.email ? `${contactInfo.email}` : ""}
      ${contactInfo.phone ? ` · ${contactInfo.phone}` : ""}
      ${lead.source ? ` · via ${lead.source}` : ""}
    </p>

    <label>Stage
      <select id="stage-select">
        ${STAGES.map(
          (s) => `<option value="${s.key}" ${s.key === lead.stage ? "selected" : ""}>${s.label}</option>`
        ).join("")}
      </select>
    </label>

    <h3>Discovery notes</h3>
    <div class="notes-log">
      ${
        notes.length
          ? notes.map((n) => `<div class="note"><span class="note-date">${n.date}</span><p>${n.text}</p></div>`).join("")
          : '<p class="lead-detail-contact">No notes yet.</p>'
      }
    </div>
    <form id="add-note-form" class="dialog-form">
      <textarea name="text" placeholder="What was said, when — pain points, workflow, anything the prototype should address" required></textarea>
      <button type="submit" class="btn btn-secondary">Add note</button>
    </form>

    <h3>Solution Prototype</h3>
    <form id="prototype-form" class="dialog-form">
      <label>Status
        <select name="status">
          <option value="">—</option>
          ${PROTOTYPE_STATUSES.map(
            (s) => `<option value="${s}" ${s === lead.prototype_status ? "selected" : ""}>${formatLabel(s)}</option>`
          ).join("")}
        </select>
      </label>
      <label>Link
        <input type="url" name="link" value="${lead.prototype_link || ""}" placeholder="Repo or preview URL" />
      </label>
      <label>What it demonstrates
        <textarea name="note">${lead.prototype_note || ""}</textarea>
      </label>
      <button type="submit" class="btn btn-secondary">Save prototype info</button>
    </form>

    ${lead.client_id ? '<p class="lead-detail-contact">✓ Converted to client</p>' : ""}

    <div class="dialog-actions">
      <button type="button" class="btn btn-secondary" data-close-dialog>Close</button>
    </div>
  `;

  document.getElementById("stage-select").addEventListener("change", async (event) => {
    const newStage = event.target.value;
    const ok = await handleStageChange(lead, newStage);
    if (!ok) {
      event.target.value = lead.stage;
      return;
    }
    await loadBoard();
    leadDetailDialog.close();
  });

  document.getElementById("add-note-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const text = new FormData(event.target).get("text");
    const notes = Array.isArray(lead.notes) ? lead.notes : [];
    const updatedNotes = [...notes, { date: new Date().toISOString().slice(0, 10), text }];
    const { error } = await supabaseClient.from("leads").update({ notes: updatedNotes }).eq("id", lead.id);
    if (error) {
      alert(`Couldn't add note: ${error.message}`);
      return;
    }
    await loadBoard();
    openLeadDetail(lead.id);
  });

  document.getElementById("prototype-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(event.target);
    const { error } = await supabaseClient
      .from("leads")
      .update({
        prototype_status: formData.get("status") || null,
        prototype_link: formData.get("link") || null,
        prototype_note: formData.get("note") || null,
      })
      .eq("id", lead.id);
    if (error) {
      alert(`Couldn't save prototype info: ${error.message}`);
      return;
    }
    await loadBoard();
    leadDetailDialog.close();
  });
}

async function handleStageChange(lead, newStage) {
  const notes = Array.isArray(lead.notes) ? lead.notes : [];
  if (newStage === "prototype_in_progress" && notes.length === 0) {
    alert(
      "Log at least one discovery note before moving this lead into prototype — that's what the prototype gets built from."
    );
    return false;
  }

  if (newStage === "won") {
    return convertToClient(lead);
  }

  const { error } = await supabaseClient.from("leads").update({ stage: newStage }).eq("id", lead.id);
  if (error) {
    alert(`Couldn't update stage: ${error.message}`);
    return false;
  }
  return true;
}

async function convertToClient(lead) {
  let clientId = lead.client_id;

  if (!clientId) {
    const { data, error } = await supabaseClient
      .from("clients")
      .insert({ name: lead.business_name || lead.contact_name })
      .select()
      .single();
    if (error) {
      alert(`Couldn't create client: ${error.message}`);
      return false;
    }
    clientId = data.id;
  }

  const { error: updateError } = await supabaseClient
    .from("leads")
    .update({ stage: "won", client_id: clientId })
    .eq("id", lead.id);
  if (updateError) {
    alert(`Couldn't mark lead as won: ${updateError.message}`);
    return false;
  }
  return true;
}

// --- Dialog close buttons ---

document.querySelectorAll("[data-close-dialog]").forEach((btn) => {
  btn.addEventListener("click", () => btn.closest("dialog").close());
});

loadBoard().catch((error) => {
  console.error("Failed to load leads:", error);
  document.getElementById("pipeline-board").innerHTML =
    '<p style="color: var(--color-danger);">Couldn\'t load leads. Check the console for details.</p>';
});
