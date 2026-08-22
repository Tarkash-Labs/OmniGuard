import React, { useState, useEffect, useCallback } from "react";
import { CATEGORIES, RISK_COLORS, RISK_LABELS } from "../constants";

/**
 * OmniGuard AI — Popup Component
 * Main extension popup with scan controls, detection results, and status.
 */
export default function Popup() {
  const [status, setStatus] = useState("idle"); // idle | scanning | complete | error
  const [results, setResults] = useState(null);
  const [error, setError] = useState("");
  const [backendOnline, setBackendOnline] = useState(null);

  // Check backend health on mount
  useEffect(() => {
    checkBackendHealth();
  }, []);

  // Listen for results from service worker
  useEffect(() => {
    const listener = (message) => {
      if (message.type === "ANALYSIS_RESULT") {
        setResults(message.data);
        setStatus("complete");
      } else if (message.type === "ANALYSIS_ERROR") {
        setError(message.error);
        setStatus("error");
      } else if (message.type === "ANALYSIS_STATUS") {
        setStatus("scanning");
      }
    };
    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, []);

  const checkBackendHealth = async () => {
    try {
      const response = await fetch("http://localhost:8000/health");
      const data = await response.json();
      setBackendOnline(data.status === "ok");
    } catch {
      setBackendOnline(false);
    }
  };

  const handleScan = useCallback(() => {
    setStatus("scanning");
    setError("");
    setResults(null);
    // Send message to service worker to start analysis
    chrome.runtime.sendMessage({ type: "START_SCAN" });
  }, []);

  const handleClearOverlays = useCallback(() => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.id) {
        chrome.tabs.sendMessage(tabs[0].id, { type: "CLEAR_OVERLAYS" });
      }
    });
    setResults(null);
    setStatus("idle");
  }, []);

  const getRiskBadgeStyle = (level) => ({
    background: `${RISK_COLORS[level] || RISK_COLORS.safe}22`,
    color: RISK_COLORS[level] || RISK_COLORS.safe,
    border: `1px solid ${RISK_COLORS[level] || RISK_COLORS.safe}44`,
  });

  return (
    <div className="popup-container">
      {/* Header */}
      <header className="popup-header">
        <div className="header-brand">
          <div className="logo-icon">
            <svg viewBox="0 0 24 24" width="28" height="28" fill="none">
              <path
                d="M12 2L3 7v10l9 5 9-5V7l-9-5z"
                stroke="url(#grad)"
                strokeWidth="1.5"
                fill="url(#grad)"
                fillOpacity="0.1"
              />
              <path
                d="M12 8a4 4 0 100 8 4 4 0 000-8z"
                stroke="url(#grad)"
                strokeWidth="1.5"
                fill="none"
              />
              <circle cx="12" cy="12" r="1.5" fill="url(#grad)" />
              <defs>
                <linearGradient id="grad" x1="0" y1="0" x2="24" y2="24">
                  <stop stopColor="#6C5CE7" />
                  <stop offset="1" stopColor="#00CECE" />
                </linearGradient>
              </defs>
            </svg>
          </div>
          <div className="header-text">
            <h1>OmniGuard AI</h1>
            <span className="header-subtitle">Dark Pattern Radar</span>
          </div>
        </div>
        <div className={`status-dot ${backendOnline ? "online" : "offline"}`}>
          <span className="dot-pulse"></span>
          {backendOnline === null
            ? "Checking..."
            : backendOnline
              ? "Online"
              : "Offline"}
        </div>
      </header>

      {/* Scan Button */}
      <div className="scan-section">
        {!backendOnline && backendOnline !== null ? (
          <div className="warning-card">
            <span className="warning-icon">⚠️</span>
            <div>
              <strong>Backend offline</strong>
              <p>Start the FastAPI server on port 8000</p>
            </div>
          </div>
        ) : status === "scanning" ? (
          <button className="scan-btn scanning" disabled>
            <div className="scan-spinner"></div>
            <span>Analyzing page...</span>
          </button>
        ) : (
          <button className="scan-btn" onClick={handleScan} disabled={!backendOnline}>
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none">
              <path
                d="M3 7V5a2 2 0 012-2h2M17 3h2a2 2 0 012 2v2M21 17v2a2 2 0 01-2 2h-2M7 21H5a2 2 0 01-2-2v-2"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
              <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2" />
            </svg>
            <span>Scan This Page</span>
          </button>
        )}
      </div>

      {/* Results */}
      {status === "complete" && results && (
        <div className="results-section">
          {/* Summary Card */}
          <div className="summary-card">
            <div className="summary-header">
              <div className="summary-left">
                <span className="detection-count">{results.detection_count}</span>
                <span className="detection-label">
                  {results.detection_count === 1 ? "Pattern Found" : "Patterns Found"}
                </span>
              </div>
              <span
                className="risk-badge"
                style={getRiskBadgeStyle(results.risk_level)}
              >
                {RISK_LABELS[results.risk_level] || "Unknown"}
              </span>
            </div>
            {results.summary && (
              <p className="summary-text">{results.summary}</p>
            )}
          </div>

          {/* Detection List */}
          {results.detections && results.detections.length > 0 && (
            <div className="detections-list">
              {results.detections.map((det, idx) => {
                const cat = CATEGORIES[det.category] || {};
                return (
                  <div key={idx} className="detection-card">
                    <div className="detection-header">
                      <span className="detection-category-icon">
                        {cat.icon || "⚠️"}
                      </span>
                      <span className="detection-category-label">
                        {cat.label || det.category}
                      </span>
                      <span
                        className="detection-score"
                        style={{
                          color:
                            det.risk_score > 0.6
                              ? RISK_COLORS.critical
                              : det.risk_score > 0.3
                                ? RISK_COLORS.medium
                                : RISK_COLORS.low,
                        }}
                      >
                        {Math.round(det.risk_score * 100)}%
                      </span>
                    </div>
                    <p className="detection-label">{det.label}</p>
                    <p className="detection-desc">{det.description}</p>
                    {det.deceptive_text && (
                      <div className="deceptive-quote">
                        "{det.deceptive_text}"
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Clear Button */}
          <button className="clear-btn" onClick={handleClearOverlays}>
            Clear Overlays
          </button>
        </div>
      )}

      {/* Error State */}
      {status === "error" && (
        <div className="error-card">
          <span className="error-icon">❌</span>
          <div>
            <strong>Analysis Failed</strong>
            <p>{error || "Unknown error occurred"}</p>
          </div>
          <button className="retry-btn" onClick={handleScan}>
            Retry
          </button>
        </div>
      )}

      {/* Empty State */}
      {status === "complete" && results && results.detection_count === 0 && (
        <div className="safe-card">
          <span className="safe-icon">✅</span>
          <strong>Page Looks Clean</strong>
          <p>No dark patterns detected on this page.</p>
        </div>
      )}

      {/* Footer */}
      <footer className="popup-footer">
        <span>Powered by Gemini 3.7 Flash</span>
        <span className="footer-dot">•</span>
        <span>Tarkash Labs</span>
      </footer>
    </div>
  );
}
