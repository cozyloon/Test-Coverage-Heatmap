'use strict';

// Programmatically generate the extension icon so no PNG files are needed
function drawActionIcon(isRecording) {
  const size = 128;
  const canvas = new OffscreenCanvas(size, size);
  const ctx = canvas.getContext('2d');

  // Background pill
  ctx.fillStyle = isRecording ? '#dc2626' : '#1e293b';
  ctx.beginPath();
  ctx.roundRect(4, 4, 120, 120, 18);
  ctx.fill();

  // 3x3 heatmap grid
  const cells = isRecording
    ? ['#fca5a5', '#f97316', '#ef4444', '#22c55e', '#86efac', '#ef4444', '#fbbf24', '#22c55e', '#6ee7b7']
    : ['#475569', '#334155', '#475569', '#334155', '#475569', '#334155', '#475569', '#334155', '#475569'];

  const cellSize = 30;
  const gap = 5;
  const offsetX = (size - (3 * cellSize + 2 * gap)) / 2;
  const offsetY = (size - (3 * cellSize + 2 * gap)) / 2;

  cells.forEach((color, i) => {
    const col = i % 3;
    const row = Math.floor(i / 3);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.roundRect(offsetX + col * (cellSize + gap), offsetY + row * (cellSize + gap), cellSize, cellSize, 5);
    ctx.fill();
  });

  return ctx.getImageData(0, 0, size, size);
}

function setIcon(isRecording) {
  try {
    chrome.action.setIcon({ imageData: { 128: drawActionIcon(isRecording) } });
  } catch (e) {
    // OffscreenCanvas not available in all service worker contexts
  }
}

setIcon(false);

// ─── Message Router ────────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  switch (msg.type) {
    case 'GET_STATE':
      chrome.storage.local.get(['isRecording', 'sessions', 'currentSession'], sendResponse);
      return true;

    case 'START_RECORDING': {
      const sessionId = `session_${Date.now()}`;
      const newSession = {
        id: sessionId,
        url: msg.url,
        title: msg.title,
        startTime: Date.now(),
        endTime: null,
        interactions: {}
      };
      chrome.storage.local.get(['sessions'], (data) => {
        const sessions = data.sessions || {};
        sessions[sessionId] = newSession;
        chrome.storage.local.set({ isRecording: true, currentSession: sessionId, sessions }, () => {
          setIcon(true);
          sendResponse({ success: true, sessionId });
        });
      });
      return true;
    }

    case 'STOP_RECORDING':
      chrome.storage.local.get(['sessions', 'currentSession'], (data) => {
        const sessions = data.sessions || {};
        const id = data.currentSession;
        if (id && sessions[id]) sessions[id].endTime = Date.now();
        chrome.storage.local.set({ isRecording: false, currentSession: null, sessions }, () => {
          setIcon(false);
          sendResponse({ success: true });
        });
      });
      return true;

    case 'RECORD_INTERACTION':
      chrome.storage.local.get(['isRecording', 'currentSession', 'sessions'], (data) => {
        if (!data.isRecording || !data.currentSession) return;
        const sessions = data.sessions || {};
        const session = sessions[data.currentSession];
        if (!session) return;

        const { selector, interaction } = msg;
        const existing = session.interactions[selector];
        if (existing) {
          existing.count++;
          existing.rect = interaction.rect;
          existing.lastInteraction = Date.now();
        } else {
          session.interactions[selector] = { ...interaction, count: 1, lastInteraction: Date.now() };
        }
        chrome.storage.local.set({ sessions }, () => sendResponse({ success: true }));
      });
      return true;

    case 'GET_SESSION_DATA':
      chrome.storage.local.get(['sessions', 'currentSession', 'isRecording'], sendResponse);
      return true;

    case 'DELETE_SESSION':
      chrome.storage.local.get(['sessions'], (data) => {
        const sessions = data.sessions || {};
        delete sessions[msg.sessionId];
        chrome.storage.local.set({ sessions }, () => sendResponse({ success: true }));
      });
      return true;

    case 'CLEAR_ALL':
      chrome.storage.local.set({ sessions: {}, currentSession: null, isRecording: false }, () => {
        setIcon(false);
        sendResponse({ success: true });
      });
      return true;
  }
});
