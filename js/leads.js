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

function escapeHtml(value) {
  if (value == null) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

async function fetchLeads() {
  const { data, error } = await supabaseClient
    .from("leads")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}

async function fetchDiscoveryForm(leadId) {
  const { data, error } = await supabaseClient
    .from("discovery_forms")
    .select("id, questions, answers, share_token, submitted_at")
    .eq("lead_id", leadId)
    .maybeSingle();
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
    <strong>${escapeHtml(lead.business_name || lead.contact_name)}</strong>
    ${lead.business_name ? `<span class="lead-card-contact">${escapeHtml(lead.contact_name)}</span>` : ""}
    <div class="lead-card-meta">
      ${lead.source ? `<span class="tag">${escapeHtml(lead.source)}</span>` : "<span></span>"}
      <span class="lead-card-notes">${notesCount} note${notesCount === 1 ? "" : "s"}</span>
    </div>
    ${lead.prototype_status ? `<span class="badge badge-progress">${escapeHtml(formatLabel(lead.prototype_status))}</span>` : ""}
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

async function openLeadDetail(leadId) {
  const lead = leadsCache.find((item) => item.id === leadId);
  if (!lead) return;
  leadDetailDialog.showModal();
  const discoveryForm = await fetchDiscoveryForm(lead.id);
  renderLeadDetail(lead, discoveryForm);
}

function discoveryLink(token) {
  return new URL(`discovery.html?token=${token}`, window.location.href).href;
}

function renderQuestionBuilder(existingQuestions) {
  const questions = existingQuestions && existingQuestions.length ? existingQuestions : ["", "", ""];
  return `
    <p class="lead-detail-contact">Build a short questionnaire and send the client a link — answers come back here.</p>
    <div id="question-rows">
      ${questions
        .map(
          (q) => `
        <div class="question-row">
          <input type="text" class="question-input" value="${escapeHtml(q)}" placeholder="Question" />
          <button type="button" class="btn btn-secondary remove-question">×</button>
        </div>`
        )
        .join("")}
    </div>
    <div class="dialog-actions">
      <button type="button" class="btn btn-secondary" id="add-question-btn">+ Add question</button>
      <button type="button" class="btn btn-primary" id="save-workbook-btn">Save &amp; get link</button>
    </div>
  `;
}

function renderDiscoveryWorkbook(form) {
  if (!form) return renderQuestionBuilder();

  if (form.answers) {
    return `
      <p class="lead-detail-contact">Completed ${escapeHtml((form.submitted_at || "").slice(0, 10))}.</p>
      ${form.answers
        .map((a) => `<div class="note"><strong>${escapeHtml(a.question)}</strong><p>${escapeHtml(a.answer)}</p></div>`)
        .join("")}
      <div class="dialog-actions">
        <button type="button" class="btn btn-secondary" id="reset-workbook-btn">Clear responses &amp; resend</button>
      </div>
    `;
  }

  const link = discoveryLink(form.share_token);
  return `
    <p class="lead-detail-contact">Sent — awaiting response. Share this link with the client:</p>
    <div class="dialog-form">
      <input type="text" id="workbook-link" readonly value="${escapeHtml(link)}" />
    </div>
    <div class="dialog-actions">
      <button type="button" class="btn btn-secondary" id="copy-link-btn">Copy link</button>
      <button type="button" class="btn btn-secondary" id="edit-questions-btn">Edit questions</button>
    </div>
    <h3>Questions</h3>
    <ul class="workbook-questions">
      ${(form.questions || []).map((q) => `<li>${escapeHtml(q)}</li>`).join("")}
    </ul>
  `;
}

function mountDiscoveryWorkbook(lead, form) {
  const container = document.getElementById("discovery-workbook-container");
  container.innerHTML = renderDiscoveryWorkbook(form);
  wireDiscoveryWorkbook(lead, form, container);
}

function wireDiscoveryWorkbook(lead, form, container) {
  const addBtn = container.querySelector("#add-question-btn");
  if (addBtn) {
    addBtn.addEventListener("click", () => {
      const row = document.createElement("div");
      row.className = "question-row";
      row.innerHTML = `<input type="text" class="question-input" placeholder="Question" /><button type="button" class="btn btn-secondary remove-question">×</button>`;
      container.querySelector("#question-rows").appendChild(row);
      row.querySelector(".remove-question").addEventListener("click", () => row.remove());
    });
  }

  container.querySelectorAll(".remove-question").forEach((btn) => {
    btn.addEventListener("click", () => btn.closest(".question-row").remove());
  });

  const saveBtn = container.querySelector("#save-workbook-btn");
  if (saveBtn) {
    saveBtn.addEventListener("click", async () => {
      const questions = [...container.querySelectorAll(".question-input")]
        .map((input) => input.value.trim())
        .filter(Boolean);
      if (questions.length === 0) {
        alert("Add at least one question.");
        return;
      }
      const { data, error } = await supabaseClient
        .from("discovery_forms")
        .upsert({ lead_id: lead.id, questions, answers: null, submitted_at: null }, { onConflict: "lead_id" })
        .select("id, questions, answers, share_token, submitted_at")
        .single();
      if (error) {
        alert(`Couldn't save workbook: ${error.message}`);
        return;
      }
      mountDiscoveryWorkbook(lead, data);
    });
  }

  const copyBtn = container.querySelector("#copy-link-btn");
  if (copyBtn) {
    copyBtn.addEventListener("click", async () => {
      const link = container.querySelector("#workbook-link").value;
      try {
        await navigator.clipboard.writeText(link);
        copyBtn.textContent = "Copied!";
        setTimeout(() => (copyBtn.textContent = "Copy link"), 1500);
      } catch {
        alert(`Copy this link:\n${link}`);
      }
    });
  }

  const editBtn = container.querySelector("#edit-questions-btn");
  if (editBtn) {
    editBtn.addEventListener("click", () => {
      container.innerHTML = renderQuestionBuilder(form.questions || []);
      wireDiscoveryWorkbook(lead, form, container);
    });
  }

  const resetBtn = container.querySelector("#reset-workbook-btn");
  if (resetBtn) {
    resetBtn.addEventListener("click", async () => {
      if (!confirm("Clear the client's answers and reopen this workbook for resend?")) return;
      const { data, error } = await supabaseClient
        .from("discovery_forms")
        .update({ answers: null, submitted_at: null })
        .eq("id", form.id)
        .select("id, questions, answers, share_token, submitted_at")
        .single();
      if (error) {
        alert(`Couldn't reset workbook: ${error.message}`);
        return;
      }
      mountDiscoveryWorkbook(lead, data);
    });
  }
}

function renderLeadDetail(lead, discoveryForm) {
  const notes = Array.isArray(lead.notes) ? [...lead.notes].reverse() : [];
  const contactInfo = lead.contact_info || {};
  const container = document.getElementById("lead-detail-content");

  container.innerHTML = `
    <h2>${escapeHtml(lead.business_name || lead.contact_name)}</h2>

    <form id="contact-form" class="dialog-form">
      <label>Contact name
        <input type="text" name="contactName" value="${escapeHtml(lead.contact_name)}" required />
      </label>
      <label>Business name
        <input type="text" name="businessName" value="${escapeHtml(lead.business_name || "")}" />
      </label>
      <label>Source
        <input type="text" name="source" value="${escapeHtml(lead.source || "")}" />
      </label>
      <label>Email
        <input type="email" name="email" value="${escapeHtml(contactInfo.email || "")}" />
      </label>
      <label>Phone
        <input type="tel" name="phone" value="${escapeHtml(contactInfo.phone || "")}" />
      </label>
      <button type="submit" class="btn btn-secondary">Save contact info</button>
    </form>

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
          ? notes
              .map((n) => `<div class="note"><span class="note-date">${escapeHtml(n.date)}</span><p>${escapeHtml(n.text)}</p></div>`)
              .join("")
          : '<p class="lead-detail-contact">No notes yet.</p>'
      }
    </div>
    <form id="add-note-form" class="dialog-form">
      <textarea name="text" placeholder="What was said, when — pain points, workflow, anything the prototype should address" required></textarea>
      <button type="submit" class="btn btn-secondary">Add note</button>
    </form>

    <h3>Discovery Workbook</h3>
    <div id="discovery-workbook-container"></div>

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
        <input type="url" name="link" value="${escapeHtml(lead.prototype_link || "")}" placeholder="Repo or preview URL" />
      </label>
      <label>What it demonstrates
        <textarea name="note">${escapeHtml(lead.prototype_note || "")}</textarea>
      </label>
      <button type="submit" class="btn btn-secondary">Save prototype info</button>
    </form>

    ${lead.client_id ? '<p class="lead-detail-contact">✓ Converted to client</p>' : ""}

    <div class="dialog-actions">
      <button type="button" class="btn btn-danger" id="delete-lead-btn">Delete lead</button>
      <button type="button" class="btn btn-secondary" data-close-dialog>Close</button>
    </div>
  `;

  mountDiscoveryWorkbook(lead, discoveryForm);

  document.getElementById("contact-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(event.target);
    const { error } = await supabaseClient
      .from("leads")
      .update({
        contact_name: formData.get("contactName"),
        business_name: formData.get("businessName") || null,
        source: formData.get("source") || null,
        contact_info: {
          email: formData.get("email") || null,
          phone: formData.get("phone") || null,
        },
      })
      .eq("id", lead.id);
    if (error) {
      alert(`Couldn't save contact info: ${error.message}`);
      return;
    }
    await loadBoard();
    await openLeadDetail(lead.id);
  });

  document.getElementById("delete-lead-btn").addEventListener("click", async () => {
    if (!confirm(`Delete ${lead.business_name || lead.contact_name}? This can't be undone.`)) return;
    const { error } = await supabaseClient.from("leads").delete().eq("id", lead.id);
    if (error) {
      alert(`Couldn't delete lead: ${error.message}`);
      return;
    }
    await loadBoard();
    leadDetailDialog.close();
  });

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
    await openLeadDetail(lead.id);
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
// Delegated so it also covers close buttons inside dynamically rendered
// dialog content (e.g. the lead detail dialog), not just ones present at load.

document.addEventListener("click", (event) => {
  const btn = event.target.closest("[data-close-dialog]");
  if (btn) btn.closest("dialog").close();
});

loadBoard().catch((error) => {
  console.error("Failed to load leads:", error);
  document.getElementById("pipeline-board").innerHTML =
    '<p style="color: var(--color-danger);">Couldn\'t load leads. Check the console for details.</p>';
});
