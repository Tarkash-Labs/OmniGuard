# 🛡️ OmniGuard AI

> **Real-Time Multimodal Dark Pattern & Visual Deception Radar**

OmniGuard AI is a Chrome browser extension that acts as a cognitive visual shield against deceptive UI/UX. Powered by **Gemini 3.7 Flash**, it captures what users *actually see* on a webpage, detects **dark patterns** in real-time, and overlays **live bounding boxes** directly on the deceptive elements — before users can click.

**Built for [Prasunethon 2.0](https://prasunethon.in) by Tarkash Labs**

---

## ✨ Features

OmniGuard detects **6 categories** of dark patterns:

| Category | Description | Example |
|----------|-------------|---------|
| ⏰ **Urgency Traps** | Fake countdowns & artificial scarcity | "Only 2 left! Order in 03:22!" |
| 🎭 **Disguised Clicks** | Buttons masquerading as something else | Fake download buttons, hidden ads |
| 🛒 **Sneak into Basket** | Unwanted items silently added | Pre-checked insurance add-ons |
| 🔄 **Forced Continuity** | Subscription traps & hidden renewals | Free trial → auto-charge |
| 😢 **Confirmshaming** | Guilt-loaded opt-out language | "No thanks, I hate saving money" |
| 💰 **Hidden Costs** | Fees revealed late in the journey | Surprise checkout surcharges |

### How It Works

1. **User browses** any webpage normally
2. **Click "Scan"** in the extension popup
3. **Viewport screenshot** is captured (never stored — ephemeral)
4. **Gemini 3.7 Flash** analyzes the screenshot with multimodal reasoning
5. **Bounding boxes** are overlaid directly on deceptive elements
6. **Tooltips** show the category, risk score, and plain-English explanation

---

## 🏗️ Architecture

```
Extension (React 18 + Vite)          FastAPI Backend              Gemini AI
┌─────────────────────────┐    ┌──────────────────────┐    ┌──────────────┐
│ Popup UI                │    │ POST /analyze        │    │ Gemini 3.7   │
│ Service Worker          │───▶│ Multimodal prompt    │───▶│ Flash        │
│ Content Script (overlay)│◀───│ JSON response        │◀───│ Vision + NLP │
└─────────────────────────┘    └──────────────────────┘    └──────────────┘
     Manifest V3                    Stateless                 Multimodal
     Shadow DOM                     Zero-DB                   Reasoning
```

**Privacy:** Viewport screenshots are processed in-memory and **never stored** (zero-DB architecture).

---

## 🚀 Quick Start

### Prerequisites

- **Python 3.10+** (for the backend)
- **Node.js 18+** & npm (for the extension build)
- **Google Chrome** (Manifest V3 support)
- **Gemini API Key** — get one at [aistudio.google.com/apikey](https://aistudio.google.com/apikey)

### 1. Clone the Repo

```bash
git clone https://github.com/Tarkash-Labs/OmniGuard.git
cd OmniGuard
```

### 2. Start the Backend

```bash
cd backend

# Create virtual environment (recommended)
python -m venv venv
venv\Scripts\activate        # Windows
# source venv/bin/activate   # macOS/Linux

# Install dependencies
pip install -r requirements.txt

# Configure your API key
copy .env.example .env       # Windows
# cp .env.example .env       # macOS/Linux

# Edit .env and add your GEMINI_API_KEY

# Start the server
python main.py
```

The backend will start at `http://localhost:8000`. Verify with:
```bash
curl http://localhost:8000/health
```

### 3. Build the Extension

```bash
cd extension

# Install dependencies
npm install

# Build for production
npm run build
```

### 4. Load in Chrome

1. Open Chrome and navigate to `chrome://extensions`
2. Enable **Developer mode** (toggle in top-right)
3. Click **"Load unpacked"**
4. Select the `extension/dist` folder
5. The OmniGuard AI icon will appear in your toolbar!

### 5. Use It

1. Navigate to any website
2. Click the **OmniGuard AI** extension icon
3. Click **"Scan This Page"**
4. Wait for analysis (~1-2 seconds)
5. See bounding boxes appear over any detected dark patterns!

---

## 🛠️ Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Extension UI | React 18 + JavaScript (JSX) | Popup interface |
| Extension Build | Vite | Fast bundling for MV3 |
| Extension Runtime | Manifest V3 APIs | Tab capture, service worker |
| Overlay System | Shadow DOM + CSS | Non-destructive visual warnings |
| Backend | Python FastAPI | Async request orchestration |
| AI Engine | Gemini 3.7 Flash | Multimodal dark pattern detection |
| Streaming | SSE | Real-time inference updates |

---

## 📁 Project Structure

```
OmniGuard/
├── backend/
│   ├── main.py              # FastAPI app + /analyze endpoint
│   ├── models.py            # Pydantic request/response models
│   ├── prompts.py           # Gemini prompt templates
│   ├── requirements.txt     # Python dependencies
│   └── .env.example         # Environment variable template
│
└── extension/
    ├── manifest.json         # Chrome MV3 manifest
    ├── package.json          # Node dependencies
    ├── vite.config.js        # Vite build configuration
    ├── public/icons/         # Extension icons
    └── src/
        ├── constants.js      # Shared configuration
        ├── popup/            # React popup UI
        │   ├── Popup.jsx
        │   ├── Popup.css
        │   ├── main.jsx
        │   └── index.html
        ├── background/
        │   └── service-worker.js  # Tab capture + API orchestration
        └── content/
            └── content.js    # Bounding box overlay renderer
```

---

## 👥 Team

**Tarkash Labs** — Prasunethon 2.0

- **Jani Dhruv** (Team Lead)
- **Yug Vasava**

---

## 📄 License

This project is built for the Prasunethon 2.0 hackathon.
