(function () {
  'use strict';

  if (window.__heatmapExtLoaded) return;
  window.__heatmapExtLoaded = true;

  // ─── State ──────────────────────────────────────────────────────────────────

  let isRecording = false;
  let heatmapVisible = false;
  let heatmapMode = 'coverage'; // 'coverage' | 'frequency'
  let localInteractions = {}; // selector → { count, rect, tagName, text }
  let canvas = null;
  let ctx = null;
  let badge = null;
  let redrawTimer = null;

  // ─── Element Selection ──────────────────────────────────────────────────────

  const INTERACTIVE_SELECTORS = [
    'a[href]', 'button', 'input', 'select', 'textarea', 'summary',
    '[onclick]', '[contenteditable="true"]',
    '[role="button"]', '[role="link"]', '[role="checkbox"]', '[role="radio"]',
    '[role="tab"]', '[role="menuitem"]', '[role="option"]',
    '[role="switch"]', '[role="combobox"]', '[role="listbox"]',
    '[tabindex]:not([tabindex="-1"])', 'label[for]'
  ].join(',');

  function getInteractiveElements() {
    try {
      return Array.from(document.querySelectorAll(INTERACTIVE_SELECTORS)).filter(el => {
        if (el.id && (el.id.startsWith('__hm_') || el.id === '__heatmap_canvas__')) return false;
        const s = window.getComputedStyle(el);
        if (s.display === 'none' || s.visibility === 'hidden' || s.opacity === '0') return false;
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      });
    } catch (_) {
      return [];
    }
  }

  // ─── Stable Element Key ─────────────────────────────────────────────────────

  function getKey(el) {
    if (el.id && !el.id.startsWith('__hm_')) return `#${el.id}`;

    const segments = [];
    let cur = el;
    let depth = 0;

    while (cur && cur !== document.documentElement && depth < 7) {
      if (cur.id && !cur.id.startsWith('__hm_')) {
        segments.unshift(`#${cur.id}`);
        break;
      }

      let seg = cur.tagName.toLowerCase();

      // Stable class hint (first non-dynamic class)
      if (cur.classList.length) {
        const cls = Array.from(cur.classList).find(c => /^[a-z_-]/i.test(c) && !c.includes(':'));
        if (cls) seg += `.${cls}`;
      }

      const parent = cur.parentElement;
      if (parent) {
        const sibs = Array.from(parent.children).filter(c => c.tagName === cur.tagName);
        if (sibs.length > 1) seg += `:nth-of-type(${sibs.indexOf(cur) + 1})`;
      }

      segments.unshift(seg);
      cur = cur.parentElement;
      depth++;
    }

    return segments.join('>');
  }

  // ─── Interaction Tracking ───────────────────────────────────────────────────

  function onInteract(e) {
    if (!isRecording) return;
    const el = e.target;
    if (!el || el === document.body || el === document.documentElement) return;
    if (el.id && el.id.startsWith('__hm_')) return;
    if (el.id === '__heatmap_canvas__') return;

    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;

    const key = getKey(el);
    const docRect = {
      x: Math.round(rect.left + window.scrollX),
      y: Math.round(rect.top + window.scrollY),
      w: Math.round(rect.width),
      h: Math.round(rect.height)
    };

    if (localInteractions[key]) {
      localInteractions[key].count++;
      localInteractions[key].rect = docRect;
    } else {
      localInteractions[key] = {
        count: 1,
        rect: docRect,
        tagName: el.tagName,
        text: (el.textContent || el.placeholder || el.getAttribute('aria-label') || el.getAttribute('name') || '')
          .trim().slice(0, 60)
      };
    }

    chrome.runtime.sendMessage({
      type: 'RECORD_INTERACTION',
      selector: key,
      interaction: { ...localInteractions[key], rect: docRect }
    });

    scheduleDraw();
    refreshBadge();
  }

  // ─── Canvas Heatmap ─────────────────────────────────────────────────────────

  function ensureCanvas() {
    if (canvas && canvas.isConnected) return;
    canvas = document.createElement('canvas');
    canvas.id = '__heatmap_canvas__';
    canvas.setAttribute('aria-hidden', 'true');
    canvas.style.cssText =
      'position:absolute!important;top:0!important;left:0!important;' +
      'pointer-events:none!important;z-index:2147483647!important;';
    document.body.appendChild(canvas);
    ctx = canvas.getContext('2d');
  }

  function sizeCanvas() {
    const W = Math.max(document.documentElement.scrollWidth, document.documentElement.clientWidth);
    const H = Math.max(document.documentElement.scrollHeight, document.documentElement.clientHeight);
    if (canvas.width !== W || canvas.height !== H) {
      canvas.width = W;
      canvas.height = H;
    }
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
  }

  function heatColor(count, maxCount) {
    if (heatmapMode === 'coverage') {
      return count === 0
        ? { r: 239, g: 68, b: 68, a: 0.32 }   // red = untested
        : { r: 34, g: 197, b: 94, a: 0.30 };   // green = tested
    }

    // Frequency mode: grey → blue → yellow → red
    if (count === 0) return { r: 148, g: 163, b: 184, a: 0.22 };
    const t = Math.min(count / Math.max(maxCount, 1), 1);

    if (t < 0.33) {
      const p = t / 0.33;
      return { r: Math.round(59 + p * 196), g: Math.round(130 - p * 62), b: 246, a: 0.38 };
    }
    if (t < 0.66) {
      const p = (t - 0.33) / 0.33;
      return { r: 255, g: Math.round(165 - p * 97), b: Math.round(50), a: 0.40 };
    }
    const p = (t - 0.66) / 0.34;
    return { r: Math.round(255 - p * 55), g: Math.round(68), b: 50, a: 0.45 + p * 0.1 };
  }

  function drawEl(el, color, count) {
    const r = el.getBoundingClientRect();
    const x = r.left + window.scrollX;
    const y = r.top + window.scrollY;
    const w = r.width;
    const h = r.height;
    if (w < 1 || h < 1) return;

    ctx.fillStyle = `rgba(${color.r},${color.g},${color.b},${color.a})`;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 4);
    ctx.fill();

    ctx.strokeStyle = `rgba(${color.r},${color.g},${color.b},${Math.min(color.a * 2.2, 0.85)})`;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Interaction count badge (frequency mode only)
    if (heatmapMode === 'frequency' && count > 0 && w > 26 && h > 15) {
      const label = count > 99 ? '99+' : String(count);
      const bw = label.length * 6 + 8;
      const bh = 14;
      ctx.fillStyle = `rgba(${color.r},${color.g},${color.b},0.9)`;
      ctx.beginPath();
      ctx.roundRect(x + w - bw - 3, y + 3, bw, bh, 3);
      ctx.fill();
      ctx.fillStyle = 'white';
      ctx.font = 'bold 9px system-ui,sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, x + w - bw / 2 - 3, y + 10);
    }
  }

  function drawHeatmap() {
    if (!heatmapVisible) return;
    ensureCanvas();
    sizeCanvas();
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const elements = getInteractiveElements();
    const maxCount = Object.values(localInteractions).reduce((m, i) => Math.max(m, i.count), 1);

    elements.forEach(el => {
      const key = getKey(el);
      const count = localInteractions[key]?.count || 0;
      drawEl(el, heatColor(count, maxCount), count);
    });

    refreshBadge(elements);
  }

  function scheduleDraw() {
    if (!heatmapVisible) return;
    clearTimeout(redrawTimer);
    redrawTimer = setTimeout(drawHeatmap, 80);
  }

  // ─── Coverage Badge ─────────────────────────────────────────────────────────

  function createBadge() {
    if (badge && badge.isConnected) return;
    badge = document.createElement('div');
    badge.id = '__hm_badge__';
    badge.setAttribute('aria-hidden', 'true');
    document.body.appendChild(badge);
  }

  function refreshBadge(precomputedEls) {
    if (!badge || !badge.isConnected) return;
    const els = precomputedEls || getInteractiveElements();
    const total = els.length;
    const tested = els.filter(el => (localInteractions[getKey(el)]?.count || 0) > 0).length;
    const pct = total > 0 ? Math.round((tested / total) * 100) : 0;

    badge.innerHTML = `<span class="__hm_dot__"></span><b>${pct}%</b>&nbsp;covered&nbsp;<span style="opacity:.65;font-size:11px">${tested}/${total}</span>`;
  }

  function removeBadge() {
    if (badge) { badge.remove(); badge = null; }
  }

  // ─── Recording Controls ─────────────────────────────────────────────────────

  function startListeners() {
    document.addEventListener('click', onInteract, true);
    document.addEventListener('change', onInteract, true);
    document.addEventListener('focus', onInteract, true);
    document.addEventListener('keydown', onInteract, true);
  }

  function stopListeners() {
    document.removeEventListener('click', onInteract, true);
    document.removeEventListener('change', onInteract, true);
    document.removeEventListener('focus', onInteract, true);
    document.removeEventListener('keydown', onInteract, true);
  }

  // ─── Init: sync state from background ──────────────────────────────────────

  chrome.runtime.sendMessage({ type: 'GET_STATE' }, (data) => {
    if (!data) return;
    if (data.isRecording) {
      isRecording = true;
      if (data.currentSession && data.sessions?.[data.currentSession]) {
        localInteractions = data.sessions[data.currentSession].interactions || {};
      }
      startListeners();
      createBadge();
      refreshBadge();
    }
  });

  // ─── Popup Message Handler ──────────────────────────────────────────────────

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    switch (msg.type) {
      case 'CONTENT_START_RECORDING':
        isRecording = true;
        localInteractions = {};
        startListeners();
        createBadge();
        refreshBadge();
        sendResponse({ ok: true });
        break;

      case 'CONTENT_STOP_RECORDING':
        isRecording = false;
        stopListeners();
        removeBadge();
        sendResponse({ ok: true });
        break;

      case 'SHOW_HEATMAP':
        heatmapMode = msg.mode || heatmapMode;
        heatmapVisible = true;
        // Sync latest interaction data from storage before drawing
        chrome.runtime.sendMessage({ type: 'GET_SESSION_DATA' }, (data) => {
          if (data?.currentSession && data.sessions?.[data.currentSession]) {
            localInteractions = data.sessions[data.currentSession].interactions || {};
          }
          drawHeatmap();
        });
        sendResponse({ ok: true });
        break;

      case 'HIDE_HEATMAP':
        heatmapVisible = false;
        if (canvas) { canvas.remove(); canvas = null; ctx = null; }
        sendResponse({ ok: true });
        break;

      case 'LOAD_PAST_SESSION':
        localInteractions = msg.interactions || {};
        heatmapMode = msg.mode || 'coverage';
        heatmapVisible = true;
        ensureCanvas();
        drawHeatmap();
        sendResponse({ ok: true });
        break;

      case 'TOGGLE_MODE':
        heatmapMode = msg.mode;
        if (heatmapVisible) drawHeatmap();
        sendResponse({ ok: true });
        break;

      case 'GET_COVERAGE': {
        const els = getInteractiveElements();
        const total = els.length;
        const tested = els.filter(el => (localInteractions[getKey(el)]?.count || 0) > 0).length;
        sendResponse({ total, tested, pct: total > 0 ? Math.round((tested / total) * 100) : 0 });
        return true;
      }
    }
    return true;
  });

  // ─── Layout change handlers ─────────────────────────────────────────────────

  window.addEventListener('resize', () => scheduleDraw(), { passive: true });

  // Redraw after page mutations (SPA navigation, lazy-loaded content)
  let mutationTimer = null;
  const mo = new MutationObserver(() => {
    clearTimeout(mutationTimer);
    mutationTimer = setTimeout(scheduleDraw, 400);
  });
  mo.observe(document.body, { childList: true, subtree: true });

  // Detect SPA URL changes
  let lastHref = location.href;
  setInterval(() => {
    if (location.href !== lastHref) {
      lastHref = location.href;
      if (heatmapVisible) scheduleDraw();
    }
  }, 1000);

})();
