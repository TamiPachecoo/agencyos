// Technical Health Monitoring for Agency OS ecosystem
// Monitors: Agency OS, PERSEA, Amarelinha, VICAF

// Technical Health Monitoring Configuration
// Add Supabase keys here or leave them out to skip Supabase checks for that project
const HEALTH_CONFIG = {
  agencyOS: {
    name: "Agency OS",
    deploymentUrl: "https://agencyos-94rrdfan6-tami4.vercel.app/",
    supabaseUrl: "https://kndpvdixtlirwgsqvgjh.supabase.co",
    supabaseKey: "sb_publishable_IQylTt1QHL3TPk5FJe5UPw_sEGHWMMs",
  },
  persea: {
    name: "PERSEA",
    deploymentUrl: "https://metodopersea.vercel.app/",
    supabaseUrl: "https://kndpvdixtlirwgsqvgjh.supabase.co", // Shared with Agency OS
    supabaseKey: "sb_publishable_IQylTt1QHL3TPk5FJe5UPw_sEGHWMMs",
  },
  amarelinha: {
    name: "Amarelinha",
    deploymentUrl: "https://amarelinha-npisjsq6a-tami4.vercel.app/",
    supabaseUrl: "https://lwxssimdlibjdhtazfao.supabase.co",
    supabaseKey: "sb_publishable_GZfqIscF8eR6pVjNXI0DSA_RIK9LKXU",
  },
  vicaf: {
    name: "VICAF",
    deploymentUrl: "https://tamipachecoo.github.io/vicafponto/",
    supabaseUrl: "https://xuonzwvqqwbgcedidyie.supabase.co",
    supabaseKey: "sb_publishable_90r8S_3VdagojDIoPHe5Gg_Ief-vsnu",
  },
};

class HealthMonitor {
  constructor() {
    this.status = {};
    this.lastCheck = {};
    this.checkInterval = 60000; // Check every 60 seconds
  }

  async checkHealth(project) {
    const config = HEALTH_CONFIG[project];
    if (!config) return null;

    const status = {
      name: config.name,
      deployment: "unknown",
      supabase: "unknown",
      lastCheck: new Date(),
    };

    // Check deployment URL
    try {
      const deployResponse = await fetch(config.deploymentUrl, {
        method: "HEAD",
        mode: "no-cors",
        cache: "no-store",
      });
      status.deployment = "healthy";
    } catch (error) {
      console.warn(`Deployment check failed for ${config.name}:`, error.message);
      status.deployment = "error";
    }

    // Check Supabase connectivity (skip if key is not configured)
    if (config.supabaseUrl && config.supabaseKey) {
      try {
        const supabaseClient = window.supabase.createClient(
          config.supabaseUrl,
          config.supabaseKey
        );
        const { data, error } = await supabaseClient
          .from("projects")
          .select("id")
          .limit(1);

        if (error && error.message.includes("401")) {
          status.supabase = "auth_error";
        } else if (error) {
          status.supabase = "connection_error";
        } else {
          status.supabase = "healthy";
        }
      } catch (error) {
        console.warn(`Supabase check failed for ${config.name}:`, error.message);
        status.supabase = "error";
      }
    } else {
      status.supabase = "not_configured";
    }

    // Determine overall status
    if (status.deployment === "error" || status.supabase === "error") {
      status.overall = "error";
    } else if (status.deployment === "error") {
      status.overall = "error";
    } else if (status.deployment === "healthy" && (status.supabase === "healthy" || status.supabase === "not_configured")) {
      status.overall = "healthy";
    } else {
      status.overall = "needs_attention";
    }

    this.status[project] = status;
    this.lastCheck[project] = new Date();
    return status;
  }

  async checkAllProjects() {
    const projects = Object.keys(HEALTH_CONFIG);
    await Promise.all(projects.map((p) => this.checkHealth(p)));
    return this.status;
  }

  getStatusColor(status) {
    switch (status) {
      case "healthy":
        return "var(--color-success)";
      case "error":
        return "var(--color-danger)";
      case "needs_attention":
        return "var(--color-warning)";
      case "not_configured":
      case "unknown":
        return "var(--color-text-faint)";
      default:
        return "var(--color-text-muted)";
    }
  }

  getStatusIcon(status) {
    switch (status) {
      case "healthy":
        return "✓";
      case "error":
        return "✕";
      case "needs_attention":
        return "⚠";
      case "not_configured":
        return "?";
      case "unknown":
        return "—";
      default:
        return "—";
    }
  }

  renderHealthPanel() {
    const panel = document.createElement("div");
    panel.id = "health-monitor-panel";
    panel.className = "health-panel";

    const header = document.createElement("div");
    header.className = "health-header";
    header.innerHTML = `
      <h3>System Health</h3>
      <button id="health-refresh-btn" class="health-refresh-btn" title="Refresh status">↻</button>
    `;

    const statusGrid = document.createElement("div");
    statusGrid.className = "health-grid";

    const projects = Object.keys(HEALTH_CONFIG);
    projects.forEach((key) => {
      const projectStatus = this.status[key];
      if (!projectStatus) return;

      const card = document.createElement("div");
      card.className = `health-card health-${projectStatus.overall}`;

      const deployColor = this.getStatusColor(projectStatus.deployment);
      const supabaseColor = this.getStatusColor(projectStatus.supabase);
      const deployIcon = this.getStatusIcon(projectStatus.deployment);
      const supabaseIcon = this.getStatusIcon(projectStatus.supabase);

      card.innerHTML = `
        <div class="health-card-name">${escapeHtml(projectStatus.name)}</div>
        <div class="health-card-statuses">
          <div class="health-status-row">
            <span class="health-label">Deploy</span>
            <span class="health-indicator" style="color: ${deployColor};" title="${projectStatus.deployment}">
              ${deployIcon}
            </span>
          </div>
          <div class="health-status-row">
            <span class="health-label">DB</span>
            <span class="health-indicator" style="color: ${supabaseColor};" title="${projectStatus.supabase}">
              ${supabaseIcon}
            </span>
          </div>
        </div>
        <div class="health-card-time">
          ${this.formatLastCheck(projectStatus.lastCheck)}
        </div>
      `;

      statusGrid.appendChild(card);
    });

    panel.appendChild(header);
    panel.appendChild(statusGrid);

    // Add refresh listener
    const refreshBtn = panel.querySelector("#health-refresh-btn");
    refreshBtn.addEventListener("click", () => {
      this.checkAllProjects().then(() => {
        // Re-render the panel
        const existingPanel = document.getElementById("health-monitor-panel");
        if (existingPanel) {
          const newPanel = this.renderHealthPanel();
          existingPanel.replaceWith(newPanel);
        }
      });
    });

    return panel;
  }

  formatLastCheck(date) {
    const now = new Date();
    const diff = Math.floor((now - date) / 1000); // seconds

    if (diff < 60) return "just now";
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return date.toLocaleDateString();
  }

  startAutoCheck() {
    // Initial check
    this.checkAllProjects().then(() => {
      this.updateProjectCards();
    });

    // Set up periodic checks
    setInterval(() => {
      this.checkAllProjects().then(() => {
        this.updateProjectCards();
      });
    }, this.checkInterval);
  }

  updateProjectCards() {
    // Update health status on all visible project cards
    Object.keys(this.config).forEach((key) => {
      const config = this.config[key];
      const projectName = config.name;
      const status = this.status[key];

      if (!status) return;

      // Find and update the card header's health badge
      const cards = document.querySelectorAll(".project-card");
      cards.forEach((card) => {
        const projectTitle = card.querySelector("h2")?.textContent;
        if (projectTitle === projectName) {
          const badge = card.querySelector(".card-health-badge");
          if (badge) {
            const deployIcon = this.getStatusIcon(status.deployment);
            const supabaseIcon = this.getStatusIcon(status.supabase);
            const deployColor = this.getStatusColor(status.deployment);
            const supabaseColor = this.getStatusColor(status.supabase);

            badge.innerHTML = `
              <span class="health-dot" style="color: ${deployColor};" title="Deployment: ${status.deployment}">●</span>
              <span class="health-dot" style="color: ${supabaseColor};" title="Database: ${status.supabase}">●</span>
            `;
          }
        }
      });
    });
  }
}

// Create a singleton instance
const healthMonitor = new HealthMonitor();

// Export config for dashboard
healthMonitor.config = HEALTH_CONFIG;
