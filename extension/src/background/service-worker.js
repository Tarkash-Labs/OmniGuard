/**
 * OmniGuard AI — Service Worker (Background Script)
 * Manifest V3 service worker that orchestrates:
 * 1. Viewport screenshot capture via chrome.tabs.captureVisibleTab()
 * 2. Sending screenshots to the FastAPI backend for analysis
 * 3. Forwarding detection results to the content script for overlay rendering
 */

const API_BASE_URL = "http://localhost:8000";

// ---------------------------------------------------------------------------
// Message Listener
// ---------------------------------------------------------------------------
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "START_SCAN") {
    handleScan();
  }
  // Return true to indicate async response (even though we use messaging)
  return true;
});

// ---------------------------------------------------------------------------
// Core Scan Flow
// ---------------------------------------------------------------------------
async function handleScan() {
  try {
    // Notify popup that scanning has started
    broadcastToPopup({ type: "ANALYSIS_STATUS", status: "scanning" });

    // 1. Get the active tab
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });

    if (!tab || !tab.id) {
      throw new Error("No active tab found");
    }

    // 2. Capture the visible viewport as a PNG screenshot
    const screenshotDataUrl = await chrome.tabs.captureVisibleTab(
      tab.windowId,
      {
        format: "png",
        quality: 92,
      }
    );

    console.log(
      `📸 OmniGuard: Captured viewport screenshot for ${tab.url}`
    );

    // 3. Send screenshot to FastAPI backend for analysis
    const response = await fetch(`${API_BASE_URL}/analyze`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        screenshot: screenshotDataUrl,
        url: tab.url,
        viewport_width: tab.width,
        viewport_height: tab.height,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        errorData.detail || `Backend returned ${response.status}`
      );
    }

    const result = await response.json();

    console.log(
      `🔍 OmniGuard: Found ${result.detection_count} dark patterns (${result.risk_level})`
    );

    // 4. Send results to content script to draw overlays
    try {
      await chrome.tabs.sendMessage(tab.id, {
        type: "DRAW_OVERLAYS",
        detections: result.detections,
        riskLevel: result.risk_level,
      });
    } catch (contentError) {
      // Content script might not be injected yet — inject it and retry
      console.log("Content script not ready, injecting...");
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ["content.js"],
      });
      // Small delay then retry
      await new Promise((r) => setTimeout(r, 200));
      await chrome.tabs.sendMessage(tab.id, {
        type: "DRAW_OVERLAYS",
        detections: result.detections,
        riskLevel: result.risk_level,
      });
    }

    // 5. Send results to popup for display
    broadcastToPopup({
      type: "ANALYSIS_RESULT",
      data: result,
    });
  } catch (error) {
    console.error("❌ OmniGuard: Scan failed:", error);
    broadcastToPopup({
      type: "ANALYSIS_ERROR",
      error: error.message,
    });
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function broadcastToPopup(message) {
  // Send to all extension pages (popup, options, etc.)
  chrome.runtime.sendMessage(message).catch(() => {
    // Popup might be closed — that's fine
  });
}

// Log when service worker starts
console.log("🛡️ OmniGuard AI service worker loaded");
