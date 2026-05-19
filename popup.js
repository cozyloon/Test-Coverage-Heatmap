'use strict';

// ─── DOM refs ─────────────────────────────────────────────────────────────────
const recordBtn       = document.getElementById('recordBtn');
const heatmapBtn      = document.getElementById('heatmapBtn');
const statusPill      = document.getElementById('statusPill');
const coverageCard    = document.getElementById('coverageCard');
const ringArc         = document.getElementById('ringArc');
const pctLabel        = document.getElementById('pctLabel');
const coverageDetail  = document.getElementById('coverageDetail');
const sessionUrl      = document.getElementById('sessionUrl');
const modeRow         = document.getElementById('modeRow');
const legend          = document.getElementById('legend');
const legendCoverage  = document.getElementById('legendCoverage');
const legendFrequency = document.getElementById('legendFrequency');
const modeBtns        = document.querySelectorAll('.mode-btn');
const sessionList     = document.getElementById('sessionList');
const clearAllBtn     = document.getElementById('clearAllBtn');
const exportRow       = document.getElementById('exportRow');
const exportJsonBtn   = document.getElementById('exportJsonBtn');
const exportHtmlBtn   = document.getElementById('exportHtmlBtn');

// Detail view refs
const mainView        = document.getElementById('mainView');
const sessionDetail   = document.getElementById('sessionDetail');
const backBtn         = document.getElementById('backBtn');
const detailRingArc   = document.getElementById('detailRingArc');
const detailPct       = document.getElementById('detailPct');
const detailCounts    = document.getElementById('detailCounts');
const detailUrlText   = document.getElementById('detailUrlText');
const detailDate      = document.getElementById('detailDate');
const viewHeatmapBtn  = document.getElementById('viewHeatmapBtn');
const filterBtns      = document.querySelectorAll('.filter-btn');
const elementList     = document.getElementById('elementList');

// ─── Local UI state ───────────────────────────────────────────────────────────
let uiRecording     = false;
let uiHeatmap       = false;
let uiMode          = 'coverage';
let currentTabId    = null;
let currentSessions = {};
let selectedSessionId = null;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function setRing(pct) {
  const c = 2 * Math.PI * 17;
  const dash = (pct / 100) * c;
  ringArc.style.strokeDasharray = `${dash.toFixed(2)} ${c.toFixed(2)}`;
  pctLabel.textContent = `${pct}%`;
  ringArc.style.stroke = pct >= 75 ? '#22c55e' : pct >= 40 ? '#f97316' : '#ef4444';
}

function setDetailRing(pct) {
  const c = 2 * Math.PI * 17;
  const dash = (pct / 100) * c;
  detailRingArc.style.strokeDasharray = `${dash.toFixed(2)} ${c.toFixed(2)}`;
  detailPct.textContent = `${pct}%`;
  detailRingArc.style.stroke = pct >= 75 ? '#22c55e' : pct >= 40 ? '#f97316' : '#ef4444';
}

function formatDuration(ms) {
  if (!ms) return '—';
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return `${m}m ${s % 60}s`;
}

function formatUrl(url) {
  try { return new URL(url).hostname + new URL(url).pathname; }
  catch (_) { return url; }
}

function sessionCoverage(session) {
  const interactions = session.interactions || {};
  const total  = Object.keys(interactions).length;
  const tested = Object.values(interactions).filter(i => i.count > 0).length;
  return { total, tested, pct: total > 0 ? Math.round((tested / total) * 100) : 0 };
}

function escHtml(str) {
  return String(str)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ─── Session Detail View ──────────────────────────────────────────────────────

function showSessionDetail(sessionId) {
  const session = currentSessions[sessionId];
  if (!session) return;

  selectedSessionId = sessionId;

  // Populate stats
  const { total, tested, pct } = sessionCoverage(session);
  setDetailRing(pct);
  detailCounts.textContent = `${tested} / ${total} elements covered`;
  detailUrlText.textContent = formatUrl(session.url);
  detailUrlText.title = session.url;

  const started  = new Date(session.startTime).toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' });
  const duration = session.endTime ? formatDuration(session.endTime - session.startTime) : 'In progress';
  detailDate.textContent = `${started} · ${duration}`;

  // Reset filter to "all"
  filterBtns.forEach(b => b.classList.toggle('active', b.dataset.filter === 'all'));

  // Render elements
  renderElementList(session, 'all');

  // Flip views
  mainView.classList.add('hidden');
  sessionDetail.classList.remove('hidden');
}

function hideSessionDetail() {
  sessionDetail.classList.add('hidden');
  mainView.classList.remove('hidden');
}

// ─── Element list rendering ───────────────────────────────────────────────────

function renderElementList(session, filter) {
  const interactions = session.interactions || {};
  let entries = Object.entries(interactions);

  if (filter === 'tested')   entries = entries.filter(([, d]) => d.count > 0);
  if (filter === 'untested') entries = entries.filter(([, d]) => d.count === 0);

  // Sort: untested first, then by interaction count desc
  entries.sort(([, a], [, b]) => {
    if (a.count === 0 && b.count > 0) return -1;
    if (b.count === 0 && a.count > 0) return  1;
    return b.count - a.count;
  });

  if (entries.length === 0) {
    elementList.innerHTML = `<p class="el-empty">No elements match this filter.</p>`;
    return;
  }

  elementList.innerHTML = entries.map(([selector, d]) => {
    const tested = d.count > 0;
    const label  = escHtml(d.text || d.tagName || selector.slice(0, 40));
    const tag    = (d.tagName || '').toLowerCase();
    const count  = tested ? `×${d.count}` : '—';

    return `
      <div class="el-item">
        <span class="el-dot ${tested ? 'tested' : 'untested'}">${tested ? '✓' : '✕'}</span>
        <div class="el-info">
          <span class="el-label" title="${escHtml(selector)}">${label}</span>
          <span class="el-tag">&lt;${tag}&gt;</span>
        </div>
        <span class="el-count ${tested ? 'tested' : 'untested'}">${count}</span>
      </div>`;
  }).join('');
}

// ─── Detail view event handlers ───────────────────────────────────────────────

backBtn.addEventListener('click', hideSessionDetail);

filterBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    filterBtns.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const session = currentSessions[selectedSessionId];
    if (session) renderElementList(session, btn.dataset.filter);
  });
});

viewHeatmapBtn.addEventListener('click', () => {
  if (!currentTabId || !selectedSessionId) return;
  const session = currentSessions[selectedSessionId];
  if (!session) return;

  chrome.tabs.sendMessage(currentTabId, {
    type: 'LOAD_PAST_SESSION',
    interactions: session.interactions || {},
    mode: uiMode
  }, () => {
    uiHeatmap = true;
    // Sync heatmap button state on main view
    heatmapBtn.classList.add('active');
    heatmapBtn.innerHTML = `
      <svg viewBox="0 0 16 16"><path d="M8 2C5.8 4 4 6 4 8.5a4 4 0 0 0 8 0C12 6 10.2 4 8 2Z" fill="currentColor"/></svg>
      Hide Heatmap`;
    modeRow.classList.remove('hidden');
    legend.classList.remove('hidden');

    // Visual confirmation on the button
    viewHeatmapBtn.textContent = '✓ Heatmap loaded on page';
    viewHeatmapBtn.style.background = 'rgba(34,197,94,0.15)';
    viewHeatmapBtn.style.color = '#22c55e';
    viewHeatmapBtn.style.borderColor = 'rgba(34,197,94,0.4)';
    setTimeout(() => {
      viewHeatmapBtn.innerHTML = `
        <svg viewBox="0 0 16 16"><path d="M8 2C5.8 4 4 6 4 8.5a4 4 0 0 0 8 0C12 6 10.2 4 8 2Z" fill="currentColor"/></svg>
        View Heatmap on Page`;
      viewHeatmapBtn.style.background = '';
      viewHeatmapBtn.style.color = '';
      viewHeatmapBtn.style.borderColor = '';
    }, 2000);
  });
});

// ─── Session list rendering ───────────────────────────────────────────────────

function renderSessions(sessions, currentSession) {
  const ids = Object.keys(sessions).sort((a, b) =>
    (sessions[b].startTime || 0) - (sessions[a].startTime || 0)
  );

  if (ids.length === 0) {
    sessionList.innerHTML = '<p class="empty-msg">No sessions yet. Start recording to begin.</p>';
    exportRow.classList.add('hidden');
    return;
  }

  exportRow.classList.remove('hidden');

  sessionList.innerHTML = ids.map(id => {
    const s = sessions[id];
    const { total, tested, pct } = sessionCoverage(s);
    const pctClass  = pct >= 75 ? '' : pct >= 40 ? 'mid' : 'low';
    const duration  = s.endTime ? formatDuration(s.endTime - s.startTime) : 'Recording…';
    const isCurrent = id === currentSession;
    return `
      <div class="session-item${isCurrent ? ' current-session' : ''}" data-id="${id}" title="Click to view details">
        <span class="session-pct ${pctClass}">${pct}%</span>
        <div class="session-info">
          <div class="session-url-s">${escHtml(formatUrl(s.url))}</div>
          <div class="session-time">${tested}/${total} elements · ${duration}</div>
        </div>
        <button class="session-del" data-del="${id}" title="Delete">×</button>
      </div>`;
  }).join('');

  selectedSessionId = currentSession || ids[0];
}

// ─── Session list click handler ───────────────────────────────────────────────

sessionList.addEventListener('click', (e) => {
  // Delete button
  const delId = e.target.dataset.del;
  if (delId) {
    e.stopPropagation();
    chrome.runtime.sendMessage({ type: 'DELETE_SESSION', sessionId: delId }, () => {
      chrome.runtime.sendMessage({ type: 'GET_SESSION_DATA' }, (data) => {
        currentSessions = data?.sessions || {};
        renderSessions(currentSessions, data?.currentSession);
      });
    });
    return;
  }

  // Row click → open detail view
  const item = e.target.closest('.session-item');
  if (item?.dataset.id) {
    showSessionDetail(item.dataset.id);
  }
});

// ─── Record button ────────────────────────────────────────────────────────────

recordBtn.addEventListener('click', () => {
  if (!currentTabId) return;

  if (!uiRecording) {
    chrome.tabs.get(currentTabId, (tab) => {
      chrome.runtime.sendMessage(
        { type: 'START_RECORDING', url: tab.url, title: tab.title },
        (res) => {
          if (!res?.success) return;
          chrome.tabs.sendMessage(currentTabId, { type: 'CONTENT_START_RECORDING' });
          uiRecording = true;
          applyRecordingUI();
          coverageCard.classList.remove('hidden');
          setRing(0);
          coverageDetail.textContent = '— / — elements';
          sessionUrl.textContent = formatUrl(tab.url);
          startPolling();
        }
      );
    });
  } else {
    chrome.runtime.sendMessage({ type: 'STOP_RECORDING' }, () => {
      chrome.tabs.sendMessage(currentTabId, { type: 'CONTENT_STOP_RECORDING' });
      uiRecording = false;
      stopPolling();
      applyRecordingUI();
      chrome.runtime.sendMessage({ type: 'GET_SESSION_DATA' }, (data) => {
        if (data?.sessions) renderSessions(data.sessions, null);
      });
    });
  }
});

function applyRecordingUI() {
  if (uiRecording) {
    recordBtn.innerHTML = `
      <svg viewBox="0 0 16 16"><rect x="4" y="4" width="8" height="8" rx="1" fill="currentColor"/></svg>
      Stop Recording`;
    recordBtn.classList.add('stop');
    statusPill.textContent = 'Recording';
    statusPill.className = 'status-pill recording';
    heatmapBtn.disabled = false;
  } else {
    recordBtn.innerHTML = `
      <svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="5" fill="currentColor"/></svg>
      Start Recording`;
    recordBtn.classList.remove('stop');
    statusPill.textContent = 'Idle';
    statusPill.className = 'status-pill idle';
  }
}

// ─── Heatmap button ───────────────────────────────────────────────────────────

heatmapBtn.addEventListener('click', () => {
  if (!currentTabId) return;

  if (!uiHeatmap) {
    chrome.tabs.sendMessage(currentTabId, { type: 'SHOW_HEATMAP', mode: uiMode });
    uiHeatmap = true;
    heatmapBtn.classList.add('active');
    heatmapBtn.innerHTML = `
      <svg viewBox="0 0 16 16"><path d="M8 2C5.8 4 4 6 4 8.5a4 4 0 0 0 8 0C12 6 10.2 4 8 2Z" fill="currentColor"/></svg>
      Hide Heatmap`;
    modeRow.classList.remove('hidden');
    legend.classList.remove('hidden');
  } else {
    chrome.tabs.sendMessage(currentTabId, { type: 'HIDE_HEATMAP' });
    uiHeatmap = false;
    heatmapBtn.classList.remove('active');
    heatmapBtn.innerHTML = `
      <svg viewBox="0 0 16 16"><path d="M8 2C5.8 4 4 6 4 8.5a4 4 0 0 0 8 0C12 6 10.2 4 8 2Z" fill="currentColor"/></svg>
      Show Heatmap`;
    modeRow.classList.add('hidden');
    legend.classList.add('hidden');
  }
});

// ─── Mode toggle ──────────────────────────────────────────────────────────────

modeBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    uiMode = btn.dataset.mode;
    modeBtns.forEach(b => b.classList.toggle('active', b === btn));
    legendCoverage.classList.toggle('hidden', uiMode !== 'coverage');
    legendFrequency.classList.toggle('hidden', uiMode !== 'frequency');
    if (currentTabId && uiHeatmap) {
      chrome.tabs.sendMessage(currentTabId, { type: 'TOGGLE_MODE', mode: uiMode });
    }
  });
});

// ─── Clear all ────────────────────────────────────────────────────────────────

clearAllBtn.addEventListener('click', () => {
  if (!confirm('Delete all sessions?')) return;
  chrome.runtime.sendMessage({ type: 'CLEAR_ALL' }, () => {
    if (currentTabId) {
      chrome.tabs.sendMessage(currentTabId, { type: 'HIDE_HEATMAP' });
      chrome.tabs.sendMessage(currentTabId, { type: 'CONTENT_STOP_RECORDING' });
    }
    uiRecording = false;
    uiHeatmap   = false;
    stopPolling();
    applyRecordingUI();
    heatmapBtn.disabled = true;
    heatmapBtn.classList.remove('active');
    coverageCard.classList.add('hidden');
    modeRow.classList.add('hidden');
    legend.classList.add('hidden');
    currentSessions = {};
    renderSessions({}, null);
    hideSessionDetail();
  });
});

// ─── Export ───────────────────────────────────────────────────────────────────

exportJsonBtn.addEventListener('click', () => {
  if (!selectedSessionId || !currentSessions[selectedSessionId]) return;
  const data = JSON.stringify(currentSessions[selectedSessionId], null, 2);
  download(`coverage-session-${selectedSessionId}.json`, data, 'application/json');
});

exportHtmlBtn.addEventListener('click', () => {
  if (!selectedSessionId || !currentSessions[selectedSessionId]) return;
  download(`coverage-report-${selectedSessionId}.html`,
    buildHtmlReport(currentSessions[selectedSessionId]), 'text/html');
});

function download(filename, content, type) {
  const blob = new Blob([content], { type });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

function buildHtmlReport(session) {
  const { total, tested, pct } = sessionCoverage(session);
  const duration  = session.endTime ? formatDuration(session.endTime - session.startTime) : 'In progress';
  const startDate = new Date(session.startTime).toLocaleString();

  const rows = Object.entries(session.interactions || {})
    .sort(([, a], [, b]) => b.count - a.count)
    .map(([selector, d]) => {
      const status = d.count > 0 ? '✅ Tested' : '❌ Untested';
      const color  = d.count > 0 ? '#22c55e' : '#ef4444';
      return `<tr>
        <td style="color:${color}">${status}</td>
        <td>${escHtml(d.tagName || '')}</td>
        <td>${escHtml(d.text || '')}</td>
        <td style="text-align:center;font-weight:700">${d.count}</td>
        <td style="font-size:11px;color:#64748b;word-break:break-all">${escHtml(selector)}</td>
      </tr>`;
    }).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Coverage Report — ${escHtml(formatUrl(session.url))}</title>
<style>
  body { font-family: system-ui, sans-serif; background: #0f172a; color: #e2e8f0; margin: 0; padding: 24px; }
  h1   { font-size: 20px; margin-bottom: 4px; color: #f1f5f9; }
  .meta { color: #64748b; font-size: 13px; margin-bottom: 24px; }
  .stats { display: flex; gap: 24px; margin-bottom: 24px; }
  .stat  { background: #1e293b; border-radius: 10px; padding: 16px 24px; }
  .stat-val { font-size: 28px; font-weight: 800; color: #f1f5f9; }
  .stat-lbl { font-size: 12px; color: #64748b; margin-top: 2px; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th    { text-align: left; padding: 8px 10px; background: #1e293b; color: #94a3b8; font-weight: 700; }
  td    { padding: 7px 10px; border-bottom: 1px solid #1e293b; vertical-align: top; }
  tr:hover td { background: rgba(30,41,59,0.4); }
</style>
</head>
<body>
<h1>Test Coverage Report</h1>
<p class="meta">${escHtml(session.url)} &nbsp;·&nbsp; ${startDate} &nbsp;·&nbsp; ${duration}</p>
<div class="stats">
  <div class="stat"><div class="stat-val" style="color:${pct>=75?'#22c55e':pct>=40?'#f97316':'#ef4444'}">${pct}%</div><div class="stat-lbl">Coverage</div></div>
  <div class="stat"><div class="stat-val">${tested}</div><div class="stat-lbl">Tested</div></div>
  <div class="stat"><div class="stat-val">${total - tested}</div><div class="stat-lbl">Untested</div></div>
  <div class="stat"><div class="stat-val">${total}</div><div class="stat-lbl">Total Elements</div></div>
</div>
<table>
  <thead><tr><th>Status</th><th>Tag</th><th>Text / Label</th><th>Interactions</th><th>Selector</th></tr></thead>
  <tbody>${rows}</tbody>
</table>
<p style="margin-top:16px;font-size:11px;color:#334155">Generated by Test Coverage Heatmap</p>
</body></html>`;
}

// ─── Coverage polling ─────────────────────────────────────────────────────────

let pollTimer = null;

function startPolling() {
  stopPolling();
  pollTimer = setInterval(() => {
    if (!currentTabId) return;
    chrome.tabs.sendMessage(currentTabId, { type: 'GET_COVERAGE' }, (resp) => {
      if (chrome.runtime.lastError || !resp) return;
      setRing(resp.pct);
      coverageDetail.textContent = `${resp.tested} / ${resp.total} elements`;
      chrome.runtime.sendMessage({ type: 'GET_SESSION_DATA' }, (data) => {
        if (data?.sessions) renderSessions(data.sessions, data.currentSession);
      });
    });
  }, 2000);
}

function stopPolling() { clearInterval(pollTimer); pollTimer = null; }

function updateCoverageUI(pct, tested, total, url) {
  coverageCard.classList.remove('hidden');
  setRing(pct);
  coverageDetail.textContent = `${tested} / ${total} elements`;
  sessionUrl.textContent = formatUrl(url || '');
}

// ─── Init ─────────────────────────────────────────────────────────────────────

chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
  if (!tabs[0]) return;
  currentTabId = tabs[0].id;

  chrome.runtime.sendMessage({ type: 'GET_STATE' }, (data) => {
    if (!data) return;
    currentSessions = data.sessions || {};
    renderSessions(currentSessions, data.currentSession);

    if (data.isRecording) {
      uiRecording = true;
      applyRecordingUI();
      heatmapBtn.disabled = false;
      coverageCard.classList.remove('hidden');
      chrome.tabs.sendMessage(currentTabId, { type: 'GET_COVERAGE' }, (resp) => {
        if (resp) {
          const session = data.currentSession && data.sessions?.[data.currentSession];
          updateCoverageUI(resp.pct, resp.tested, resp.total, session?.url);
        }
      });
      startPolling();
    }
  });
});
