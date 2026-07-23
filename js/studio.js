/* Lulu & Loop — studio backend
   Board, team and payments views recreated from the design handoff (1b Backend).
   Demo/seed orders + live web orders from the customer wizard (localStorage).
   NOTE: the passphrase gate is a lightweight client-side lock, not real
   authentication — swap it for a real auth layer before storing customer PII. */
(function () {
  'use strict';

  var CAPACITY = 4;
  // SHA-256 of the studio passphrase (see README to change it)
  var PASS_HASH = '0f89c4839feb69124c67993c766c582abd71c3e3703e5073eae12e623ee75119';

  var ARTISANS = [
    { name: 'Lourdes “Lulu”', role: 'Founder · faces & final details', color: '#E4657E' },
    { name: 'Marisol', role: 'Blankets, lace & borders', color: '#8A6FA8' },
    { name: 'Carmen', role: 'Amigurumi bodies & outfits', color: '#5E8B6A' },
    { name: 'Yesenia', role: 'Wearables & sizing', color: '#C08A3E' },
    { name: 'Beatriz', role: 'Assembly, stuffing & QC', color: '#5B7A99' }];

  var STAGES = ['New request', 'Quoted', 'Queue · paid', 'In progress', 'Ready · balance', 'Shipped'];
  var STAGE_DOTS = ['#B6B1BC', '#C08A3E', '#8A6FA8', '#5E8B6A', '#E4657E', '#5B7A99'];

  var SEED_ORDERS = [
    { code: 'LU-2607-0155', customer: 'Grace L.', where: 'Dublin, IE', item: 'Christening blanket, butterfly', size: 'Crib · 36×48in', price: 240, stage: 0, artisan: '', img: '/assets/blanket-white.jpg', desc: 'All white, one butterfly like my mother made for me. Christening is in October.', colors: 'white, pearl', rush: false },
    { code: 'LU-2607-0158', customer: 'Julia P.', where: 'Austin, TX', item: 'Stroller blanket + rattle', size: 'Stroller · 30×36in', price: 165, stage: 0, artisan: '', img: '/assets/blanket-mint.jpg', desc: 'Mint with pink flowers for my niece — matching bunny rattle if possible.', colors: 'mint, rose', rush: false },
    { code: 'LU-2607-0154', customer: 'Isabel M.', where: 'Miami, FL', item: 'Fairy bear, birthday gift', size: 'Classic · 10in', price: 95, stage: 1, artisan: '', img: '/assets/bear-fairy.jpg', desc: 'A little bear with fairy wings and a sparkly tutu — she turns 6.', colors: 'taupe, glitter red', rush: true },
    { code: 'LU-2607-0159', customer: 'Amara B.', where: 'London, UK', item: 'Kids cardigan, sage', size: 'Cardigan · 4y', price: 110, stage: 1, artisan: 'Yesenia', img: '/assets/squirrel-red.jpg', desc: 'Sage green with cream buttons, roomy fit for a tall 4-year-old.', colors: 'sage, cream', rush: false },
    { code: 'LU-2607-0151', customer: 'Sofía R.', where: 'CDMX, MX', item: 'Magical guardian doll', size: 'Grand · 14in', price: 140, stage: 2, artisan: 'Lourdes “Lulu”', img: '/assets/doll-blonde.jpg', desc: 'Like the heroine from my childhood — long golden twin-tails, sailor collar, red bow.', colors: 'gold, navy, red', rush: false },
    { code: 'LU-2607-0157', customer: 'Nadia K.', where: 'Toronto, CA', item: 'Party charms ×10, sea animals', size: 'Set · 2.5in ×10', price: 130, stage: 2, artisan: '', img: '/assets/bunny-overalls.jpg', desc: 'Ten mini sea friends for party favor bags — octopus, whale, turtle mix.', colors: 'ocean blues', rush: false },
    { code: 'LU-2607-0148', customer: 'Priya S.', where: 'Boston, MA', item: 'Witch-cat with broom', size: 'Classic · 12in', price: 95, stage: 3, artisan: 'Carmen', img: '/assets/witch-cat.jpg', desc: 'My daughter’s gray cat as a little witch — purple nose, black hat and dress, tiny broom.', colors: 'gray, black, purple', rush: false },
    { code: 'LU-2607-0147', customer: 'Emma T.', where: 'Seattle, WA', item: 'Sunshine crib blanket', size: 'Crib · 36×48in', price: 240, stage: 3, artisan: 'Marisol', img: '/assets/blanket-yellow.jpg', desc: 'Butter yellow with white bunnies along the corner, lace border.', colors: 'butter, white', rush: false },
    { code: 'LU-2607-0156', customer: 'Diego R.', where: 'CDMX, MX', item: 'Coquette squirrel', size: 'Classic · 10in', price: 95, stage: 3, artisan: 'Lourdes “Lulu”', img: '/assets/squirrel-red.jpg', desc: 'A red squirrel in a green striped dress with a fluffy stole — like the one from your gallery, but with glasses.', colors: 'brick red, green', rush: false },
    { code: 'LU-2607-0152', customer: 'Mark D.', where: 'NYC, NY', item: 'Little blue friend', size: 'Classic · 12in', price: 118, stage: 4, artisan: 'Carmen', img: '/assets/doll-blue.jpg', desc: 'From my son’s drawing — blue guy, big ears, white hat and pants.', colors: 'sky blue, white', rush: true, balanceSent: true },
    { code: 'LU-2607-0150', customer: 'Chloe N.', where: 'Paris, FR', item: 'Butterfly lovey', size: 'Lovey · 12×12in', price: 55, stage: 4, artisan: 'Marisol', img: '/assets/blanket-white.jpg', desc: 'Small white lovey with a single butterfly, for a newborn photoshoot.', colors: 'ivory', rush: false },
    { code: 'LU-2607-0153', customer: 'Hannah W.', where: 'Sydney, AU', item: 'Garden bunny in overalls', size: 'Grand · 14in', price: 140, stage: 5, artisan: 'Yesenia', img: '/assets/bunny-overalls.jpg', desc: 'Cream bunny with gingham overalls and pink boots, floppy ears.', colors: 'cream, denim blue', rush: false }];

  var state = { view: 'board', selected: null, orders: [] };

  function $(id) { return document.getElementById(id); }
  function fmt(n) { return '$' + n; }
  function dep(o) { return Math.round(o.price * .4); }
  function bal(o) { return o.price - dep(o); }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* ---------- Data: seed + web orders + saved overrides ---------- */
  function loadOrders() {
    var orders = SEED_ORDERS.map(function (o) { return Object.assign({}, o); });
    try {
      var web = JSON.parse(localStorage.getItem('luluandloop.orders') || '[]');
      web.forEach(function (w) {
        if (!w || !w.code || orders.some(function (o) { return o.code === w.code; })) return;
        orders.push({
          code: w.code, customer: w.customer || 'Web order', where: w.where || 'Online',
          item: w.item || 'Custom piece', size: w.size || '—', price: w.price || 0,
          stage: typeof w.stage === 'number' ? w.stage : 2, artisan: w.artisan || '',
          img: (typeof w.img === 'string' && /^\/assets\/[\w.-]+$/.test(w.img)) ? w.img : '/assets/doll-blonde.jpg',
          desc: w.desc || '', colors: w.colors || '—',
          rush: !!w.rush, balanceSent: !!w.balanceSent, web: true
        });
      });
    } catch (e) { /* ignore malformed storage */ }
    try {
      var saved = JSON.parse(localStorage.getItem('luluandloop.studio.overrides') || '{}');
      orders.forEach(function (o) {
        var ov = saved[o.code];
        if (ov) {
          if (typeof ov.stage === 'number') o.stage = ov.stage;
          if (typeof ov.artisan === 'string') o.artisan = ov.artisan;
          if (typeof ov.balanceSent === 'boolean') o.balanceSent = ov.balanceSent;
        }
      });
    } catch (e) { /* ignore */ }
    return orders;
  }

  function persistOverrides() {
    var saved = {};
    var seedByCode = {};
    SEED_ORDERS.forEach(function (s) { seedByCode[s.code] = s; });
    state.orders.forEach(function (o) {
      var s = seedByCode[o.code];
      var base = s || { stage: 2, artisan: '', balanceSent: false };
      if (o.stage !== base.stage || o.artisan !== (base.artisan || '') || !!o.balanceSent !== !!base.balanceSent) {
        saved[o.code] = { stage: o.stage, artisan: o.artisan, balanceSent: !!o.balanceSent };
      }
    });
    try { localStorage.setItem('luluandloop.studio.overrides', JSON.stringify(saved)); } catch (e) { /* ignore */ }
  }

  /* ---------- Chips ---------- */
  function payChip(o) {
    if (o.stage >= 5) return { label: 'paid in full', cls: 'green' };
    if (o.stage === 4) return o.balanceSent ? { label: 'bal. link sent', cls: 'pinky' } : { label: 'balance due', cls: 'pinky' };
    if (o.stage >= 2) return { label: '40% paid', cls: 'soft' };
    return { label: 'no payment', cls: 'mute' };
  }

  /* ---------- Header ---------- */
  function renderHead() {
    var titles = { board: 'Order board', team: 'Team & workload', pay: 'Payments' };
    $('view-title').textContent = titles[state.view];
    var now = new Date();
    var d = now.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    $('date-chip').textContent = d + ' · ' + now.getFullYear();
    Array.prototype.forEach.call(document.querySelectorAll('#side-nav button'), function (b) {
      b.classList.toggle('active', b.getAttribute('data-view') === state.view);
    });
  }

  function renderStats() {
    var orders = state.orders;
    var openCount = orders.filter(function (o) { return o.stage < 5; }).length;
    var depositsHeld = orders.filter(function (o) { return o.stage >= 2 && o.stage < 5; })
      .reduce(function (a, o) { return a + dep(o); }, 0);
    var balanceDue = orders.filter(function (o) { return o.stage === 4; })
      .reduce(function (a, o) { return a + bal(o); }, 0);
    var received = orders.filter(function (o) { return o.stage >= 2; }).reduce(function (a, o) { return a + dep(o); }, 0) +
      orders.filter(function (o) { return o.stage === 5; }).reduce(function (a, o) { return a + bal(o); }, 0);
    var month = new Date().toLocaleDateString('en-US', { month: 'long' });
    var newCount = orders.filter(function (o) { return o.stage === 0; }).length;
    var readyCount = orders.filter(function (o) { return o.stage === 4; }).length;
    var tiles = [
      { label: 'Open orders', value: String(openCount), sub: newCount + ' new this week' },
      { label: 'Deposits held', value: fmt(depositsHeld), sub: '40% upfront · Stripe' },
      { label: 'Balance outstanding', value: fmt(balanceDue), sub: readyCount + ' pieces ready' },
      { label: month + ' revenue', value: fmt(received), sub: 'received via Stripe' }];
    $('stats').innerHTML = tiles.map(function (s) {
      return '<div class="stat-tile"><div class="stat-label">' + esc(s.label) + '</div>' +
        '<div class="stat-value display">' + esc(s.value) + '</div>' +
        '<div class="stat-sub">' + esc(s.sub) + '</div></div>';
    }).join('');
  }

  /* ---------- Board ---------- */
  function renderBoard() {
    $('view-board').innerHTML = STAGES.map(function (name, i) {
      var cards = state.orders.filter(function (o) { return o.stage === i; });
      var cardsHtml = cards.map(function (o) {
        var pc = payChip(o);
        var artisan = o.artisan
          ? '<span class="artisan-chip" style="color:' + (ARTISANS.find(function (a) { return a.name === o.artisan; }) || { color: '#B6B1BC' }).color + '">' + esc(o.artisan.split(' ')[0]) + '</span>'
          : '<span class="artisan-chip" style="color:#B6B1BC">＋ assign</span>';
        return '<button type="button" class="order-card" data-code="' + esc(o.code) + '">' +
          '<div class="order-card-top"><img src="' + esc(o.img) + '" alt="">' +
          '<div class="order-card-min"><div class="order-card-item">' + esc(o.item) + '</div>' +
          '<div class="order-card-cust">' + esc(o.customer) + ' · ' + esc(o.code.slice(-4)) + '</div></div></div>' +
          '<div class="order-card-foot"><span class="order-card-price">' + fmt(o.price) + '</span>' +
          '<span class="chip ' + pc.cls + '">' + esc(pc.label) + '</span>' +
          (o.rush ? '<span class="rush-flag">⚡</span>' : '') + artisan + '</div></button>';
      }).join('');
      return '<div class="board-col"><div class="board-col-head">' +
        '<span class="board-dot" style="background:' + STAGE_DOTS[i] + '"></span>' +
        '<span class="board-col-name">' + esc(name) + '</span>' +
        '<span class="board-count">' + cards.length + '</span></div>' +
        '<div class="board-cards">' + cardsHtml + '</div></div>';
    }).join('');
    Array.prototype.forEach.call(document.querySelectorAll('.order-card'), function (el) {
      el.addEventListener('click', function () { openDrawer(el.getAttribute('data-code')); });
    });
  }

  /* ---------- Team ---------- */
  function renderTeam() {
    $('view-team').innerHTML = ARTISANS.map(function (a) {
      var pieces = state.orders.filter(function (o) { return o.artisan === a.name && o.stage >= 1 && o.stage < 5; });
      var load = pieces.length;
      var pct = Math.min(100, Math.round(load / CAPACITY * 100));
      var chipCls = load >= CAPACITY ? 'pinky' : load === 0 ? 'green' : 'soft';
      var chipLabel = load >= CAPACITY ? 'at capacity' : load === 0 ? 'free' : 'active';
      var barColor = load >= CAPACITY ? '#E4657E' : a.color;
      var piecesHtml = pieces.map(function (p) {
        return '<div class="team-piece"><img src="' + esc(p.img) + '" alt="">' +
          '<span class="team-piece-item">' + esc(p.item) + '</span>' +
          '<span class="team-piece-stage">' + esc(STAGES[p.stage].split(' ·')[0]) + '</span></div>';
      }).join('');
      return '<div class="team-card"><div class="team-head">' +
        '<div class="team-avatar" style="background:' + a.color + '">' + esc(a.name[0]) + '</div>' +
        '<div><div class="team-name">' + esc(a.name) + '</div><div class="team-role">' + esc(a.role) + '</div></div>' +
        '<span class="chip team-load-chip ' + chipCls + '">' + chipLabel + '</span></div>' +
        '<div class="team-cap-row"><span>Active pieces</span><span>' + load + ' / ' + CAPACITY + '</span></div>' +
        '<div class="team-bar"><div class="team-bar-fill" style="width:' + pct + '%;background:' + barColor + '"></div></div>' +
        '<div class="team-pieces">' + piecesHtml + '</div></div>';
    }).join('');
  }

  /* ---------- Payments ---------- */
  function renderPayments() {
    var rows = [];
    state.orders.forEach(function (o) {
      if (o.stage >= 2) rows.push({ item: o.item, customer: o.customer, type: 'Deposit 40%', amount: fmt(dep(o)), status: 'succeeded', cls: 'green', ref: 'pi_3Q' + o.code.slice(-4) + 'dLx' });
      if (o.stage === 5) rows.push({ item: o.item, customer: o.customer, type: 'Balance 60%', amount: fmt(bal(o)), status: 'succeeded', cls: 'green', ref: 'pi_3Q' + o.code.slice(-4) + 'bFn' });
      else if (o.stage === 4) rows.push({ item: o.item, customer: o.customer, type: 'Balance 60%', amount: fmt(bal(o)), status: o.balanceSent ? 'link sent · pending' : 'not requested', cls: o.balanceSent ? 'amber' : 'mute', ref: o.balanceSent ? 'plink_1R' + o.code.slice(-4) : '—' });
    });
    $('pay-rows').innerHTML = rows.map(function (tx) {
      return '<div class="pay-row"><span class="pay-item">' + esc(tx.item) + '</span>' +
        '<span class="pay-cust">' + esc(tx.customer) + '</span>' +
        '<span class="pay-type">' + esc(tx.type) + '</span>' +
        '<span class="pay-amount">' + tx.amount + '</span>' +
        '<span><span class="chip ' + tx.cls + '">' + esc(tx.status) + '</span></span>' +
        '<span class="pay-ref">' + esc(tx.ref) + '</span></div>';
    }).join('');
  }

  /* ---------- Drawer ---------- */
  function selectedOrder() {
    return state.orders.find(function (o) { return o.code === state.selected; });
  }

  var lastFocus = null;

  function openDrawer(code) {
    lastFocus = document.activeElement;
    state.selected = code;
    renderDrawer();
    $('drawer-root').hidden = false;
    $('drawer-close').focus();
  }

  function closeDrawer() {
    var code = state.selected;
    state.selected = null;
    $('drawer-root').hidden = true;
    // The board re-renders while the drawer is open, so re-find the card
    var back = code && document.querySelector('.order-card[data-code="' + code + '"]');
    if (back) back.focus();
    else if (lastFocus && document.contains(lastFocus)) lastFocus.focus();
    lastFocus = null;
  }

  function renderDrawer() {
    var o = selectedOrder();
    if (!o) { closeDrawer(); return; }
    $('drawer-code').textContent = o.code;
    $('drawer-item').textContent = o.item;
    $('drawer-cust').textContent = o.customer + ' · ' + o.where;
    $('drawer-img').src = o.img;
    $('drawer-desc').textContent = '“' + o.desc + '”';
    $('drawer-chips').innerHTML =
      '<span class="tag">' + esc(o.size) + '</span>' +
      '<span class="tag">🎨 ' + esc(o.colors) + '</span>' +
      (o.rush ? '<span class="tag rush">⚡ rush +25%</span>' : '');
    $('drawer-price').textContent = fmt(o.price);
    var depEl = $('drawer-dep'), balEl = $('drawer-bal');
    if (o.stage >= 2) { depEl.innerHTML = '<span class="chip green">✓ paid — ' + fmt(dep(o)) + '</span>'; }
    else { depEl.innerHTML = '<span class="chip mute">awaiting — ' + fmt(dep(o)) + '</span>'; }
    if (o.stage >= 5) { balEl.innerHTML = '<span class="chip green">✓ paid — ' + fmt(bal(o)) + '</span>'; }
    else if (o.balanceSent) { balEl.innerHTML = '<span class="chip amber">link sent — ' + fmt(bal(o)) + '</span>'; }
    else { balEl.innerHTML = '<span class="chip mute">due at ship — ' + fmt(bal(o)) + '</span>'; }

    var sel = $('drawer-artisan');
    sel.innerHTML = '<option value="">— Unassigned —</option>' + ARTISANS.map(function (a) {
      var load = state.orders.filter(function (x) { return x.artisan === a.name && x.stage >= 1 && x.stage < 5; }).length;
      var specialty = a.role.split(' ·')[0].toLowerCase();
      return '<option value="' + esc(a.name) + '">' + esc(a.name + ' — ' + specialty + ' (' + load + '/' + CAPACITY + ')') + '</option>';
    }).join('');
    sel.value = o.artisan;

    var adv = $('drawer-advance');
    if (o.stage < 5) {
      adv.hidden = false;
      adv.textContent = o.stage === 4 ? 'Mark shipped 🎁' : 'Advance to “' + STAGES[o.stage + 1] + '”';
    } else adv.hidden = true;

    var blb = $('drawer-balance-link');
    if (o.stage === 4 && !o.balanceSent) {
      blb.hidden = false;
      blb.textContent = 'Send Stripe balance link · ' + fmt(bal(o));
    } else blb.hidden = true;
  }

  function updateSelected(fn) {
    var o = selectedOrder();
    if (!o) return;
    fn(o);
    persistOverrides();
    renderDrawer();
    renderStats();
    renderCurrentView();
  }

  /* ---------- View switching ---------- */
  function renderCurrentView() {
    ['board', 'team', 'pay'].forEach(function (v) {
      $('view-' + v).classList.toggle('active', state.view === v);
    });
    if (state.view === 'board') renderBoard();
    if (state.view === 'team') renderTeam();
    if (state.view === 'pay') renderPayments();
    renderHead();
  }

  function renderAll() {
    renderHead();
    renderStats();
    renderCurrentView();
  }

  /* ---------- Gate ---------- */
  function sha256Hex(str) {
    if (!(window.crypto && crypto.subtle)) {
      // Web Crypto needs a secure context (HTTPS or localhost)
      return Promise.reject(new Error('Web Crypto unavailable'));
    }
    var data = new TextEncoder().encode(str);
    return crypto.subtle.digest('SHA-256', data).then(function (buf) {
      return Array.prototype.map.call(new Uint8Array(buf), function (b) {
        return b.toString(16).padStart(2, '0');
      }).join('');
    });
  }

  function unlock() {
    $('gate').hidden = true;
    $('app').hidden = false;
    state.orders = loadOrders();
    renderAll();
  }

  function initGate() {
    var authed = false;
    try { authed = sessionStorage.getItem('luluandloop.studio.auth') === '1'; } catch (e) { /* ignore */ }
    if (authed) { unlock(); return; }
    $('gate-form').addEventListener('submit', function (e) {
      e.preventDefault();
      var input = $('gate-pass');
      sha256Hex(input.value).then(function (hex) {
        if (hex === PASS_HASH) {
          try { sessionStorage.setItem('luluandloop.studio.auth', '1'); } catch (err) { /* ignore */ }
          unlock();
        } else {
          input.classList.add('error');
          $('gate-error').textContent = 'That’s not it — try again.';
          $('gate-error').classList.add('show');
        }
      }).catch(function () {
        input.classList.add('error');
        $('gate-error').textContent = 'Unlocking needs a secure connection (HTTPS or localhost).';
        $('gate-error').classList.add('show');
      });
    });
    $('gate-pass').addEventListener('input', function (e) {
      e.target.classList.remove('error');
      $('gate-error').classList.remove('show');
    });
  }

  /* ---------- Events ---------- */
  Array.prototype.forEach.call(document.querySelectorAll('#side-nav button'), function (b) {
    b.addEventListener('click', function () {
      state.view = b.getAttribute('data-view');
      renderCurrentView();
    });
  });
  $('drawer-scrim').addEventListener('click', closeDrawer);
  $('drawer-close').addEventListener('click', closeDrawer);
  document.addEventListener('keydown', function (e) {
    var root = $('drawer-root');
    if (root.hidden) return;
    if (e.key === 'Escape') { closeDrawer(); return; }
    if (e.key === 'Tab') {
      var focusables = root.querySelectorAll('button:not([hidden]), select');
      if (!focusables.length) return;
      var first = focusables[0], last = focusables[focusables.length - 1];
      var inside = root.contains(document.activeElement);
      if (e.shiftKey && (document.activeElement === first || !inside)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && (document.activeElement === last || !inside)) { e.preventDefault(); first.focus(); }
    }
  });
  $('drawer-artisan').addEventListener('change', function (e) {
    updateSelected(function (o) { o.artisan = e.target.value; });
  });
  $('drawer-advance').addEventListener('click', function () {
    updateSelected(function (o) { o.stage = Math.min(5, o.stage + 1); });
  });
  $('drawer-balance-link').addEventListener('click', function () {
    updateSelected(function (o) { o.balanceSent = true; });
  });

  initGate();
})();
