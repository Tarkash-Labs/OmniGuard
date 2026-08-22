/**
 * OmniGuard AI - Shared Constants
 * Central configuration for the extension.
 */

// Backend API URL (local development)
export const API_BASE_URL = "http://localhost:8000";

// API Endpoints
export const ENDPOINTS = {
  analyze: `${API_BASE_URL}/analyze`,
  analyzeStream: `${API_BASE_URL}/analyze/stream`,
  health: `${API_BASE_URL}/health`,
};

// Dark pattern categories with display info
export const CATEGORIES = {
  urgency_trap: {
    label: "Urgency Trap",
    icon: "⏰",
    color: "#FF6B6B",
    description: "Fake countdowns, artificial scarcity",
  },
  disguised_click: {
    label: "Disguised Click",
    icon: "🎭",
    color: "#FFA94D",
    description: "Buttons masquerading as something else",
  },
  sneak_into_basket: {
    label: "Sneak into Basket",
    icon: "🛒",
    color: "#FFD43B",
    description: "Unwanted items silently added",
  },
  forced_continuity: {
    label: "Forced Continuity",
    icon: "🔄",
    color: "#69DB7C",
    description: "Subscription traps and hidden renewals",
  },
  confirmshaming: {
    label: "Confirmshaming",
    icon: "😢",
    color: "#748FFC",
    description: "Guilt-loaded opt-out language",
  },
  hidden_cost: {
    label: "Hidden Cost",
    icon: "💰",
    color: "#E599F7",
    description: "Fees revealed late in the journey",
  },
};

// Risk level colors
export const RISK_COLORS = {
  safe: "#69DB7C",
  low: "#A9E34B",
  medium: "#FFD43B",
  high: "#FFA94D",
  critical: "#FF6B6B",
};

// Risk level labels
export const RISK_LABELS = {
  safe: "Safe",
  low: "Low Risk",
  medium: "Medium Risk",
  high: "High Risk",
  critical: "Critical",
};

// Overlay styling
export const OVERLAY_CONFIG = {
  borderWidth: 3,
  borderRadius: 4,
  labelFontSize: 12,
  labelPadding: 6,
  animationDuration: 300,
  tooltipMaxWidth: 280,
};
