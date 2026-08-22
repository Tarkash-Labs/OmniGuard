/**
 * OmniGuard AI — Content Script
 * Injected into web pages to draw visual overlays (bounding boxes) around
 * detected dark patterns. Uses Shadow DOM for isolation and HTML5 Canvas
 * for precise, non-destructive rendering.
 *
 * Privacy: No page data is collected or stored by this script.
 */

// Category display configuration
const CATEGORY_CONFIG = {
  urgency_trap: { icon: "⏰", color: "#FF6B6B", label: "Urgency Trap" },
  disguised_click: { icon: "🎭", color: "#FFA94D", label: "Disguised Click" },
  sneak_into_basket: {
    icon: "🛒",
    color: "#FFD43B",
    label: "Sneak into Basket",
  },
  forced_continuity: {
    icon: "🔄",
    color: "#69DB7C",
    label: "Forced Continuity",
  },
  confirmshaming: { icon: "😢", color: "#748FFC", label: "Confirmshaming" },
  hidden_cost: { icon: "💰", color: "#E599F7", label: "Hidden Cost" },
};

// Track our overlay container
let overlayContainer = null;
let scrollTimeout = null;
let isAutoScanEnabled = false;

// Initialize auto-scan state
chrome.storage.local.get(["autoScanEnabled"], (result) => {
  isAutoScanEnabled = result.autoScanEnabled || false;
});

// Listen for toggle changes
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === "local" && changes.autoScanEnabled !== undefined) {
    isAutoScanEnabled = changes.autoScanEnabled.newValue;
  }
});

// ---------------------------------------------------------------------------
// Message Listener
// ---------------------------------------------------------------------------
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "DRAW_OVERLAYS") {
    drawOverlays(message.detections, message.riskLevel);
  } else if (message.type === "CLEAR_OVERLAYS") {
    clearOverlays();
  }
});

// ---------------------------------------------------------------------------
// Scroll Listener (Auto-Scan)
// ---------------------------------------------------------------------------
window.addEventListener("scroll", () => {
  if (!isAutoScanEnabled) return;

  // Immediately clear existing overlays
  clearOverlays();

  // Debounce the new scan request
  if (scrollTimeout) {
    clearTimeout(scrollTimeout);
  }

  scrollTimeout = setTimeout(() => {
    chrome.runtime.sendMessage({ type: "REQUEST_AUTO_SCAN" });
  }, 1500);
}, { passive: true });

// ---------------------------------------------------------------------------
// Overlay Management
// ---------------------------------------------------------------------------

/**
 * Draw bounding box overlays for all detected dark patterns.
 * Uses an isolated Shadow DOM container so we never conflict with page styles.
 */
function drawOverlays(detections, riskLevel) {
  // Clear any existing overlays first
  clearOverlays();

  if (!detections || detections.length === 0) return;

  // Create overlay host element
  overlayContainer = document.createElement("div");
  overlayContainer.id = "omniguard-overlay-host";
  overlayContainer.style.cssText = `
    position: fixed !important;
    top: 0 !important;
    left: 0 !important;
    width: 100vw !important;
    height: 100vh !important;
    pointer-events: none !important;
    z-index: 2147483647 !important;
  `;

  // Attach Shadow DOM for style isolation
  const shadow = overlayContainer.attachShadow({ mode: "closed" });

  // Inject styles into shadow root
  const styleEl = document.createElement("style");
  styleEl.textContent = getOverlayStyles();
  shadow.appendChild(styleEl);

  // Create overlay container inside shadow
  const container = document.createElement("div");
  container.className = "og-container";
  shadow.appendChild(container);

  // Get viewport dimensions for coordinate mapping
  const vpWidth = window.innerWidth;
  const vpHeight = window.innerHeight;

  // Draw each detection
  detections.forEach((detection, index) => {
    const box = createBoundingBox(detection, index, vpWidth, vpHeight);
    container.appendChild(box);
  });

  // Add summary badge
  const badge = createSummaryBadge(detections.length, riskLevel);
  container.appendChild(badge);

  // Append to page
  document.documentElement.appendChild(overlayContainer);

  console.log(
    `🛡️ OmniGuard: Drew ${detections.length} overlay(s) on page`
  );
}

/**
 * Remove all OmniGuard overlays from the page.
 */
function clearOverlays() {
  if (overlayContainer) {
    overlayContainer.remove();
    overlayContainer = null;
  }
  // Also clean up any orphaned containers
  const existing = document.getElementById("omniguard-overlay-host");
  if (existing) existing.remove();
}

// ---------------------------------------------------------------------------
// UI Construction
// ---------------------------------------------------------------------------

/**
 * Create a single bounding box overlay for a detection.
 */
function createBoundingBox(detection, index, vpWidth, vpHeight) {
  const { bbox, category, label, description, risk_score, deceptive_text } =
    detection;
  const config = CATEGORY_CONFIG[category] || {
    icon: "⚠️",
    color: "#FFA94D",
    label: category,
  };

  // Convert normalized coordinates (0-1) to pixel positions
  const left = bbox.x * vpWidth;
  const top = bbox.y * vpHeight;
  const width = bbox.w * vpWidth;
  const height = bbox.h * vpHeight;

  // Bounding box wrapper
  const box = document.createElement("div");
  box.className = "og-bbox";
  box.style.cssText = `
    left: ${left}px;
    top: ${top}px;
    width: ${width}px;
    height: ${height}px;
    --box-color: ${config.color};
    animation-delay: ${index * 0.08}s;
  `;

  // Corner markers for visual emphasis
  const corners = ["tl", "tr", "bl", "br"];
  corners.forEach((pos) => {
    const corner = document.createElement("div");
    corner.className = `og-corner og-corner-${pos}`;
    box.appendChild(corner);
  });

  // Category label tag
  const tag = document.createElement("div");
  tag.className = "og-tag";
  tag.innerHTML = `
    <span class="og-tag-icon">${config.icon}</span>
    <span class="og-tag-label">${config.label}</span>
    <span class="og-tag-score">${Math.round(risk_score * 100)}%</span>
  `;
  box.appendChild(tag);

  // Tooltip (shown on hover — pointer-events enabled for this)
  const tooltip = document.createElement("div");
  tooltip.className = "og-tooltip";
  tooltip.innerHTML = `
    <div class="og-tooltip-header">
      <span>${config.icon} ${label}</span>
      <span class="og-tooltip-score" style="color: ${config.color}">${Math.round(risk_score * 100)}%</span>
    </div>
    <p class="og-tooltip-desc">${description}</p>
    ${deceptive_text ? `<div class="og-tooltip-quote">"${deceptive_text}"</div>` : ""}
  `;
  box.appendChild(tooltip);

  // Make box interactive for hover
  box.style.pointerEvents = "auto";

  return box;
}

/**
 * Create the summary badge shown in the top-right corner.
 */
function createSummaryBadge(count, riskLevel) {
  const riskColors = {
    safe: "#69DB7C",
    low: "#A9E34B",
    medium: "#FFD43B",
    high: "#FFA94D",
    critical: "#FF6B6B",
  };

  const badge = document.createElement("div");
  badge.className = "og-badge";
  badge.style.setProperty("--badge-color", riskColors[riskLevel] || "#FFA94D");
  badge.innerHTML = `
    <div class="og-badge-icon">🛡️</div>
    <div class="og-badge-text">
      <strong>${count}</strong> dark pattern${count !== 1 ? "s" : ""} detected
    </div>
  `;
  badge.style.pointerEvents = "auto";

  // Click to dismiss
  badge.addEventListener("click", () => {
    badge.style.opacity = "0";
    badge.style.transform = "translateX(100%)";
    setTimeout(() => badge.remove(), 300);
  });

  return badge;
}

// ---------------------------------------------------------------------------
// Styles (injected into Shadow DOM)
// ---------------------------------------------------------------------------
function getOverlayStyles() {
  return `
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');

    .og-container {
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      pointer-events: none;
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
      -webkit-font-smoothing: antialiased;
    }

    /* ---- Bounding Box ---- */
    .og-bbox {
      position: absolute;
      border: 2.5px solid var(--box-color);
      border-radius: 6px;
      background: color-mix(in srgb, var(--box-color) 6%, transparent);
      transition: background 0.2s ease;
      animation: og-fadeIn 0.4s ease both;
      cursor: pointer;
    }

    .og-bbox:hover {
      background: color-mix(in srgb, var(--box-color) 12%, transparent);
    }

    @keyframes og-fadeIn {
      from {
        opacity: 0;
        transform: scale(0.96);
      }
      to {
        opacity: 1;
        transform: scale(1);
      }
    }

    /* ---- Corner Markers ---- */
    .og-corner {
      position: absolute;
      width: 12px;
      height: 12px;
      border-color: var(--box-color);
      border-style: solid;
      border-width: 0;
    }
    .og-corner-tl { top: -2px; left: -2px; border-top-width: 3px; border-left-width: 3px; border-radius: 4px 0 0 0; }
    .og-corner-tr { top: -2px; right: -2px; border-top-width: 3px; border-right-width: 3px; border-radius: 0 4px 0 0; }
    .og-corner-bl { bottom: -2px; left: -2px; border-bottom-width: 3px; border-left-width: 3px; border-radius: 0 0 0 4px; }
    .og-corner-br { bottom: -2px; right: -2px; border-bottom-width: 3px; border-right-width: 3px; border-radius: 0 0 4px 0; }

    /* ---- Tag Label ---- */
    .og-tag {
      position: absolute;
      top: -30px;
      left: -1px;
      display: flex;
      align-items: center;
      gap: 5px;
      padding: 3px 10px;
      background: var(--box-color);
      color: #000;
      border-radius: 4px 4px 0 0;
      font-size: 11px;
      font-weight: 600;
      white-space: nowrap;
      line-height: 20px;
    }

    .og-tag-icon {
      font-size: 12px;
    }

    .og-tag-score {
      background: rgba(0,0,0,0.2);
      padding: 0 5px;
      border-radius: 3px;
      font-size: 10px;
      font-weight: 700;
    }

    /* ---- Tooltip ---- */
    .og-tooltip {
      position: absolute;
      bottom: calc(100% + 36px);
      left: 0;
      width: 280px;
      padding: 14px;
      background: rgba(10, 10, 15, 0.95);
      backdrop-filter: blur(12px);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 10px;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
      opacity: 0;
      transform: translateY(8px);
      transition: all 0.2s ease;
      pointer-events: none;
      z-index: 10;
    }

    .og-bbox:hover .og-tooltip {
      opacity: 1;
      transform: translateY(0);
    }

    .og-tooltip-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 8px;
      font-size: 13px;
      font-weight: 600;
      color: #f0f0f5;
    }

    .og-tooltip-score {
      font-weight: 700;
      font-size: 14px;
    }

    .og-tooltip-desc {
      font-size: 12px;
      color: #8888a0;
      line-height: 1.5;
      margin: 0;
    }

    .og-tooltip-quote {
      margin-top: 10px;
      padding: 8px 12px;
      background: rgba(255, 107, 107, 0.1);
      border-left: 3px solid #FF6B6B;
      border-radius: 0 6px 6px 0;
      font-size: 11px;
      color: #FF6B6B;
      font-style: italic;
      line-height: 1.4;
    }

    /* ---- Summary Badge ---- */
    .og-badge {
      position: fixed;
      top: 16px;
      right: 16px;
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 10px 16px;
      background: rgba(10, 10, 15, 0.92);
      backdrop-filter: blur(16px);
      border: 1px solid color-mix(in srgb, var(--badge-color) 30%, transparent);
      border-radius: 12px;
      box-shadow: 0 4px 24px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(255,255,255,0.05);
      cursor: pointer;
      transition: all 0.3s ease;
      animation: og-slideIn 0.5s ease both;
      z-index: 10;
    }

    .og-badge:hover {
      transform: translateY(-2px);
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
    }

    @keyframes og-slideIn {
      from {
        opacity: 0;
        transform: translateX(20px);
      }
      to {
        opacity: 1;
        transform: translateX(0);
      }
    }

    .og-badge-icon {
      font-size: 20px;
    }

    .og-badge-text {
      font-size: 12px;
      color: #aaa;
      line-height: 1.3;
    }

    .og-badge-text strong {
      color: var(--badge-color);
      font-weight: 700;
      font-size: 14px;
    }
  `;
}

// Log when content script loads
console.log("🛡️ OmniGuard AI content script loaded");
