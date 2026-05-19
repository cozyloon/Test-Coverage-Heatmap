# Test Coverage Heatmap

A Chrome extension that visually tracks manual testing coverage during QA sessions. Overlay interactive heatmaps on any web page to instantly see which UI elements have been tested and which haven't.

![Chrome Extension](https://img.shields.io/badge/Chrome_Extension-Manifest_v3-4285F4?logo=googlechrome&logoColor=white)
![No Dependencies](https://img.shields.io/badge/dependencies-none-brightgreen)

---

## Features

- **Interaction Tracking** — Captures clicks, focus, keypress, and change events on 18+ interactive element types (buttons, links, inputs, ARIA roles, custom components)
- **Two Visualization Modes**
  - **Coverage Mode** — Green (tested) vs. red (untested) overlay
  - **Frequency Mode** — Intensity gradient (blue → yellow → red) with interaction counts
- **Live Coverage Badge** — Real-time percentage badge displayed directly on the page while recording
- **Session Management** — Store and revisit multiple sessions with timestamps and URLs
- **Element Filtering** — Filter elements by All / Tested / Untested in the session detail view
- **Export** — Download sessions as raw JSON or a styled HTML report
- **SPA Support** — Handles single-page app navigation via URL change detection and MutationObserver
- **Zero Dependencies** — Pure vanilla JS; no build step, no npm, no frameworks

---

## Installation

1. **Download or clone this repository**

   ```
   git clone <repository-url>
   cd heatmap
   ```

2. **Load the extension in Chrome**

   - Open `chrome://extensions/`
   - Enable **Developer mode** (toggle, top-right)
   - Click **Load unpacked**
   - Select the `heatmap` directory

The extension icon will appear in the Chrome toolbar.

---

## Usage

1. Click the extension icon to open the popup
2. Click **Start Recording** to begin tracking interactions on the current page
3. Interact with the page normally — every click, input, and focus is captured
4. Click **Show Heatmap** to overlay the visualization at any time
5. Toggle between **Coverage** and **Frequency** modes without stopping recording
6. Click **Stop Recording** to end the session
7. Click a session in the list to view per-element breakdowns
8. Use **Export JSON** or **Export HTML** to save a coverage report

---

## Project Structure

```
heatmap/
├── manifest.json      # Chrome extension manifest (v3)
├── background.js      # Service worker — session state & storage management
├── content.js         # Content script — DOM tracking, canvas heatmap, coverage badge
├── popup.html         # Extension popup UI
├── popup.js           # Popup logic — session list, detail view, exports
├── popup.css          # Popup styling (dark theme)
├── overlay.css        # Canvas and badge styles
└── icons/             # Extension icons (16, 48, 128px)
```

---

## Data Model

Each session is stored in `chrome.storage.local`:

```json
{
  "id": "session_1234567890",
  "url": "https://example.com/page",
  "title": "Page Title",
  "startTime": 1234567890,
  "endTime": 1234567920,
  "interactions": {
    "#submit-btn": {
      "count": 3,
      "rect": { "x": 10, "y": 20, "w": 100, "h": 30 },
      "tagName": "BUTTON",
      "text": "Submit",
      "lastInteraction": 1234567900
    }
  }
}
```

---

## Browser Requirements

- **Chrome 88+** (Manifest v3 + OffscreenCanvas support)
- **Required permissions:** `storage`, `activeTab`, `tabs`

---

## Coverage Color Scale

| Color | Meaning |
|-------|---------|
| Green `#22c55e` | Tested / ≥75% coverage |
| Orange `#f97316` | Partial / 40–74% coverage |
| Red `#ef4444` | Untested / <40% coverage |

In Frequency mode, elements transition from blue (low) → yellow (medium) → red (high interaction count).
