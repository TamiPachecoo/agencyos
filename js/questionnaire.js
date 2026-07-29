async function init() {
  const container = document.getElementById("questionnaire-content");
  const token = new URLSearchParams(window.location.search).get("token");

  if (!token) {
    container.innerHTML = '<div class="error"><p>This link is missing its token.</p></div>';
    return;
  }

  try {
    // Fetch questionnaire metadata
    const { data: questionnaire, error } = await supabaseClient
      .from("project_questionnaires")
      .select("id, file_name, file_path")
      .eq("share_token", token)
      .maybeSingle();

    if (error) throw error;
    if (!questionnaire) {
      container.innerHTML = '<div class="error"><p>This questionnaire link is not valid.</p></div>';
      return;
    }

    // Check if already submitted
    const { data: responses, error: responseError } = await supabaseClient
      .from("questionnaire_responses")
      .select("id")
      .eq("questionnaire_id", questionnaire.id)
      .limit(1);

    if (responseError) throw responseError;

    if (responses && responses.length > 0) {
      container.innerHTML = '<div class="card" style="margin: auto; padding: var(--space-6);"><h2>Thank you!</h2><p class="lead-detail-contact">You\'ve already submitted this questionnaire.</p></div>';
      return;
    }

    // Determine file type
    const isHtml = questionnaire.file_name.toLowerCase().endsWith(".html");
    const isPdf = questionnaire.file_name.toLowerCase().endsWith(".pdf");

    if (isHtml) {
      // Load HTML file and embed it
      await loadHtmlQuestionnaire(container, questionnaire);
    } else {
      // For PDF and other types, show in iframe
      await loadFileQuestionnaire(container, questionnaire);
    }
  } catch (error) {
    console.error("Failed to load questionnaire:", error);
    container.innerHTML = '<div class="error"><p>Couldn\'t load this questionnaire. Check the console for details.</p></div>';
  }
}

async function loadHtmlQuestionnaire(container, questionnaire) {
  try {
    // Get the public URL for the file
    const { data } = supabaseClient.storage
      .from("questionnaires")
      .getPublicUrl(questionnaire.file_path);

    const fileUrl = data.publicUrl;

    // Fetch the HTML content
    const response = await fetch(fileUrl);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    let htmlContent = await response.text();

    // Wrap the content to ensure it's properly styled
    const wrappedHtml = `
      <style>
        body {
          margin: 0;
          padding: var(--space-4);
          background: var(--color-bg);
        }
        .questionnaire-wrapper {
          max-width: 560px;
          margin: 0 auto;
        }
      </style>
      <div class="questionnaire-wrapper">
        ${htmlContent}
      </div>
    `;

    // Create an iframe to isolate the content
    const iframe = document.createElement("iframe");
    iframe.id = "questionnaire-container";
    iframe.style.width = "100%";
    iframe.style.height = "100%";
    iframe.style.border = "none";
    iframe.style.boxSizing = "border-box";

    container.innerHTML = "";
    container.appendChild(iframe);

    // Write HTML to iframe
    const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
    iframeDoc.open();
    iframeDoc.write(wrappedHtml);
    iframeDoc.close();

    // Inject form interception
    setTimeout(() => {
      const forms = iframeDoc.querySelectorAll("form");
      forms.forEach((form) => {
        form.addEventListener("submit", async (event) => {
          event.preventDefault();
          await captureAndSubmitResponse(questionnaire.id, form, iframeDoc);
        });
      });
    }, 100);
  } catch (error) {
    console.error("Failed to load HTML questionnaire:", error);
    throw error;
  }
}

async function loadFileQuestionnaire(container, questionnaire) {
  // For PDF and other file types, show in iframe using public URL
  const { data } = supabaseClient.storage
    .from("questionnaires")
    .getPublicUrl(questionnaire.file_path);

  const fileUrl = data.publicUrl;

  const iframe = document.createElement("iframe");
  iframe.id = "questionnaire-container";
  iframe.src = fileUrl;
  iframe.style.width = "100%";
  iframe.style.height = "100%";
  iframe.style.border = "none";

  container.innerHTML = "";
  container.appendChild(iframe);

  // For non-HTML files, show a note about manual submission
  const note = document.createElement("div");
  note.style.position = "fixed";
  note.style.bottom = "var(--space-4)";
  note.style.right = "var(--space-4)";
  note.style.background = "var(--color-bg-secondary)";
  note.style.padding = "var(--space-4)";
  note.style.borderRadius = "var(--radius-md)";
  note.style.maxWidth = "300px";
  note.style.fontSize = "var(--font-size-sm)";
  note.innerHTML = '<p style="margin: 0;">After completing this questionnaire, please save and send it back to confirm submission.</p>';
  document.body.appendChild(note);
}

async function captureAndSubmitResponse(questionnaireId, form, iframeDoc) {
  try {
    const formData = new FormData(form);
    const responseData = {};

    // Capture all form fields
    for (const [key, value] of formData.entries()) {
      if (!responseData[key]) {
        responseData[key] = value;
      } else if (Array.isArray(responseData[key])) {
        responseData[key].push(value);
      } else {
        responseData[key] = [responseData[key], value];
      }
    }

    // Submit to database
    const { error } = await supabaseClient
      .from("questionnaire_responses")
      .insert({
        questionnaire_id: questionnaireId,
        response_data: responseData,
      });

    if (error) throw error;

    // Show success message in iframe
    const successHtml = `
      <style>
        body { margin: 0; padding: var(--space-6); background: var(--color-bg); font-family: system-ui; }
        .success { max-width: 560px; margin: 50px auto; text-align: center; }
        h2 { color: var(--color-text); margin-top: 0; }
        p { color: var(--color-text-secondary); line-height: 1.5; }
      </style>
      <div class="success">
        <h2>Thank you!</h2>
        <p>Your responses have been submitted successfully.</p>
        <p style="font-size: 0.9em; margin-top: 2em;">You can close this window.</p>
      </div>
    `;

    iframeDoc.open();
    iframeDoc.write(successHtml);
    iframeDoc.close();
  } catch (error) {
    console.error("Failed to submit response:", error);
    alert(`Couldn't submit your response: ${error.message}`);
  }
}

init().catch((error) => {
  console.error("Questionnaire initialization failed:", error);
  document.getElementById("questionnaire-content").innerHTML =
    '<div class="error"><p>Something went wrong. Check the console for details.</p></div>';
});
