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
      .select("id", { count: "exact" })
      .eq("questionnaire_id", questionnaire.id)
      .limit(1);

    if (responseError) throw responseError;

    if (responses && responses.length > 0) {
      container.innerHTML = '<div class="card" style="margin: auto; padding: var(--space-6);"><h2>Thank you!</h2><p class="lead-detail-contact">You\'ve already submitted this questionnaire.</p></div>';
      return;
    }

    // Determine file type based on file_path (which contains the original filename with extension)
    const fileName = questionnaire.file_path.split('/').pop();
    const isHtml = fileName.toLowerCase().endsWith(".html");
    const isPdf = fileName.toLowerCase().endsWith(".pdf");
    const isZip = fileName.toLowerCase().endsWith(".zip");

    if (isZip) {
      // Load questionnaire from ZIP archive
      await loadZipQuestionnaire(container, questionnaire);
    } else if (isHtml) {
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

async function loadZipQuestionnaire(container, questionnaire) {
  try {
    const { data } = supabaseClient.storage
      .from("questionnaires")
      .getPublicUrl(questionnaire.file_path);

    const fileUrl = data.publicUrl;

    // Show loading indicator
    container.innerHTML = '<div class="loading"><p>Loading questionnaire...</p></div>';

    // Fetch the ZIP file
    const response = await fetch(fileUrl);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const zipArrayBuffer = await response.arrayBuffer();
    const zip = new JSZip();
    await zip.loadAsync(zipArrayBuffer);

    // Find index.html or the main HTML file
    let mainHtmlFile = null;
    let mainHtmlContent = null;

    // Look for index.html first
    if (zip.file("index.html")) {
      mainHtmlFile = zip.file("index.html");
    } else {
      // Find the first HTML file in the root
      zip.forEach((relativePath, file) => {
        if (!mainHtmlFile && relativePath.toLowerCase().endsWith(".html") && !relativePath.includes("/")) {
          mainHtmlFile = file;
        }
      });
    }

    if (!mainHtmlFile) {
      throw new Error("No HTML file found in questionnaire package");
    }

    mainHtmlContent = await mainHtmlFile.async("string");

    // Create a context for resolving relative paths within the ZIP
    const baseFolder = mainHtmlFile.name.substring(0, mainHtmlFile.name.lastIndexOf("/"));

    // Parse HTML and process relative assets
    const tempDiv = document.createElement("div");
    tempDiv.innerHTML = mainHtmlContent;

    // Replace relative image/script/link paths with data URLs or inline content
    const images = tempDiv.querySelectorAll("img");
    for (const img of images) {
      const src = img.getAttribute("src");
      if (src && !src.startsWith("http") && !src.startsWith("data:")) {
        const assetPath = baseFolder ? baseFolder + "/" + src : src;
        const assetFile = zip.file(assetPath);
        if (assetFile) {
          const assetData = await assetFile.async("arraybuffer");
          const blob = new Blob([assetData]);
          const url = URL.createObjectURL(blob);
          img.setAttribute("src", url);
        }
      }
    }

    // Handle stylesheets
    const links = tempDiv.querySelectorAll("link[rel='stylesheet']");
    for (const link of links) {
      const href = link.getAttribute("href");
      if (href && !href.startsWith("http") && !href.startsWith("data:")) {
        const assetPath = baseFolder ? baseFolder + "/" + href : href;
        const assetFile = zip.file(assetPath);
        if (assetFile) {
          const css = await assetFile.async("string");
          const style = document.createElement("style");
          style.textContent = css;
          tempDiv.insertBefore(style, link);
          link.remove();
        }
      }
    }

    // Handle scripts
    const scripts = tempDiv.querySelectorAll("script");
    const scriptPromises = [];
    for (const script of scripts) {
      const src = script.getAttribute("src");
      if (src && !src.startsWith("http") && !src.startsWith("data:")) {
        const assetPath = baseFolder ? baseFolder + "/" + src : src;
        const assetFile = zip.file(assetPath);
        if (assetFile) {
          scriptPromises.push(
            assetFile.async("string").then((content) => {
              const newScript = document.createElement("script");
              newScript.textContent = content;
              script.replaceWith(newScript);
            })
          );
        }
      }
    }

    await Promise.all(scriptPromises);

    // Find all forms and add submit handlers
    const forms = tempDiv.querySelectorAll("form");
    forms.forEach((form, index) => {
      form.id = form.id || `questionnaire-form-${index}`;
      form.addEventListener("submit", async (event) => {
        event.preventDefault();
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

        await captureAndSubmitResponse(questionnaire.id, responseData, container);
      });
    });

    // Render the modified HTML
    container.innerHTML = `<div style="padding: var(--space-4);">${tempDiv.innerHTML}</div>`;
  } catch (error) {
    console.error("Failed to load ZIP questionnaire:", error);
    container.innerHTML = `
      <div class="error">
        <p>Couldn't extract questionnaire: ${escapeHtml(error.message)}</p>
        <p class="lead-detail-contact" style="font-size: 0.9em; margin-top: var(--space-4);">
          Please check the file format or try again later.
        </p>
      </div>
    `;
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

    // Create a temporary container to parse and modify HTML
    const tempDiv = document.createElement("div");
    tempDiv.innerHTML = htmlContent;

    // Find all forms and add submit handlers
    const forms = tempDiv.querySelectorAll("form");
    forms.forEach((form, index) => {
      form.id = form.id || `questionnaire-form-${index}`;
      form.addEventListener("submit", async (event) => {
        event.preventDefault();
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

        await captureAndSubmitResponse(questionnaire.id, responseData, container);
      });
    });

    // Render the modified HTML
    container.innerHTML = `<div style="padding: var(--space-4);">${tempDiv.innerHTML}</div>`;
  } catch (error) {
    console.error("Failed to load HTML questionnaire:", error);
    throw error;
  }
}

async function loadFileQuestionnaire(container, questionnaire) {
  // For PDF and other file types, embed in iframe using public URL
  const { data } = supabaseClient.storage
    .from("questionnaires")
    .getPublicUrl(questionnaire.file_path);

  const fileUrl = data.publicUrl;

  // Create an HTML page that embeds the file
  const embedHtml = `
    <!doctype html>
    <html>
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>Questionnaire</title>
      <style>
        html, body { margin: 0; padding: 0; height: 100%; }
        body { overflow: hidden; }
        iframe { width: 100%; height: 100%; border: none; }
      </style>
    </head>
    <body>
      <iframe src="${escapeHtml(fileUrl)}" title="Questionnaire"></iframe>
    </body>
    </html>
  `;

  const blob = new Blob([embedHtml], { type: "text/html" });
  const objectUrl = URL.createObjectURL(blob);

  const iframe = document.createElement("iframe");
  iframe.src = objectUrl;
  iframe.style.width = "100%";
  iframe.style.height = "100%";
  iframe.style.border = "none";
  iframe.style.boxSizing = "border-box";

  container.innerHTML = "";
  container.appendChild(iframe);

  // Show a note about the document
  const note = document.createElement("div");
  note.style.position = "fixed";
  note.style.top = "var(--space-4)";
  note.style.right = "var(--space-4)";
  note.style.background = "var(--color-bg-subtle)";
  note.style.padding = "var(--space-4)";
  note.style.borderRadius = "var(--radius-md)";
  note.style.maxWidth = "300px";
  note.style.fontSize = "var(--font-size-sm)";
  note.style.zIndex = "1000";
  note.innerHTML = '<p style="margin: 0;"><strong>Note:</strong> After completing this questionnaire, your submission status will be tracked when responses are sent back.</p>';
  document.body.appendChild(note);
}

async function captureAndSubmitResponse(questionnaireId, responseData, container) {
  try {
    // Submit to database
    const { error } = await supabaseClient
      .from("questionnaire_responses")
      .insert({
        questionnaire_id: questionnaireId,
        response_data: responseData,
      });

    if (error) throw error;

    // Show success message
    container.innerHTML = `
      <div style="padding: var(--space-6); text-align: center;">
        <h2>Thank you!</h2>
        <p class="lead-detail-contact">Your responses have been submitted successfully.</p>
        <p class="lead-detail-contact" style="font-size: 0.9em; margin-top: 2em;">You can close this window.</p>
      </div>
    `;
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
