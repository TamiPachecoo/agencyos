function escapeHtml(value) {
  if (value == null) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

async function init() {
  const container = document.getElementById("discovery-content");
  const token = new URLSearchParams(window.location.search).get("token");

  if (!token) {
    container.innerHTML = '<p style="color: var(--color-danger);">This link is missing its token.</p>';
    return;
  }

  const { data: form, error } = await supabaseClient
    .from("discovery_forms")
    .select("id, questions, answers, submitted_at, leads(business_name, contact_name)")
    .eq("share_token", token)
    .maybeSingle();

  if (error) {
    console.error(error);
    container.innerHTML =
      '<p style="color: var(--color-danger);">Couldn\'t load this questionnaire. Check the console for details.</p>';
    return;
  }
  if (!form) {
    container.innerHTML = '<p style="color: var(--color-danger);">This link isn\'t valid.</p>';
    return;
  }
  if (form.answers) {
    container.innerHTML = `
      <h2>Thanks!</h2>
      <p class="lead-detail-contact">You already submitted this questionnaire${
        form.submitted_at ? ` on ${escapeHtml(form.submitted_at.slice(0, 10))}` : ""
      }.</p>
    `;
    return;
  }

  const businessName = form.leads?.business_name || form.leads?.contact_name || "";
  const questions = form.questions || [];

  container.innerHTML = `
    <h2>Discovery Questionnaire</h2>
    ${businessName ? `<p class="lead-detail-contact">For ${escapeHtml(businessName)}</p>` : ""}
    <form id="discovery-form" class="dialog-form">
      ${questions
        .map(
          (q, i) => `
        <label>${escapeHtml(q)}
          <textarea name="answer-${i}" required></textarea>
        </label>`
        )
        .join("")}
      <button type="submit" class="btn btn-primary">Submit answers</button>
    </form>
  `;

  document.getElementById("discovery-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(event.target);
    const answers = questions.map((q, i) => ({ question: q, answer: formData.get(`answer-${i}`) || "" }));
    const { error: submitError } = await supabaseClient
      .from("discovery_forms")
      .update({ answers, submitted_at: new Date().toISOString() })
      .eq("id", form.id);
    if (submitError) {
      alert(`Couldn't submit: ${submitError.message}`);
      return;
    }
    container.innerHTML = '<h2>Thanks!</h2><p class="lead-detail-contact">Your answers have been submitted.</p>';
  });
}

init().catch((error) => {
  console.error("Failed to load discovery form:", error);
  document.getElementById("discovery-content").innerHTML =
    '<p style="color: var(--color-danger);">Something went wrong. Check the console for details.</p>';
});
