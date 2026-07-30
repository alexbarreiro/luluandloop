/* Lulu & Loop — "Habla con Lulu" website chat widget.
   Self-contained (injects its own styles + DOM): floating launcher with
   Lulu's photo → chat panel powered by the same lulu-agent as the mobile
   apps. Concept sketches render inline; checkout opens the embedded Stripe
   modal without leaving the site. On the portal page, set
   window.LULU_CHAT_JWT to the session token to enable "my orders". */
(function () {
  'use strict';
  var cfg = window.LULU_CONFIG || {};
  if (!cfg.SUPABASE_URL) return; // demo mode: no agent backend

  function detectES() {
    try { if (localStorage.getItem('luluandloop.lang')) return localStorage.getItem('luluandloop.lang') === 'es'; } catch (e) { /* ignore */ }
    return (document.documentElement.lang || 'en').indexOf('es') === 0;
  }
  var ES = detectES();
  function T(en, es) { return ES ? es : en; }

  var HELLO = {
    role: 'lulu',
    text: T("Hi! I'm Lulu 💗 Tell me what you'd love me to crochet — or ask me anything about your order.",
            '¡Hola! Soy Lulu 💗 Cuéntame qué te gustaría que tejiera — o pregúntame lo que sea de tu pedido.')
  };

  /* ---------- styles ---------- */
  var css = '' +
    '#lulu-chat-launch{position:fixed;right:18px;bottom:18px;z-index:190;display:flex;align-items:center;gap:10px;' +
    'background:#2A2A33;color:#FFF4F2;border:none;border-radius:999px;padding:8px 18px 8px 8px;cursor:pointer;' +
    'box-shadow:0 12px 30px -8px rgba(42,42,51,.45);font-family:inherit;font-weight:800;font-size:14px;}' +
    '#lulu-chat-launch:hover{background:#E4657E;}' +
    '#lulu-chat-launch{transition:bottom .25s ease;}' +
    '.lc-spk{border:1px solid #F0E2D8;background:#FFFEFC;border-radius:50%;width:26px;height:26px;font-size:12px;' +
    'cursor:pointer;flex-shrink:0;align-self:center;margin-left:4px;line-height:1;padding:0;}' +
    '.lc-spk.on{background:#E4657E;border-color:#E4657E;}' +
    '#lulu-chat-launch img{width:38px;height:38px;border-radius:50%;border:2px solid #E4657E;display:block;}' +
    '#lulu-chat-panel{position:fixed;right:18px;bottom:18px;z-index:195;width:min(390px,calc(100vw - 24px));' +
    'height:min(620px,calc(100vh - 40px));background:#FFF8F0;border:1px solid #F0E2D8;border-radius:20px;' +
    'box-shadow:0 24px 60px -12px rgba(42,42,51,.4);display:flex;flex-direction:column;overflow:hidden;font-family:inherit;}' +
    '@media (max-width:560px){#lulu-chat-panel{right:0;bottom:auto;top:0;left:0;width:100vw;height:100dvh;border-radius:0;}}' +
    '.lc-msgs{overscroll-behavior:contain;-webkit-overflow-scrolling:touch;}' +
    '#lulu-chat-launch{bottom:calc(18px + env(safe-area-inset-bottom));}' +
    '.lc-compose{padding-bottom:calc(10px + env(safe-area-inset-bottom));}' +
    '.lc-head{display:flex;align-items:center;gap:10px;padding:12px 14px;border-bottom:1px solid #F0E2D8;background:#FFF8F0;}' +
    '.lc-head img{width:40px;height:40px;border-radius:50%;border:2px solid #E4657E;}' +
    '.lc-name{font-weight:900;color:#2A2A33;font-size:16px;line-height:1.1;}' +
    '.lc-name b{color:#E4657E;}' +
    '.lc-sub{font-size:11px;color:#6E6E7A;font-weight:700;}' +
    '.lc-close{margin-left:auto;border:1px solid #F0E2D8;background:#FFFEFC;border-radius:50%;width:30px;height:30px;' +
    'cursor:pointer;color:#6E6E7A;font-size:13px;line-height:1;}' +
    '.lc-msgs{flex:1;overflow-y:auto;padding:14px;display:flex;flex-direction:column;gap:10px;}' +
    '.lc-row{display:flex;gap:8px;align-items:flex-end;}' +
    '.lc-row img{width:26px;height:26px;border-radius:50%;flex-shrink:0;}' +
    '.lc-b{border-radius:14px;padding:10px 13px;font-size:14px;line-height:1.5;max-width:82%;}' +
    '.lc-lulu{background:#FFFEFC;border:1px solid #F0E2D8;color:#2A2A33;border-bottom-left-radius:4px;}' +
    '.lc-me{background:#E4657E;color:#FFF4F2;align-self:flex-end;border-bottom-right-radius:4px;}' +
    '.lc-concept{background:#FFFEFC;border:1px solid #F0E2D8;border-radius:14px;padding:8px;max-width:82%;margin-left:34px;}' +
    '.lc-concept img{width:100%;border-radius:10px;display:block;}' +
    '.lc-concept p{font-size:10.5px;color:#B6B1BC;font-weight:700;text-align:center;margin:6px 0 0;}' +
    '.lc-pay{margin-left:34px;background:#2A2A33;color:#FFF8F0;border:none;border-radius:999px;padding:12px 20px;' +
    'font-weight:800;font-size:13.5px;cursor:pointer;font-family:inherit;align-self:flex-start;}' +
    '.lc-pay:hover{background:#E4657E;}' +
    '.lc-order{margin-left:34px;background:#FFFEFC;border:1px solid #F0E2D8;border-radius:12px;padding:9px 12px;max-width:82%;}' +
    '.lc-order b{font-size:13px;color:#2A2A33;display:block;}' +
    '.lc-order span{font-size:11.5px;color:#6E6E7A;}' +
    '.lc-typing{font-size:11.5px;color:#B6B1BC;font-weight:700;font-style:italic;margin-left:34px;}' +
    '.lc-compose{display:flex;gap:8px;padding:10px;border-top:1px solid #F0E2D8;background:#FFF8F0;align-items:flex-end;}' +
    '.lc-compose textarea{flex:1;background:#FFFEFC;border:1px solid #F0E2D8;border-radius:16px;padding:10px 13px;' +
    'font-size:16px;color:#2A2A33;font-family:inherit;resize:none;max-height:96px;min-height:40px;}' +
    '.lc-send{background:#E4657E;border:none;border-radius:50%;width:40px;height:40px;color:#fff;font-size:16px;' +
    'cursor:pointer;font-weight:800;flex-shrink:0;}' +
    '.lc-mic{background:#FFFEFC;border:1px solid #F0E2D8;border-radius:50%;width:40px;height:40px;font-size:16px;' +
    'cursor:pointer;flex-shrink:0;line-height:1;}' +
    '.lc-mic.rec{background:#E4657E;border-color:#E4657E;animation:lcpulse 1.2s infinite;}' +
    '@keyframes lcpulse{0%,100%{box-shadow:0 0 0 0 rgba(228,101,126,.4);}50%{box-shadow:0 0 0 8px rgba(228,101,126,0);}}' +
    '.lc-send:disabled{opacity:.5;}' +
    '#lulu-chat-stripe{position:fixed;inset:0;z-index:220;background:rgba(42,42,51,.55);display:flex;' +
    'align-items:center;justify-content:center;padding:18px;}' +
    '#lulu-chat-stripe .box{position:relative;background:#fff;border-radius:18px;width:min(480px,100%);' +
    'max-height:92vh;overflow-y:auto;padding:14px;box-sizing:border-box;}' +
    '#lulu-chat-stripe .x{position:absolute;top:10px;right:10px;z-index:2;border:1px solid #F0E2D8;background:#FFFEFC;' +
    'border-radius:50%;width:32px;height:32px;cursor:pointer;color:#6E6E7A;}' +
    '@media (max-width:560px){#lulu-chat-stripe{padding:0;align-items:stretch;}#lulu-chat-stripe .box{width:100%;max-height:100vh;border-radius:0;}}';
  var style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  /* ---------- DOM ---------- */
  var AV = '/assets/lulu-avatar.jpg';
  var launch = document.createElement('button');
  launch.id = 'lulu-chat-launch';
  launch.innerHTML = '<img src="' + AV + '" alt=""><span>' + T('Talk with Lulu', 'Habla con Lulu') + '</span>';
  document.body.appendChild(launch);

  var panel = null, msgsEl = null, inputEl = null, sendEl = null, typingEl = null;
  var messages = [];
  try { messages = JSON.parse(localStorage.getItem('lulu.webchat') || 'null') || [HELLO]; }
  catch (e) { messages = [HELLO]; }
  var busy = false;
  var seenIds = {};
  var lastAt = null;
  var pollTimer = null;
  function visitorId() {
    var v = null;
    try { v = localStorage.getItem('lulu.visitor'); } catch (e) { /* ignore */ }
    if (!v) {
      v = (window.crypto && crypto.randomUUID) ? crypto.randomUUID()
        : 'v-' + Date.now() + '-' + Math.random().toString(36).slice(2, 10);
      try { localStorage.setItem('lulu.visitor', v); } catch (e) { /* ignore */ }
    }
    return v;
  }
  function mapServerMsg(m) {
    var out = { role: m.role === 'user' ? 'me' : m.role === 'staff' ? 'staff' : 'lulu', text: m.body };
    if (m.staff_name) out.staffName = m.staff_name;
    var acts = (m.meta && m.meta.actions) || [];
    acts.forEach(function (a) {
      if (a.type === 'concept') out.concept = a.url;
      if (a.type === 'checkout') out.checkout = a;
      if (a.type === 'orders') out.orders = a.orders;
    });
    return out;
  }
  function loadHistory(sinceOnly) {
    var payload = { history: true, visitor_id: visitorId() };
    if (sinceOnly && lastAt) payload.since = lastAt;
    return fetch(cfg.SUPABASE_URL + '/functions/v1/lulu-agent', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }).then(function (r) { return r.json(); }).then(function (res) {
      var fresh = (res && res.messages) || [];
      if (!fresh.length) return false;
      if (!sinceOnly) { messages = []; seenIds = {}; }
      var added = false;
      fresh.forEach(function (m) {
        if (seenIds[m.id]) return;
        seenIds[m.id] = true;
        lastAt = m.created_at;
        messages.push(mapServerMsg(m));
        added = true;
      });
      if (!messages.length) messages = [HELLO];
      if (added) { save(); render(); }
      return added;
    }).catch(function () { return false; });
  }
  function startPolling() {
    stopPolling();
    pollTimer = setInterval(function () {
      if (!busy && panel && panel.style.display !== 'none') loadHistory(true);
    }, 6000);
  }
  function stopPolling() { if (pollTimer) { clearInterval(pollTimer); pollTimer = null; } }

  function save() {
    try { localStorage.setItem('lulu.webchat', JSON.stringify(messages.slice(-40))); } catch (e) { /* ignore */ }
  }

  function esc(sx) {
    return String(sx == null ? '' : sx).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function render() {
    if (!msgsEl) return;
    var html = '';
    messages.forEach(function (m) {
      if (m.role === 'me') {
        html += '<div class="lc-b lc-me">' + esc(m.text) + '</div>';
      } else if (m.role === 'staff') {
        html += '<div class="lc-row"><img src="' + AV + '" alt=""><div class="lc-b lc-lulu">' +
          '<div style="font-size:10px;font-weight:800;color:#9A4B60;margin-bottom:2px">👩‍🎨 ' +
          esc(m.staffName || T('Studio team', 'Equipo del estudio')) + '</div>' + esc(m.text) + '</div></div>';
      } else {
        html += '<div class="lc-row"><img src="' + AV + '" alt=""><div class="lc-b lc-lulu">' + esc(m.text) + '</div>' +
          (window.speechSynthesis ? '<button class="lc-spk" title="' + T('Hear Lulu (beta)', 'Escuchar a Lulu (beta)') + '" aria-label="' + T('Hear this message', 'Escuchar este mensaje') + '">🔊</button>' : '') + '</div>';
        if (m.concept) {
          html += '<div class="lc-concept"><img src="' + esc(m.concept) + '" alt="AI concept"><p>' +
            T('AI sketch — Lulu crochets the real one 💗', 'Boceto IA — Lulu teje la de verdad 💗') + '</p></div>';
        }
        if (m.checkout) {
          html += '<button class="lc-pay" data-code="' + esc(m.checkout.code) + '">💳 ' +
            T('Pay deposit', 'Pagar depósito') + ' · ' + esc(m.checkout.code) + '</button>';
        }
        if (m.orders) {
          m.orders.forEach(function (o) {
            html += '<div class="lc-order"><b>' + esc(o.item) + '</b><span>' + esc(o.code) + ' · ' + esc(o.stage) +
              (o.tracking ? ' · 📦' : '') + '</span></div>';
          });
        }
      }
    });
    msgsEl.innerHTML = html;
    typingEl.style.display = busy ? 'block' : 'none';
    msgsEl.scrollTop = msgsEl.scrollHeight;
    Array.prototype.forEach.call(msgsEl.querySelectorAll('.lc-spk'), function (b) {
      b.addEventListener('click', function () {
        var bubble = b.parentElement.querySelector('.lc-lulu');
        if (bubble) speak(bubble.textContent, b);
      });
    });
    Array.prototype.forEach.call(msgsEl.querySelectorAll('.lc-pay'), function (b) {
      b.addEventListener('click', function () {
        var m = messages.filter(function (x) { return x.checkout && x.checkout.code === b.getAttribute('data-code'); })[0];
        if (m) openPayment(m.checkout);
      });
    });
  }

  /* ---------- embedded Stripe from chat ---------- */
  var stripeLoading = null, stripeCheckout = null;
  function loadStripe() {
    if (window.Stripe) return Promise.resolve();
    if (stripeLoading) return stripeLoading;
    stripeLoading = new Promise(function (res, rej) {
      var sc = document.createElement('script');
      sc.src = 'https://js.stripe.com/v3/';
      sc.onload = res; sc.onerror = rej;
      document.head.appendChild(sc);
    });
    return stripeLoading;
  }
  function openPayment(co) {
    if (co.client_secret && cfg.STRIPE_PK) {
      loadStripe().then(function () {
        var wrap = document.getElementById('lulu-chat-stripe');
        if (!wrap) {
          wrap = document.createElement('div');
          wrap.id = 'lulu-chat-stripe';
          wrap.innerHTML = '<div class="box">' +
            '<div style="display:flex;align-items:center;gap:10px;padding:10px 12px;background:#FFF8F0;' +
            'border:1px solid #F0E2D8;border-radius:12px;margin-bottom:10px;position:sticky;top:0;z-index:3">' +
            '<span style="font-weight:900;font-size:16px;color:#2A2A33;white-space:nowrap">Lulu <b style="color:#E4657E">&amp;</b> Loop</span>' +
            '<span style="font-size:11px;font-weight:800;color:#9A4B60;line-height:1.3">' +
            T('🔒 Secure payment · you never leave luluandloop.com', '🔒 Pago seguro · nunca sales de luluandloop.com') + '</span>' +
            '<button class="x" style="position:static;margin-left:auto;flex-shrink:0">✕</button></div>' +
            '<div class="mount"></div></div>';
          document.body.appendChild(wrap);
          wrap.querySelector('.x').addEventListener('click', function () {
            if (stripeCheckout) { try { stripeCheckout.destroy(); } catch (e) { /* ignore */ } stripeCheckout = null; }
            wrap.remove();
          });
        }
        var stripe = window.Stripe(cfg.STRIPE_PK);
        return stripe.initEmbeddedCheckout({ clientSecret: co.client_secret }).then(function (checkout) {
          stripeCheckout = checkout;
          checkout.mount(wrap.querySelector('.mount'));
        });
      }).catch(function () { if (co.url) window.open(co.url, '_blank'); });
    } else if (co.url) {
      window.open(co.url, '_blank');
    }
  }

  /* ---------- agent call ---------- */
  function autogrow() {
    if (!inputEl) return;
    inputEl.style.height = 'auto';
    inputEl.style.height = Math.min(inputEl.scrollHeight, 96) + 'px';
  }

  function send() {
    var text = inputEl.value.trim();
    if (!text || busy) return;
    inputEl.value = '';
    autogrow();
    messages.push({ role: 'me', text: text });
    busy = true; save(); render();
    fetch(cfg.SUPABASE_URL + '/functions/v1/lulu-agent', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        visitor_id: visitorId(),
        message: text,
        source: 'web',
        jwt: window.LULU_CHAT_JWT || undefined
      })
    }).then(function (r) { return r.json(); }).then(function (res) {
      busy = false;
      // The server tells us the ids it stored for this round-trip; mark them
      // seen and advance the poll cursor so the 6s history poll doesn't
      // re-append the same pair (that was the double-message bug).
      ((res && res.message_ids) || []).forEach(function (id) { seenIds[id] = true; });
      if (res && res.last_at) lastAt = res.last_at;
      var m = { role: 'lulu', text: (res && res.reply) || '…' };
      (res && res.actions || []).forEach(function (a) {
        if (a.type === 'concept') m.concept = a.url;
        if (a.type === 'checkout') m.checkout = a;
        if (a.type === 'orders') m.orders = a.orders;
      });
      messages.push(m);
      save(); render();
    }).catch(function () {
      busy = false;
      messages.push({ role: 'lulu', text: T('My yarn got tangled 🧶 — say that once more?', 'Se me enredó el estambre 🧶 ¿me lo repites?') });
      save(); render();
    });
  }

  var isMobile = window.matchMedia('(max-width: 560px)').matches || 'ontouchstart' in window;
  var savedScrollY = 0;
  function lockBody() {
    if (!window.matchMedia('(max-width: 560px)').matches) return;
    savedScrollY = window.scrollY || 0;
    document.body.style.position = 'fixed';
    document.body.style.top = (-savedScrollY) + 'px';
    document.body.style.left = '0';
    document.body.style.right = '0';
    document.body.style.width = '100%';
  }
  function unlockBody() {
    if (!document.body.style.position) return;
    document.body.style.position = '';
    document.body.style.top = '';
    document.body.style.left = '';
    document.body.style.right = '';
    document.body.style.width = '';
    window.scrollTo(0, savedScrollY);
  }
  // Pin the panel to the VISUAL viewport so the iOS/Android keyboard shrinks
  // the chat instead of shoving the header and messages off-screen
  function fitPanel() {
    if (!panel || panel.style.display === 'none') return;
    if (!window.matchMedia('(max-width: 560px)').matches) {
      panel.style.height = ''; panel.style.top = ''; panel.style.transform = '';
      return;
    }
    var vv = window.visualViewport;
    if (vv) {
      panel.style.height = Math.round(vv.height) + 'px';
      panel.style.transform = 'translateY(' + Math.round(vv.offsetTop) + 'px)';
    } else {
      panel.style.height = window.innerHeight + 'px';
    }
    if (msgsEl) msgsEl.scrollTop = msgsEl.scrollHeight;
  }
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', fitPanel);
    window.visualViewport.addEventListener('scroll', fitPanel);
  }
  window.addEventListener('resize', fitPanel);

  function openPanel() {
    if (panel) {
      panel.style.display = 'flex'; launch.style.display = 'none';
      lockBody(); fitPanel(); render();
      loadHistory(false); startPolling();
      if (!isMobile) inputEl.focus();
      return;
    }
    panel = document.createElement('div');
    panel.id = 'lulu-chat-panel';
    panel.innerHTML =
      '<div class="lc-head"><img src="' + AV + '" alt="Lulu">' +
      '<div><div class="lc-name">Lulu <b>&amp;</b> Loop</div>' +
      '<div class="lc-sub">' + T('Lulu · always online 🧶', 'Lulu · siempre en línea 🧶') + '</div></div>' +
      '<button class="lc-close" aria-label="Close">✕</button></div>' +
      '<div class="lc-msgs"></div>' +
      '<div class="lc-typing" style="display:none;padding:0 14px 6px">' + T('Lulu is typing…', 'Lulu está escribiendo…') + '</div>' +
      '<div class="lc-compose"><textarea rows="1" placeholder="' +
      T('Tell Lulu your idea…', 'Cuéntale tu idea a Lulu…') + '"></textarea>' +
      '<button class="lc-mic" aria-label="' + T('Dictate', 'Dictar') + '" hidden>🎤</button>' +
      '<button class="lc-send" aria-label="Send">➤</button></div>';
    document.body.appendChild(panel);
    msgsEl = panel.querySelector('.lc-msgs');
    typingEl = panel.querySelector('.lc-typing');
    inputEl = panel.querySelector('textarea');
    sendEl = panel.querySelector('.lc-send');
    panel.querySelector('.lc-close').addEventListener('click', function () {
      panel.style.display = 'none';
      launch.style.display = 'flex';
      unlockBody();
      stopPolling();
    });
    // grow the composer with the text (up to max-height) so wrapped lines
    // are never half-clipped
    inputEl.addEventListener('input', autogrow);
    // when the keyboard opens on focus, re-fit and keep the thread pinned
    inputEl.addEventListener('focus', function () {
      setTimeout(fitPanel, 60);
      setTimeout(fitPanel, 350);
    });
    inputEl.addEventListener('blur', function () { setTimeout(fitPanel, 60); });
    sendEl.addEventListener('click', send);
    inputEl.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
    });

    /* ---- dictation: talk to Lulu instead of typing ---- */
    var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    var micEl = panel.querySelector('.lc-mic');
    if (SR && micEl) {
      micEl.hidden = false;
      var rec = null;
      micEl.addEventListener('click', function () {
        if (rec) { rec.stop(); return; }
        rec = new SR();
        rec.lang = ES ? 'es-MX' : 'en-US';
        rec.continuous = true;
        rec.interimResults = true;
        var base = inputEl.value ? inputEl.value.replace(/\s+$/, '') + ' ' : '';
        micEl.classList.add('rec');
        micEl.textContent = '⏹';
        rec.onresult = function (ev) {
          var text = '';
          for (var i = 0; i < ev.results.length; i++) text += ev.results[i][0].transcript + (ev.results[i].isFinal ? ' ' : '');
          inputEl.value = (base + text).replace(/\s+/g, ' ');
        };
        rec.onend = function () {
          micEl.classList.remove('rec');
          micEl.textContent = '🎤';
          rec = null;
          inputEl.focus();
        };
        rec.onerror = function () {
          micEl.classList.remove('rec');
          micEl.textContent = '🎤';
          rec = null;
        };
        try { rec.start(); } catch (e) { rec = null; micEl.classList.remove('rec'); micEl.textContent = '🎤'; }
      });
    }
    launch.style.display = 'none';
    lockBody();
    fitPanel();
    render();
    loadHistory(false);
    startPolling();
    if (!isMobile) inputEl.focus();
  }

  /* Keep the launcher clear of any fixed action bars (wizard total bar, etc.).
     Any page can also mark elements with [data-lulu-avoid]. */
  function avoidBars() {
    if (panel && panel.style.display !== 'none' &&
        window.matchMedia('(max-width: 560px)').matches) return; // full-screen chat: launcher hidden
    var lift = 0;
    var els = document.querySelectorAll('.mbar, [data-lulu-avoid]');
    Array.prototype.forEach.call(els, function (el) {
      var cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') return;
      var r = el.getBoundingClientRect();
      if (r.height > 0 && r.bottom > window.innerHeight - 4 && r.top < window.innerHeight) {
        lift = Math.max(lift, Math.round(window.innerHeight - r.top) + 10);
      }
    });
    launch.style.bottom = lift
      ? 'calc(' + (18 + lift) + 'px + env(safe-area-inset-bottom))'
      : '';
  }
  setInterval(avoidBars, 700);
  window.addEventListener('resize', avoidBars);
  window.addEventListener('hashchange', function () { setTimeout(avoidBars, 150); });
  avoidBars();

  /* ---- 🔊 read Lulu's messages aloud (beta) ---- */
  var voices = [];
  function loadVoices() { voices = window.speechSynthesis ? speechSynthesis.getVoices() : []; }
  if (window.speechSynthesis) {
    loadVoices();
    speechSynthesis.addEventListener('voiceschanged', loadVoices);
  }
  var speakingBtn = null;
  function speak(text, btn) {
    if (!window.speechSynthesis) return;
    if (speakingBtn === btn && speechSynthesis.speaking) {
      speechSynthesis.cancel();
      btn.classList.remove('on');
      speakingBtn = null;
      return;
    }
    speechSynthesis.cancel();
    if (speakingBtn) speakingBtn.classList.remove('on');
    var u = new SpeechSynthesisUtterance(text.replace(/[🧶💗🐢✨📦⭐💳]/g, ''));
    u.lang = ES ? 'es-MX' : 'en-US';
    var pref = voices.filter(function (v) { return v.lang && v.lang.indexOf(ES ? 'es' : 'en') === 0; });
    var mx = pref.filter(function (v) { return /MX|US/.test(v.lang); });
    if ((mx[0] || pref[0])) u.voice = mx[0] || pref[0];
    u.rate = 1.0; u.pitch = 1.05;
    u.onend = u.onerror = function () { btn.classList.remove('on'); speakingBtn = null; };
    btn.classList.add('on');
    speakingBtn = btn;
    speechSynthesis.speak(u);
  }

  function applyLang() {
    var was = ES;
    ES = detectES();
    if (ES === was) return;
    var sp = launch.querySelector('span');
    if (sp) sp.textContent = T('Talk with Lulu', 'Habla con Lulu');
    if (panel) {
      panel.querySelector('.lc-sub').textContent = T('Lulu · always online 🧶', 'Lulu · siempre en línea 🧶');
      inputEl.placeholder = T('Tell Lulu your idea…', 'Cuéntale tu idea a Lulu…');
      typingEl.textContent = T('Lulu is typing…', 'Lulu está escribiendo…');
      var mic = panel.querySelector('.lc-mic');
      if (mic) mic.setAttribute('aria-label', T('Dictate', 'Dictar'));
    }
    // refresh the greeting if it's still the only message
    if (messages.length === 1 && messages[0].role === 'lulu' && !messages[0].concept) {
      messages[0].text = T("Hi! I'm Lulu 💗 Tell me what you'd love me to crochet — or ask me anything about your order.",
        '¡Hola! Soy Lulu 💗 Cuéntame qué te gustaría que tejiera — o pregúntame lo que sea de tu pedido.');
    }
    render();
  }
  window.addEventListener('lulu-lang', applyLang);
  window.addEventListener('storage', applyLang);
  setInterval(applyLang, 1200); // catches toggles even without the event

  launch.addEventListener('click', openPanel);
  window.addEventListener('lulu-chat-open', openPanel);
})();
