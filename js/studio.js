/* Lulu & Loop — studio backend.
   Role-based views on top of the LuluAPI store (demo localStorage or Supabase):
   - owner:   Order board · Team & workload · Payments · Staff · Tasks
   - artisan: My pieces (stage reporting + WIP photos) · My tasks (evidence uploads)
   Task pillars come from the business plan's social media engine. */
(function () {
  'use strict';

  var S = window.LuluAPI.store;
  var esc = window.LuluAPI.esc;
  var STAGES = window.LuluAPI.STAGES;
  var PILLARS = window.LuluAPI.PILLARS;
  var STAGE_DOTS = ['#B6B1BC', '#C08A3E', '#5E8B6A', '#E4657E', '#5B7A99'];
  // Demo gate passphrase hash (see README to change); unused in cloud mode
  var PASS_HASH = '0f89c4839feb69124c67993c766c582abd71c3e3703e5073eae12e623ee75119';

  var state = { view: 'board', selected: null, me: null,
    profiles: [], orders: [], tasks: [], reports: [], payouts: [], shares: [],
    emailLog: [], thread: [], threadOrder: null,
    shipRates: null, customerQuery: '', highlightTask: null };

  function $(id) { return document.getElementById(id); }
  function fmt(n) { return '$' + Math.round(n); }
  // Prefer the stored amounts — after a quote edit the deposit stays fixed
  // while the balance absorbs the change, so 40/60 recomputation would drift
  function dep(o) { return o.deposit != null ? Number(o.deposit) : Math.round(o.price * .4); }
  function bal(o) { return o.balance != null ? Number(o.balance) : o.price - dep(o); }
  function profile(id) { return state.profiles.find(function (p) { return p.id === id; }); }
  function isOwner() { return state.me && state.me.role === 'owner'; }
  function isManager() { return state.me && (state.me.role === 'owner' || state.me.role === 'supervisor'); }
  function pillar(id) { return PILLARS.find(function (p) { return p.id === id; }) || PILLARS[PILLARS.length - 1]; }
  function fmtDate(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    return isNaN(d) ? '' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
  function toast(msg, isError) {
    var el = document.createElement('div');
    el.className = 'toast' + (isError ? ' error' : '');
    el.textContent = msg;
    ($('toast-region') || document.body).appendChild(el);
    setTimeout(function () { el.classList.add('show'); }, 10);
    setTimeout(function () { el.classList.remove('show'); setTimeout(function () { el.remove(); }, 400); }, 3600);
  }
  // Only http(s) evidence links get rendered as anchors (blocks javascript: URLs)
  function safeUrl(u) {
    u = String(u || '').trim();
    return /^https?:\/\//i.test(u) ? u : '';
  }
  function safeColor(c) {
    return /^#[0-9A-Fa-f]{6}$/.test(String(c)) ? c : '#8A6FA8';
  }

  // Client-side stage-transition guard (the DB trigger enforces the same rules)
  function advanceGuard(o, target) {
    if ((target === 2 || target === 3) && !o.artisan_id) {
      return 'Assign an artisan before moving to “' + STAGES[target] + '”';
    }
    if (target === 4 && S.mode === 'cloud') {
      if (!o.approved_at) return 'The customer must approve the finished piece first';
      if (!balPaid(o)) return 'The balance must be paid before shipping';
    }
    return null;
  }

  /* ---------- Data refresh ---------- */
  function refresh() {
    var mine = isManager() ? null : state.me.id;
    var loads = [
      S.listProfiles(),
      S.listOrders(),
      S.listTasks(mine),
      S.listReports(null),
      isOwner() ? S.listPayouts() : Promise.resolve([]),
      isManager() ? S.listCustomerUploads().catch(function () { return []; }) : Promise.resolve([]),
      isManager() ? S.listEmailLog().catch(function () { return []; }) : Promise.resolve([])
    ];
    return Promise.all(loads).then(function (r) {
      state.profiles = r[0];
      state.orders = r[1];
      state.tasks = r[2];
      state.reports = r[3];
      state.payouts = r[4];
      state.shares = r[5];
      state.emailLog = r[6];
    }).catch(function (e) { toast('Could not load data: ' + e.message, true); });
  }

  /* ---------- Payment chips ----------
     Payment truth comes from the paid_at stamps (set by the Stripe webhook in
     cloud mode, materialized from stage in demo mode) — never from the stage an
     artisan can move. */
  function depPaid(o) { return !!o.deposit_paid_at; }
  function balPaid(o) { return !!o.balance_paid_at; }
  function payChip(o) {
    if (balPaid(o)) return { label: 'paid in full', cls: 'green' };
    if (o.stage === 3) return o.balance_sent_at ? { label: 'bal. link sent', cls: 'pinky' } : { label: 'balance due', cls: 'pinky' };
    if (depPaid(o)) return { label: 'deposit paid', cls: 'soft' };
    return { label: 'no payment', cls: 'mute' };
  }

  /* ---------- Header / nav ---------- */
  var NAVS = {
    owner: [['board', '⬚', 'Order board'], ['team', '✿', 'Team & workload'], ['pay', '⟳', 'Payments'],
            ['customers', '♡', 'Customers'], ['staff', '✚', 'Staff'], ['tasks', '✓', 'Tasks'],
            ['payouts', '◈', 'Artisan payouts']],
    supervisor: [['board', '⬚', 'Order board'], ['team', '✿', 'Team & workload'], ['pay', '⟳', 'Payments'],
            ['customers', '♡', 'Customers'], ['tasks', '✓', 'Tasks']],
    artisan: [['mypieces', '⬚', 'My pieces'], ['mytasks', '✓', 'My tasks']]
  };
  var TITLES = { board: 'Order board', team: 'Team & workload', pay: 'Payments',
    staff: 'Staff', tasks: 'Tasks & content engine', mypieces: 'My pieces', mytasks: 'My tasks',
    customers: 'Customers', payouts: 'Artisan payouts' };

  function renderNav() {
    var items = NAVS[state.me.role] || NAVS.artisan;
    $('side-nav').innerHTML = items.map(function (it) {
      var active = state.view === it[0] ? ' class="active"' : '';
      return '<button data-view="' + it[0] + '"' + active + '>' + it[1] + ' ' + esc(it[2]) + '</button>';
    }).join('');
    Array.prototype.forEach.call(document.querySelectorAll('#side-nav button'), function (b) {
      b.addEventListener('click', function () {
        state.view = b.getAttribute('data-view');
        renderAll();
      });
    });
    $('side-avatar').textContent = state.me.name[0];
    $('side-avatar').style.background = state.me.color || '#E4657E';
    $('side-user-name').textContent = state.me.name;
    var roleLabel = { owner: 'Founder', supervisor: 'Supervisor', artisan: 'Artisan' }[state.me.role] || 'Staff';
    $('side-user-role').textContent = roleLabel +
      (state.me.specialty ? ' · ' + state.me.specialty.split(',')[0] : '');
  }

  function renderHead() {
    $('view-title').textContent = TITLES[state.view] || '';
    var now = new Date();
    $('date-chip').textContent = now.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) + ' · ' + now.getFullYear();
    $('head-note').textContent = S.mode === 'demo' ? 'demo data · configure Stripe + Supabase to go live' : 'live · payments via Stripe';
  }

  /* ---------- Stats ---------- */
  function renderStats() {
    var tiles;
    if (isManager()) {
      var orders = state.orders;
      var openCount = orders.filter(function (o) { return o.stage < 4; }).length;
      var depositsHeld = orders.filter(function (o) { return depPaid(o) && o.stage < 4 && !balPaid(o); })
        .reduce(function (a, o) { return a + dep(o); }, 0);
      var balanceDue = orders.filter(function (o) { return o.stage === 3 && !balPaid(o); })
        .reduce(function (a, o) { return a + bal(o); }, 0);
      // Cloud mode has real payment dates → scope revenue to the current month;
      // demo stamps are the sentinel 'demo' (no dates) → show total received.
      function inThisMonth(iso) {
        var d = new Date(iso), n = new Date();
        return iso && !isNaN(d) && d.getMonth() === n.getMonth() && d.getFullYear() === n.getFullYear();
      }
      var monthScoped = S.mode !== 'demo';
      var received = orders.filter(function (o) { return monthScoped ? inThisMonth(o.deposit_paid_at) : depPaid(o); })
        .reduce(function (a, o) { return a + dep(o); }, 0) +
        orders.filter(function (o) { return monthScoped ? inThisMonth(o.balance_paid_at) : balPaid(o); })
        .reduce(function (a, o) { return a + bal(o); }, 0);
      var month = new Date().toLocaleDateString('en-US', { month: 'long' });
      tiles = [
        { label: 'Open orders', value: String(openCount), sub: orders.filter(function (o) { return o.stage === 0; }).length + ' new this week' },
        { label: 'Deposits held', value: fmt(depositsHeld), sub: '40% upfront · Stripe' },
        { label: 'Balance outstanding', value: fmt(balanceDue), sub: orders.filter(function (o) { return o.stage === 3 && !balPaid(o); }).length + ' pieces ready' },
        { label: monthScoped ? month + ' revenue' : 'Revenue received', value: fmt(received), sub: 'via Stripe' }];
    } else {
      var mine = state.orders.filter(function (o) { return o.artisan_id === state.me.id && o.stage >= 1 && o.stage < 4; });
      var open = state.tasks.filter(function (t) { return t.status === 'open'; });
      var soon = open.filter(function (t) {
        return t.due_date && (new Date(t.due_date) - new Date()) < 3 * 864e5;
      });
      tiles = [
        { label: 'My active pieces', value: String(mine.length), sub: 'of ' + (state.me.capacity || 4) + ' capacity' },
        { label: 'Open tasks', value: String(open.length), sub: 'content engine' },
        { label: 'Due in 3 days', value: String(soon.length), sub: 'don’t leave Lulu waiting' },
        { label: 'Submitted', value: String(state.tasks.filter(function (t) { return t.status === 'submitted'; }).length), sub: 'awaiting review' }];
    }
    $('stats').innerHTML = tiles.map(function (s) {
      return '<div class="stat-tile"><div class="stat-label">' + esc(s.label) + '</div>' +
        '<div class="stat-value display">' + esc(s.value) + '</div>' +
        '<div class="stat-sub">' + esc(s.sub) + '</div></div>';
    }).join('');
  }

  /* ---------- Board (owner) ---------- */
  function renderBoard() {
    $('view-board').innerHTML = STAGES.map(function (name, i) {
      var cards = state.orders.filter(function (o) { return o.stage === i; });
      var cardsHtml = cards.map(function (o) {
        var pc = payChip(o);
        var artisan = o.artisan_id && profile(o.artisan_id)
          ? '<span class="artisan-chip" style="color:' + safeColor(profile(o.artisan_id).color) + '">' + esc(profile(o.artisan_id).name.split(' ')[0]) + '</span>'
          : '<span class="artisan-chip" style="color:#B6B1BC">＋ assign</span>';
        var quick = (isManager() && o.stage < 4)
          ? '<button type="button" class="quick-advance" data-advance="' + esc(o.code) + '" ' +
            'title="Advance to ' + esc(STAGES[o.stage + 1]) + '" aria-label="Advance to ' + esc(STAGES[o.stage + 1]) + '">›</button>'
          : '';
        return '<div class="order-card-wrap">' + quick +
          '<button type="button" class="order-card" data-code="' + esc(o.code) + '">' +
          '<div class="order-card-top"><img src="' + esc(o.img) + '" alt="">' +
          '<div class="order-card-min"><div class="order-card-item">' + esc(o.item) + '</div>' +
          '<div class="order-card-cust">' + esc(o.customer) + ' · ' + esc(o.code.slice(-4)) + '</div></div></div>' +
          '<div class="order-card-foot"><span class="order-card-price">' + fmt(o.price) + '</span>' +
          '<span class="chip ' + pc.cls + '">' + esc(pc.label) + '</span>' +
          (o.rush ? '<span class="rush-flag">⚡</span>' : '') + artisan + '</div></button></div>';
      }).join('');
      return '<div class="board-col"><div class="board-col-head">' +
        '<span class="board-dot" style="background:' + STAGE_DOTS[i] + '"></span>' +
        '<span class="board-col-name">' + esc(name) + '</span>' +
        '<span class="board-count">' + cards.length + '</span></div>' +
        '<div class="board-cards">' + cardsHtml + '</div></div>';
    }).join('');
    Array.prototype.forEach.call(document.querySelectorAll('#view-board .order-card'), function (el) {
      el.addEventListener('click', function () { openDrawer(el.getAttribute('data-code')); });
    });
    Array.prototype.forEach.call(document.querySelectorAll('#view-board .quick-advance'), function (el) {
      el.addEventListener('click', function (ev) {
        ev.stopPropagation();
        var o = state.orders.find(function (x) { return x.code === el.getAttribute('data-advance'); });
        if (!o) return;
        var guardMsg = advanceGuard(o, Math.min(4, o.stage + 1));
        if (guardMsg) { toast(guardMsg, true); return; }
        el.disabled = true;
        S.updateOrder(o.code, { stage: Math.min(4, o.stage + 1) })
          .then(refresh).then(renderAll)
          .then(function () { toast(o.code.slice(-4) + ' → ' + STAGES[Math.min(4, o.stage + 1)]); })
          .catch(function (err) { el.disabled = false; toast(err.message, true); });
      });
    });
  }

  /* ---------- Team (owner) ---------- */
  function renderTeam() {
    var artisans = state.profiles.filter(function (p) { return p.active; });
    $('view-team').innerHTML = artisans.map(function (a) {
      var pieces = state.orders.filter(function (o) { return o.artisan_id === a.id && o.stage >= 1 && o.stage < 4; });
      var load = pieces.length, cap = a.capacity || 4;
      var pct = Math.min(100, Math.round(load / cap * 100));
      var chipCls = load >= cap ? 'pinky' : load === 0 ? 'green' : 'soft';
      var chipLabel = load >= cap ? 'at capacity' : load === 0 ? 'free' : 'active';
      var piecesHtml = pieces.map(function (p) {
        return '<div class="team-piece"><img src="' + esc(p.img) + '" alt="">' +
          '<span class="team-piece-item">' + esc(p.item) + '</span>' +
          '<span class="team-piece-stage">' + esc(STAGES[p.stage].split(' ·')[0]) + '</span></div>';
      }).join('');
      return '<div class="team-card"><div class="team-head">' +
        '<div class="team-avatar" style="background:' + safeColor(a.color) + '">' + esc(a.name[0]) + '</div>' +
        '<div><div class="team-name">' + esc(a.name) + '</div><div class="team-role">' + esc(a.specialty || (a.role === 'owner' ? 'Founder' : '')) + '</div></div>' +
        '<span class="chip team-load-chip ' + chipCls + '">' + chipLabel + '</span></div>' +
        '<div class="team-cap-row"><span>Active pieces</span><span>' + load + ' / ' + cap + '</span></div>' +
        '<div class="team-bar"><div class="team-bar-fill" style="width:' + pct + '%;background:' + (load >= cap ? '#E4657E' : safeColor(a.color)) + '"></div></div>' +
        '<div class="team-pieces">' + piecesHtml + '</div></div>';
    }).join('');
  }

  /* ---------- Payments (owner) ---------- */
  function renderPayments() {
    var demo = S.mode === 'demo';
    var rows = [];
    state.orders.forEach(function (o) {
      if (depPaid(o)) {
        rows.push({ item: o.item, customer: o.customer, type: 'Deposit 40%', amount: fmt(dep(o)),
          status: 'succeeded', cls: 'green',
          ref: o.deposit_ref || (demo ? 'pi_3Q' + o.code.slice(-4) + 'dLx' : '—') });
      }
      if (balPaid(o)) {
        rows.push({ item: o.item, customer: o.customer, type: 'Balance 60%', amount: fmt(bal(o)),
          status: 'succeeded', cls: 'green',
          ref: o.balance_ref || (demo ? 'pi_3Q' + o.code.slice(-4) + 'bFn' : '—') });
      } else if (o.stage === 3) {
        rows.push({ item: o.item, customer: o.customer, type: 'Balance 60%', amount: fmt(bal(o)),
          status: o.balance_sent_at ? 'link sent · pending' : 'not requested',
          cls: o.balance_sent_at ? 'amber' : 'mute',
          ref: o.balance_sent_at ? (o.balance_session_id || 'plink_1R' + o.code.slice(-4)) : '—' });
      }
    });
    $('pay-rows').innerHTML = rows.map(function (tx) {
      return '<div class="pay-row"><span class="pay-item">' + esc(tx.item) + '</span>' +
        '<span class="pay-cust">' + esc(tx.customer) + '</span>' +
        '<span class="pay-type">' + esc(tx.type) + '</span>' +
        '<span class="pay-amount">' + tx.amount + '</span>' +
        '<span><span class="chip ' + tx.cls + '">' + esc(tx.status) + '</span></span>' +
        '<span class="pay-ref">' + esc(String(tx.ref).slice(0, 22)) + '</span></div>';
    }).join('') || '<div class="empty-note">No payments yet.</div>';
  }

  /* ---------- Staff (owner) ---------- */
  function renderStaff() {
    $('staff-grid').innerHTML = state.profiles.map(function (p) {
      var roleChip = p.role === 'owner'
        ? '<span class="chip pinky">owner</span>'
        : p.role === 'supervisor'
          ? '<span class="chip amber">supervisor</span>'
          : '<span class="chip soft">artisan</span>';
      var activeChip = p.active ? '<span class="chip green">active</span>' : '<span class="chip mute">deactivated</span>';
      var load = state.orders.filter(function (o) { return o.artisan_id === p.id && o.stage >= 1 && o.stage < 4; }).length;
      return '<div class="team-card' + (p.active ? '' : ' inactive') + '">' +
        '<div class="team-head">' +
        '<div class="team-avatar" style="background:' + safeColor(p.color) + '">' + esc(p.name[0]) + '</div>' +
        '<div><div class="team-name">' + esc(p.name) + '</div>' +
        '<div class="team-role">' + esc(p.email) + '</div></div></div>' +
        '<div class="staff-chips">' + roleChip + activeChip +
        '<span class="chip soft">' + load + '/' + (p.capacity || 4) + ' pieces</span></div>' +
        '<div class="team-role" style="margin-top:8px">' + esc(p.specialty || '—') + '</div>' +
        '<div class="staff-actions">' +
        '<button class="btn-mini" data-edit="' + esc(p.id) + '">Edit</button>' +
        (p.id !== state.me.id
          ? '<button class="btn-mini" data-toggle="' + esc(p.id) + '">' + (p.active ? 'Deactivate' : 'Reactivate') + '</button>'
          : '') +
        '</div></div>';
    }).join('');
    Array.prototype.forEach.call(document.querySelectorAll('[data-toggle]'), function (b) {
      b.addEventListener('click', function () {
        var p = profile(b.getAttribute('data-toggle'));
        S.updateProfile(p.id, { active: !p.active })
          .then(refresh).then(renderAll)
          .catch(function (e) { toast(e.message, true); });
      });
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-edit]'), function (b) {
      b.addEventListener('click', function () { openStaffModal(profile(b.getAttribute('data-edit'))); });
    });
  }

  function openStaffModal(existing) {
    var isNew = !existing;
    var p = existing || { name: '', email: '', role: 'artisan', specialty: '', color: '#8A6FA8', capacity: 4 };
    openModal(isNew ? 'Add staff member' : 'Edit ' + p.name,
      '<form id="staff-form" class="modal-form">' +
      '<label>Name <input id="sf-name" required value="' + esc(p.name) + '"></label>' +
      '<label>Email <input id="sf-email" type="email" required value="' + esc(p.email) + '"' + (isNew ? '' : ' disabled') + '></label>' +
      (isNew ? '<label>Temporary password <input id="sf-pass" type="text" required minlength="8" placeholder="min. 8 characters"><span class="field-note">Share it with them privately — they use it to sign in at /studio.</span></label>' : '') +
      '<div class="modal-two">' +
      '<label>Role <select id="sf-role"><option value="artisan"' + (p.role === 'artisan' ? ' selected' : '') + '>Artisan</option>' +
      '<option value="supervisor"' + (p.role === 'supervisor' ? ' selected' : '') + '>Supervisor</option>' +
      '<option value="owner"' + (p.role === 'owner' ? ' selected' : '') + '>Owner / founder</option></select></label>' +
      '<label>Capacity <input id="sf-cap" type="number" min="1" max="12" value="' + (p.capacity || 4) + '"></label>' +
      '</div>' +
      '<label>Specialty <input id="sf-spec" placeholder="Blankets, lace & borders" value="' + esc(p.specialty) + '"></label>' +
      '<label>Color <input id="sf-color" type="color" value="' + esc(p.color) + '"></label>' +
      '<div class="modal-error" id="modal-error"></div>' +
      '<button type="submit" class="btn-primary">' + (isNew ? 'Create account' : 'Save changes') + '</button>' +
      '</form>');
    $('staff-form').addEventListener('submit', function (e) {
      e.preventDefault();
      var patch = {
        name: $('sf-name').value.trim(),
        role: $('sf-role').value,
        specialty: $('sf-spec').value.trim(),
        color: $('sf-color').value,
        capacity: parseInt($('sf-cap').value, 10) || 4
      };
      var op;
      if (isNew) {
        op = S.createStaff(Object.assign(patch, {
          email: $('sf-email').value.trim().toLowerCase(),
          password: $('sf-pass').value
        }));
      } else {
        op = S.updateProfile(p.id, patch);
      }
      op.then(function () { closeModal(); return refresh(); }).then(renderAll)
        .then(function () { toast(isNew ? 'Staff account created' : 'Saved'); })
        .catch(function (err) { $('modal-error').textContent = err.message; });
    });
  }

  /* ---------- Tasks (owner) ---------- */
  function taskStatusChip(t) {
    return { open: '<span class="chip soft">open</span>',
      submitted: '<span class="chip amber">submitted</span>',
      approved: '<span class="chip green">approved ✓</span>',
      rejected: '<span class="chip pinky">needs redo</span>' }[t.status] || '';
  }

  function taskCard(t, forWorker) {
    var pi = pillar(t.pillar);
    var who = profile(t.assignee_id);
    var due = t.due_date ? '<span class="task-due">due ' + esc(fmtDate(t.due_date)) + '</span>' : '';
    var order = t.order_code ? '<span class="chip mute">' + esc(t.order_code.slice(-4)) + '</span>' : '';
    var evidence = '';
    if (t.status !== 'open') {
      var link = safeUrl(t.evidence_link);
      evidence = '<div class="task-evidence">' +
        (t.evidence_name ? '📎 ' + esc(t.evidence_name) + ' ' : '') +
        (link ? '<a href="' + esc(link) + '" target="_blank" rel="noopener">' + esc(link) + '</a> '
          : (t.evidence_link ? esc(t.evidence_link) + ' ' : '')) +
        (t.evidence_note ? '<div class="task-evidence-note">“' + esc(t.evidence_note) + '”</div>' : '') +
        '</div>';
    }
    var actions = '';
    if (forWorker && (t.status === 'open' || t.status === 'rejected')) {
      actions = '<button class="btn-primary btn-sm" data-submit="' + esc(t.id) + '">✓ Complete · upload evidence</button>';
    }
    if (!forWorker && t.status === 'submitted') {
      actions = '<button class="btn-mini" data-review-view="' + esc(t.id) + '">View evidence</button>' +
        '<button class="btn-mini approve" data-approve="' + esc(t.id) + '">Approve</button>' +
        '<button class="btn-mini reject" data-reject="' + esc(t.id) + '">Send back</button>';
    }
    return '<div class="task-card" data-task-id="' + esc(t.id) + '">' +
      '<div class="task-main">' +
      '<div class="task-title">' + esc(t.title) + '</div>' +
      '<div class="task-meta"><span class="chip pillar-' + esc(t.pillar) + '">' + esc(pi.label) + (pi.cadence ? ' · ' + pi.cadence : '') + '</span>' +
      (who && !forWorker ? '<span class="task-who" style="color:' + safeColor(who.color) + '">' + esc(who.name.split(' ')[0]) + '</span>' : '') +
      order + due + taskStatusChip(t) + '</div>' +
      (t.details ? '<div class="task-details">' + esc(t.details) + '</div>' : '') +
      evidence + '</div>' +
      (actions ? '<div class="task-actions">' + actions + '</div>' : '') +
      '</div>';
  }

  function bindTaskActions(scope, forWorker) {
    Array.prototype.forEach.call(scope.querySelectorAll('[data-submit]'), function (b) {
      b.addEventListener('click', function () { openSubmitModal(b.getAttribute('data-submit')); });
    });
    Array.prototype.forEach.call(scope.querySelectorAll('[data-approve]'), function (b) {
      b.addEventListener('click', function () {
        S.reviewTask(b.getAttribute('data-approve'), true).then(refresh).then(renderAll)
          .then(function () { toast('Approved — nice work counts double when it’s stitched AND posted'); })
          .catch(function (e) { toast(e.message, true); });
      });
    });
    Array.prototype.forEach.call(scope.querySelectorAll('[data-reject]'), function (b) {
      b.addEventListener('click', function () {
        S.reviewTask(b.getAttribute('data-reject'), false).then(refresh).then(renderAll)
          .catch(function (e) { toast(e.message, true); });
      });
    });
    Array.prototype.forEach.call(scope.querySelectorAll('[data-review-view]'), function (b) {
      b.addEventListener('click', function () {
        var t = state.tasks.find(function (x) { return x.id === b.getAttribute('data-review-view'); });
        openEvidenceModal(t);
      });
    });
  }

  function renderTasks() {
    var order = { submitted: 0, open: 1, rejected: 2, approved: 3 };
    var sorted = state.tasks.slice().sort(function (a, b) {
      return (order[a.status] - order[b.status]) || String(a.due_date || '9').localeCompare(String(b.due_date || '9'));
    });
    $('task-list').innerHTML = sorted.map(function (t) { return taskCard(t, false); }).join('') ||
      '<div class="empty-note">No tasks yet — create the first content task.</div>';
    bindTaskActions($('task-list'), false);
  }

  function renderMyTasks() {
    var order = { open: 0, rejected: 1, submitted: 2, approved: 3 };
    var sorted = state.tasks.slice().sort(function (a, b) {
      return (order[a.status] - order[b.status]) || String(a.due_date || '9').localeCompare(String(b.due_date || '9'));
    });
    $('mytask-list').innerHTML = sorted.map(function (t) { return taskCard(t, true); }).join('') ||
      '<div class="empty-note">No tasks assigned to you yet. 🎉</div>';
    bindTaskActions($('mytask-list'), true);
  }

  function openTaskModal() {
    var options = PILLARS.map(function (p) {
      return '<option value="' + p.id + '">' + esc(p.label + (p.cadence ? ' · ' + p.cadence : '')) + '</option>';
    }).join('');
    var people = state.profiles.filter(function (p) { return p.active; }).map(function (p) {
      return '<option value="' + esc(p.id) + '">' + esc(p.name) + '</option>';
    }).join('');
    var orders = state.orders.filter(function (o) { return o.stage < 4; }).map(function (o) {
      return '<option value="' + esc(o.code) + '">' + esc(o.code.slice(-4) + ' · ' + o.item) + '</option>';
    }).join('');
    openModal('New task',
      '<form id="task-form" class="modal-form">' +
      '<label>Title <input id="tf-title" required placeholder="Reel: sketch → finished piece"></label>' +
      '<label>Content pillar <select id="tf-pillar">' + options + '</select></label>' +
      '<div class="modal-two">' +
      '<label>Assign to <select id="tf-assignee">' + people + '</select></label>' +
      '<label>Due date <input id="tf-due" type="date"></label>' +
      '</div>' +
      '<label>Linked order <select id="tf-order"><option value="">— none —</option>' + orders + '</select></label>' +
      '<label>Details <textarea id="tf-details" rows="3" placeholder="What to film / post, language, where"></textarea></label>' +
      '<div class="modal-error" id="modal-error"></div>' +
      '<button type="submit" class="btn-primary">Create task</button>' +
      '</form>');
    $('task-form').addEventListener('submit', function (e) {
      e.preventDefault();
      S.createTask({
        title: $('tf-title').value.trim(),
        pillar: $('tf-pillar').value,
        assignee_id: $('tf-assignee').value,
        due_date: $('tf-due').value,
        order_code: $('tf-order').value,
        details: $('tf-details').value.trim()
      }).then(function () { closeModal(); return refresh(); }).then(renderAll)
        .then(function () { toast('Task created'); })
        .catch(function (err) { $('modal-error').textContent = err.message; });
    });
  }

  function openSubmitModal(taskId) {
    var t = state.tasks.find(function (x) { return x.id === taskId; });
    if (!t) return;
    openModal('Submit evidence',
      '<div class="modal-task-recap">' + esc(t.title) + '</div>' +
      '<form id="submit-form" class="modal-form">' +
      '<label>Screenshot / photo of the post <input id="ev-file" type="file" accept="image/*,video/*,.pdf"></label>' +
      '<label>Link to the post <span class="field-note">(optional)</span><input id="ev-link" type="url" placeholder="https://instagram.com/p/…"></label>' +
      '<label>Note <span class="field-note">(optional)</span><textarea id="ev-note" rows="2" placeholder="Posted today, tagged #HechoConLulu"></textarea></label>' +
      '<div class="modal-error" id="modal-error"></div>' +
      '<button type="submit" class="btn-primary">Submit for review</button>' +
      '</form>');
    $('submit-form').addEventListener('submit', function (e) {
      e.preventDefault();
      var file = $('ev-file').files[0] || null;
      var link = $('ev-link').value.trim();
      if (!file && !link) { $('modal-error').textContent = 'Add a screenshot or a link as evidence.'; return; }
      S.submitTask(taskId, { file: file, link: link, note: $('ev-note').value.trim() })
        .then(function () { closeModal(); return refresh(); }).then(renderAll)
        .then(function () { toast('Sent to Lulu for review ✓'); })
        .catch(function (err) { $('modal-error').textContent = err.message; });
    });
  }

  function openEvidenceModal(t) {
    if (!t) return;
    var link = safeUrl(t.evidence_link);
    openModal('Evidence — ' + t.title,
      '<div class="evidence-view" id="evidence-view">' +
      (link ? '<div>🔗 <a href="' + esc(link) + '" target="_blank" rel="noopener">' + esc(link) + '</a></div>'
        : (t.evidence_link ? '<div>🔗 ' + esc(t.evidence_link) + '</div>' : '')) +
      (t.evidence_note ? '<div class="task-evidence-note">“' + esc(t.evidence_note) + '”</div>' : '') +
      '<div id="evidence-img-slot">' + (t.evidence_name ? 'Loading ' + esc(t.evidence_name) + '…' : 'No file attached.') + '</div>' +
      '</div>');
    if (t.evidence_name) {
      var fallback = '📎 ' + esc(t.evidence_name) + ' (preview unavailable' + (S.mode === 'demo' ? ' in demo for large files' : '') + ')';
      S.evidenceUrl(t).then(function (url) {
        var slot = $('evidence-img-slot');
        if (!slot) return; // modal was closed before the signed URL arrived
        slot.innerHTML = url
          ? '<img src="' + esc(url) + '" alt="evidence" style="max-width:100%;border-radius:12px;border:1px solid var(--border)">'
          : fallback;
      }).catch(function () {
        var slot = $('evidence-img-slot');
        if (slot) slot.innerHTML = fallback;
      });
    }
  }

  /* ---------- Customers (managers) ---------- */
  function formatAddress(a) {
    if (!a) return '';
    return [a.line1, a.line2, [a.city, a.state, a.postal_code].filter(Boolean).join(', '), a.country]
      .filter(Boolean).join(' · ');
  }

  function renderCustomers() {
    var byKey = {};
    state.orders.forEach(function (o) {
      var key = (o.email || o.customer || '?').toLowerCase();
      var c = byKey[key] || (byKey[key] = { name: o.customer, email: o.email || '', where: o.where_from || '',
        address: null, shipName: '', orders: [], paid: 0 });
      c.orders.push(o);
      if (o.shipping_address) { c.address = o.shipping_address; c.shipName = o.shipping_name || ''; }
      if (depPaid(o)) c.paid += dep(o);
      if (balPaid(o)) c.paid += bal(o);
    });
    var q = state.customerQuery.toLowerCase();
    var list = Object.keys(byKey).map(function (k) { return byKey[k]; })
      .filter(function (c) {
        if (!q) return true;
        return (c.name + ' ' + c.email + ' ' + c.where + ' ' + formatAddress(c.address)).toLowerCase().indexOf(q) > -1;
      })
      .sort(function (a, b) { return b.paid - a.paid; });

    $('customer-list').innerHTML = list.map(function (c, i) {
      var ordersHtml = c.orders.map(function (o) {
        var pc = payChip(o);
        return '<div class="cust-order" data-open-order="' + esc(o.code) + '">' +
          '<span class="cust-order-code">' + esc(o.code.slice(-4)) + '</span>' +
          '<span class="cust-order-item">' + esc(o.item) + '</span>' +
          '<span class="chip soft">' + esc(STAGES[o.stage]) + '</span>' +
          '<span class="chip ' + pc.cls + '">' + esc(pc.label) + '</span>' +
          '<span class="cust-order-price">' + fmt(o.price) + '</span></div>';
      }).join('');
      return '<div class="customer-card">' +
        '<button type="button" class="customer-head" data-cust="' + i + '">' +
        '<div><div class="team-name">' + esc(c.name) + '</div>' +
        '<div class="team-role">' + esc(c.email || '—') + (c.where ? ' · ' + esc(c.where) : '') + '</div></div>' +
        '<div class="cust-meta"><span class="chip soft">' + c.orders.length +
        (c.orders.length === 1 ? ' order' : ' orders') + '</span>' +
        '<span class="chip green">' + fmt(c.paid) + ' paid</span></div></button>' +
        '<div class="customer-body" hidden>' +
        (c.address ? '<div class="cust-address">📦 ' + esc(c.shipName || c.name) + ' — ' + esc(formatAddress(c.address)) + '</div>'
          : '<div class="cust-address muted">No shipping address on file yet (collected at deposit checkout).</div>') +
        ordersHtml +
        (function () {
          var emails = state.emailLog.filter(function (e) {
            return c.email && e.to_email && e.to_email.toLowerCase() === c.email.toLowerCase();
          });
          if (!emails.length) return '';
          return '<div class="drawer-section-title" style="margin-top:14px">Emails we sent (' + emails.length + ')</div>' +
            emails.slice(0, 12).map(function (e) {
              return '<div class="cust-order" style="cursor:default"><span class="chip mute">' + esc(e.kind.replace(/_/g, ' ')) + '</span>' +
                '<span class="cust-order-item">' + esc(e.subject) + '</span>' +
                '<span class="team-role">' + esc(fmtDate(e.created_at)) + '</span></div>';
            }).join('');
        })() +
        '</div></div>';
    }).join('') || '<div class="empty-note">No customers yet.</div>';

    Array.prototype.forEach.call(document.querySelectorAll('.customer-head'), function (b) {
      b.addEventListener('click', function () {
        var body = b.parentElement.querySelector('.customer-body');
        body.hidden = !body.hidden;
      });
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-open-order]'), function (b) {
      b.addEventListener('click', function () { openDrawer(b.getAttribute('data-open-order')); });
    });
  }

  /* ---------- Artisan payouts (owner) ----------
     Business plan: artisans earn 40% of each shipped piece; the founder keeps
     full profit (owners are excluded from this view). */
  function renderPayouts() {
    var artisans = state.profiles.filter(function (p) { return p.role === 'artisan'; });
    $('payout-grid').innerHTML = artisans.map(function (a) {
      var shipped = state.orders.filter(function (o) { return o.artisan_id === a.id && o.stage >= 4; });
      var gross = shipped.reduce(function (s, o) { return s + Number(o.price); }, 0);
      var share = Math.round(gross * 0.4 * 100) / 100;
      var paidOut = state.payouts.filter(function (p) { return p.artisan_id === a.id; })
        .reduce(function (s, p) { return s + Number(p.amount); }, 0);
      var owed = Math.max(0, Math.round((share - paidOut) * 100) / 100);
      var rows = shipped.slice(0, 8).map(function (o) {
        return '<div class="cust-order"><span class="cust-order-code">' + esc(o.code.slice(-4)) + '</span>' +
          '<span class="cust-order-item">' + esc(o.item) + '</span>' +
          '<span class="cust-order-price">' + fmt(o.price) + ' → ' + fmt(o.price * 0.4) + '</span></div>';
      }).join('');
      return '<div class="team-card"><div class="team-head">' +
        '<div class="team-avatar" style="background:' + safeColor(a.color) + '">' + esc(a.name[0]) + '</div>' +
        '<div><div class="team-name">' + esc(a.name) + '</div>' +
        '<div class="team-role">' + shipped.length + ' shipped · ' + fmt(gross) + ' gross</div></div>' +
        (owed > 0 ? '<span class="chip amber team-load-chip">owed ' + fmt(owed) + '</span>'
                  : '<span class="chip green team-load-chip">settled</span>') + '</div>' +
        '<div class="payout-summary"><span>Their 40%: <b>' + fmt(share) + '</b></span>' +
        '<span>Paid out: <b>' + fmt(paidOut) + '</b></span></div>' +
        rows +
        (owed > 0 ? '<button class="btn-primary btn-sm" style="margin-top:12px" data-payout="' + esc(a.id) +
          '" data-amount="' + owed + '">Record payout · ' + fmt(owed) + '</button>' : '') +
        '</div>';
    }).join('') || '<div class="empty-note">No artisan accounts yet — Lulu (founder) keeps full profit and isn’t listed. Add artisans in Staff when the team grows.</div>';

    $('payout-history').innerHTML = state.payouts.map(function (p) {
      var who = profile(p.artisan_id);
      return '<div class="cust-order"><span class="cust-order-item"><b>' + esc(who ? who.name : '?') + '</b></span>' +
        '<span class="cust-order-price">' + fmt(p.amount) + '</span>' +
        '<span class="team-role">' + esc(fmtDate(p.created_at)) + '</span></div>';
    }).join('') || '<div class="empty-note small">No payouts recorded yet.</div>';

    Array.prototype.forEach.call(document.querySelectorAll('[data-payout]'), function (b) {
      b.addEventListener('click', function () {
        var a = profile(b.getAttribute('data-payout'));
        var amount = Number(b.getAttribute('data-amount'));
        // only list the orders not already covered by earlier payouts
        var already = {};
        state.payouts.forEach(function (p) {
          if (p.artisan_id === a.id) (p.order_codes || []).forEach(function (c) { already[c] = true; });
        });
        var shippedCodes = state.orders.filter(function (o) {
          return o.artisan_id === a.id && o.stage >= 4 && !already[o.code];
        }).map(function (o) { return o.code; });
        b.disabled = true;
        S.recordPayout(a.id, amount, shippedCodes)
          .then(refresh).then(renderAll)
          .then(function () { toast('Payout of ' + fmt(amount) + ' to ' + a.name + ' recorded'); })
          .catch(function (err) { b.disabled = false; toast(err.message, true); });
      });
    });
  }

  /* ---------- My pieces (artisan) ---------- */
  function renderMyPieces() {
    var mine = state.orders.filter(function (o) { return o.artisan_id === state.me.id && o.stage >= 1 && o.stage < 4; });
    var done = state.orders.filter(function (o) { return o.artisan_id === state.me.id && o.stage >= 4; }).slice(0, 4);
    function card(o, finished) {
      var reports = state.reports.filter(function (r) { return (r.order_code || '') === o.code; }).slice(0, 2);
      var repHtml = reports.map(function (r) {
        return '<div class="mini-report">' + esc(fmtDate(r.created_at)) + ' → ' + esc(STAGES[r.to_stage]) +
          (r.note ? ' · “' + esc(r.note) + '”' : '') + '</div>';
      }).join('');
      return '<div class="piece-card">' +
        '<img src="' + esc(o.img) + '" alt="">' +
        '<div class="piece-body">' +
        '<div class="piece-title">' + esc(o.item) + (o.rush ? ' <span class="rush-flag">⚡ rush</span>' : '') + '</div>' +
        '<div class="piece-meta">' + esc(o.customer) + ' · ' + esc(o.code.slice(-4)) + ' · ' + esc(o.size_label || '') + '</div>' +
        '<div class="piece-desc">“' + esc(o.desc_text) + '”</div>' +
        '<div class="piece-foot"><span class="chip ' + (finished ? 'green' : 'soft') + '">' + esc(STAGES[o.stage]) + '</span>' +
        // artisans communicate with the customer once the piece is In progress
        (o.stage >= 2 ? '<button class="btn-mini" data-thread="' + esc(o.code) + '">💬 Customer</button>' : '') +
        (finished ? '' : '<button class="btn-primary btn-sm" data-report="' + esc(o.code) + '">Report progress →</button>') +
        '</div>' + repHtml + '</div></div>';
    }
    $('piece-grid').innerHTML =
      (mine.map(function (o) { return card(o, false); }).join('') ||
        '<div class="empty-note">No pieces assigned to you right now.</div>') +
      (done.length ? '<div class="piece-divider">Recently shipped</div>' + done.map(function (o) { return card(o, true); }).join('') : '');
    Array.prototype.forEach.call(document.querySelectorAll('[data-report]'), function (b) {
      b.addEventListener('click', function () { openReportModal(b.getAttribute('data-report')); });
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-thread]'), function (b) {
      b.addEventListener('click', function () {
        var o = state.orders.find(function (x) { return x.code === b.getAttribute('data-thread'); });
        if (o) openThreadModal(o);
      });
    });
  }

  function openThreadModal(o) {
    openModal('Messages — ' + o.item + ' · ' + o.code.slice(-4),
      '<div class="thread" id="modal-thread"></div>' +
      '<div class="composer">' +
      '<textarea id="mmsg-body" rows="2" placeholder="Write to ' + esc(o.customer) + '… (WIP photos welcome!)"></textarea>' +
      '<div class="composer-row">' +
      '<label class="composer-attach">📎<input type="file" id="mmsg-file" accept="image/*,video/*" hidden><span id="mmsg-file-name"></span></label>' +
      '<button class="btn-primary btn-sm" id="btn-mmsg-send">Send</button></div></div>');
    loadThread(o, $('modal-thread'));
    bindComposer(function () { return o; }, 'mmsg-body', 'mmsg-file', 'mmsg-file-name', 'btn-mmsg-send',
      function () { return $('modal-thread'); });
  }

  function openReportModal(code) {
    var o = state.orders.find(function (x) { return x.code === code; });
    if (!o) return;
    // Artisans may move In progress (2) → Ready (3); managers own the rest.
    var opts = ['<option value="' + o.stage + '" selected>Stay in “' + STAGES[o.stage] + '” (progress note)</option>'];
    if (o.stage === 2) {
      opts.push('<option value="3">Move to “' + STAGES[3] + '”</option>');
    }
    openModal('Report progress — ' + o.item,
      '<form id="report-form" class="modal-form">' +
      '<label>Stage <select id="rp-stage">' + opts.join('') + '</select></label>' +
      '<label>Note for Lulu &amp; the customer <textarea id="rp-note" rows="3" placeholder="Body done, starting the little hat today…"></textarea></label>' +
      '<label>WIP photo <span class="field-note">(customers love these — it’s also content)</span><input id="rp-file" type="file" accept="image/*"></label>' +
      '<div class="modal-error" id="modal-error"></div>' +
      '<button type="submit" class="btn-primary">Send report</button>' +
      '</form>');
    $('report-form').addEventListener('submit', function (e) {
      e.preventDefault();
      var toStage = parseInt($('rp-stage').value, 10);
      var note = $('rp-note').value.trim();
      var file = $('rp-file').files[0] || null;
      if (toStage === o.stage && !note && !file) {
        $('modal-error').textContent = 'Add a note or photo, or move the stage forward.';
        return;
      }
      S.advanceStage(o, toStage, note, file)
        .then(function () { closeModal(); return refresh(); }).then(renderAll)
        .then(function () { toast('Report sent ✓'); })
        .catch(function (err) { $('modal-error').textContent = err.message; });
    });
  }

  /* ---------- Drawer (owner) ---------- */
  var lastFocus = null;

  function selectedOrder() {
    return state.orders.find(function (o) { return o.code === state.selected; });
  }

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
    $('drawer-cust').textContent = o.customer + ' · ' + (o.where_from || '—') + (o.email ? ' · ' + o.email : '');
    $('drawer-img').src = o.img;
    $('drawer-desc').textContent = '“' + o.desc_text + '”';
    $('drawer-chips').innerHTML =
      '<span class="tag">' + esc(o.size_label || '—') + '</span>' +
      '<span class="tag">🎨 ' + esc(o.colors || '—') + '</span>' +
      (o.rush ? '<span class="tag rush">⚡ rush +25%</span>' : '');
    $('drawer-price').textContent = fmt(o.price);
    $('drawer-dep').innerHTML = depPaid(o)
      ? '<span class="chip green">✓ paid — ' + fmt(dep(o)) + '</span>'
      : '<span class="chip mute">awaiting — ' + fmt(dep(o)) + '</span>';
    $('drawer-bal').innerHTML = balPaid(o)
      ? '<span class="chip green">✓ paid — ' + fmt(bal(o)) + '</span>'
      : o.balance_sent_at
        ? '<span class="chip amber">link sent — ' + fmt(bal(o)) + '</span>'
        : '<span class="chip mute">due at ship — ' + fmt(bal(o)) + '</span>';

    var box = $('balance-link-box');
    if (o.balance_url && !balPaid(o)) {
      box.hidden = false;
      $('balance-link-url').textContent = o.balance_url;
    } else box.hidden = true;

    var sel = $('drawer-artisan');
    var artisans = state.profiles.filter(function (p) { return p.active; });
    sel.innerHTML = '<option value="">— Unassigned —</option>' + artisans.map(function (a) {
      var load = state.orders.filter(function (x) { return x.artisan_id === a.id && x.stage >= 1 && x.stage < 4; }).length;
      var specialty = (a.specialty || a.role).split(',')[0].toLowerCase();
      return '<option value="' + esc(a.id) + '">' + esc(a.name + ' — ' + specialty + ' (' + load + '/' + (a.capacity || 4) + ')') + '</option>';
    }).join('');
    sel.value = o.artisan_id || '';

    var reports = state.reports.filter(function (r) { return (r.order_code || '') === o.code; }).slice(0, 6);
    $('drawer-reports').innerHTML = reports.map(function (r) {
      return '<div class="report-row"><b>' + esc(r.user_name || 'Staff') + '</b> → ' + esc(STAGES[r.to_stage]) +
        (r.note ? '<div class="report-note">“' + esc(r.note) + '”</div>' : '') +
        (r.photo_name ? '<div class="report-note">📷 ' + esc(r.photo_name) + '</div>' : '') +
        '<div class="report-time">' + esc(fmtDate(r.created_at)) + '</div></div>';
    }).join('') || '<div class="empty-note small">No progress reports yet.</div>';

    var adv = $('drawer-advance');
    if (o.stage < 4) {
      adv.hidden = false;
      adv.textContent = o.stage === 3 ? 'Mark shipped 🎁' : 'Advance to “' + STAGES[o.stage + 1] + '”';
    } else adv.hidden = true;

    var row = $('shipping-row');
    if (o.stage === 3 && !o.balance_sent_at && !balPaid(o)) {
      row.hidden = false;
      var rate = o.shipping_rate;
      $('drawer-balance-link').textContent = rate
        ? 'Send balance link · ' + fmt(bal(o)) + ' + $' + Number(rate.amount).toFixed(2) + ' shipping'
        : 'Send Stripe balance link · ' + fmt(bal(o)) + ' + shipping';
      // manual shipping input only needed when no rate was chosen
      $('shipping-row').querySelector('label').hidden = !!rate;
    } else row.hidden = true;

    // Quote editing (managers, while in New request / Quote review)
    $('quote-edit-row').hidden = !(isManager() && o.stage <= 1);

    renderApproval(o);
    renderShipping(o);
    renderShares(o);
    loadThread(o, $('drawer-thread'));
  }

  /* ---------- Drawer: customer approval (stage 3 · Ready) ---------- */
  function approvalRequested(o) {
    return state.threadOrder === o.code && state.thread.some(function (m) { return m.kind === 'approval_request'; });
  }

  function renderApproval(o) {
    var section = $('drawer-approval-section');
    if (!isManager() || o.stage !== 3) { section.hidden = true; return; }
    section.hidden = false;
    var html = '<div class="approval-chip-row">';
    if (o.approved_at) {
      html += '<span class="chip green">✓ approved by the customer</span>';
    } else if (state.threadOrder === o.code && !state.threadLoaded) {
      html += '<span class="chip mute">checking…</span>';
    } else if (approvalRequested(o)) {
      html += '<span class="chip amber">waiting for customer approval</span>';
    } else {
      html += '<span class="chip mute">not sent yet</span>';
    }
    html += balPaid(o) ? '<span class="chip green">✓ balance paid</span>'
      : '<span class="chip mute">balance unpaid</span>';
    if (!o.approved_at) {
      html += '<button class="btn-primary btn-sm" id="btn-send-approval">' +
        (approvalRequested(o) ? 'Re-send for approval' : 'Send final photo for approval & balance →') + '</button>';
    }
    html += '</div>';
    $('approval-status').innerHTML = html;
    var btn = $('btn-send-approval');
    if (btn) btn.addEventListener('click', function () { openApprovalModal(o); });
  }

  function openApprovalModal(o) {
    openModal('Send for approval — ' + o.item,
      '<form id="approval-form" class="modal-form">' +
      '<label>Final photo <input id="ap-file" type="file" accept="image/*" required></label>' +
      '<label>Message to the customer <textarea id="ap-note" rows="3" placeholder="She’s finished and even prettier in person…"></textarea></label>' +
      '<div class="field-note">This emails the customer the photo with an approve button and the balance payment link' +
      (o.balance_url ? '' : (o.shipping_rate ? ' (link will be created with the chosen shipping rate)' : ' — ⚠ choose a shipping rate first so the balance includes shipping')) + '.</div>' +
      '<div class="modal-error" id="modal-error"></div>' +
      '<button type="submit" class="btn-primary">Send to customer</button>' +
      '</form>');
    $('approval-form').addEventListener('submit', function (e) {
      e.preventDefault();
      var file = $('ap-file').files[0];
      if (!file) { $('modal-error').textContent = 'Attach the final photo.'; return; }
      var pre = Promise.resolve();
      if (!o.balance_url && !balPaid(o)) {
        if (!o.shipping_rate && S.mode === 'cloud') {
          $('modal-error').textContent = 'Choose a shipping rate first (Shipping section) so the balance includes it.';
          return;
        }
        pre = S.sendBalanceLink(o, o.shipping_rate ? null : 0);
      }
      pre.then(function () {
        return S.sendMessage(o, { kind: 'approval_request', body: $('ap-note').value.trim(), file: file });
      }).then(function () { closeModal(); return refresh(); }).then(function () {
        renderAll();
        toast('Sent — the customer got the photo, approve button and payment link');
      }).catch(function (err) { $('modal-error').textContent = err.message; });
    });
  }

  /* ---------- Message threads (drawer + artisan modal) ---------- */
  function renderThread(container) {
    container.innerHTML = state.thread.map(function (m) {
      if (m.kind === 'system' || m.sender_kind === 'system') {
        return '<div class="bubble system">' + esc(m.body) + '</div>';
      }
      var cls = m.sender_kind === 'staff' ? ' mine' : '';
      var tag = m.kind === 'approval_request' ? ' <span class="chip pinky">approval request</span>' : '';
      return '<div class="bubble' + cls + '">' +
        '<div class="who">' + esc(m.sender_kind === 'staff' ? m.sender_name : m.sender_name + ' (customer)') + tag + '</div>' +
        (m.body ? esc(m.body) : '') +
        (m.photo_url ? '<img src="' + esc(m.photo_url) + '" alt="attachment">'
          : (m.photo_name ? '<div class="when">📎 ' + esc(m.photo_name) + '</div>' : '')) +
        '<div class="when">' + esc(fmtDate(m.created_at)) + '</div></div>';
    }).join('') || '<div class="empty-note small">No messages yet — say hola 👋</div>';
    container.scrollTop = container.scrollHeight;
  }

  function loadThread(o, container) {
    state.threadOrder = o.code;
    state.thread = [];
    state.threadLoaded = false;
    S.listMessages(o).then(function (msgs) {
      if (state.threadOrder !== o.code) return; // drawer moved on
      state.thread = msgs;
      state.threadLoaded = true;
      if (container && document.contains(container)) renderThread(container);
      var drawerOpen = !$('drawer-root').hidden;
      if (drawerOpen && state.selected === o.code) renderApproval(o);
    }).catch(function (e) { toast('Messages: ' + e.message, true); });
  }

  // Bind a composer once; the order + target container resolve at click time
  function bindComposer(getOrder, bodyId, fileId, fileNameId, btnId, getContainer) {
    var fileInput = $(fileId);
    fileInput.addEventListener('change', function () {
      $(fileNameId).textContent = fileInput.files[0] ? fileInput.files[0].name : '';
    });
    $(btnId).addEventListener('click', function () {
      var o = getOrder();
      if (!o) return;
      var body = $(bodyId).value.trim();
      var file = fileInput.files[0] || null;
      if (!body && !file) return;
      var btn = $(btnId);
      btn.disabled = true;
      S.sendMessage(o, { body: body, file: file }).then(function () {
        btn.disabled = false;
        // the modal/drawer may have closed mid-send — touch DOM defensively
        var bodyEl = $(bodyId);
        if (bodyEl) {
          bodyEl.value = '';
          fileInput.value = '';
          $(fileNameId).textContent = '';
        }
        var container = getContainer();
        if (container && document.contains(container)) loadThread(o, container);
      }).catch(function (err) { btn.disabled = false; toast(err.message, true); });
    });
  }

  /* ---------- Drawer: shipping (Shippo) ---------- */
  function renderShipping(o) {
    var section = $('drawer-shipping-section');
    if (!isManager() || o.stage < 2) { section.hidden = true; return; }
    section.hidden = false;

    $('ship-address').innerHTML = o.shipping_address
      ? '📦 ' + esc(o.shipping_name || o.customer) + ' — ' + esc(formatAddress(o.shipping_address))
      : '<span class="muted">No shipping address on file (collected at deposit checkout' +
        (S.mode === 'demo' ? '; demo orders don’t have one — rates below are samples' : '') + ').</span>';

    var chosen = o.shipping_rate;
    $('ship-rate-chosen').innerHTML = chosen
      ? '<span class="chip green">✓ ' + esc(chosen.provider + ' ' + (chosen.service || '')) + ' — $' +
        esc(Number(chosen.amount).toFixed(2)) + (chosen.days ? ' · ~' + esc(chosen.days) + 'd' : '') + '</span>'
      : '';

    var ratesHtml = '';
    if (state.shipRates && state.shipRates.orderCode === o.code) {
      ratesHtml = state.shipRates.rates.map(function (r) {
        return '<button type="button" class="rate-option" data-rate=\'' + esc(JSON.stringify(r)) + '\'>' +
          '<b>' + esc(r.provider) + '</b> ' + esc(r.service || '') +
          '<span class="rate-price">$' + esc(Number(r.amount).toFixed(2)) + (r.days ? ' · ~' + esc(r.days) + 'd' : '') + '</span></button>';
      }).join('') || '<div class="empty-note small">No rates returned for this address.</div>';
    }
    $('ship-rates').innerHTML = ratesHtml;

    var actions = '';
    var trackingHtml = '';
    if (o.tracking_number) {
      trackingHtml = '<div class="ship-track-row">🚚 <b>' + esc(o.tracking_number) + '</b>' +
        (o.tracking_url ? ' · <a href="' + esc(o.tracking_url) + '" target="_blank" rel="noopener">track</a>' : '') +
        (o.label_url ? ' · <a href="' + esc(o.label_url) + '" target="_blank" rel="noopener"><b>print label ⎙</b></a>' : '') +
        '</div>';
      if (!o.label_url && S.mode === 'cloud') {
        actions = '<button class="btn-mini" id="btn-refresh-label">Fetch label PDF</button>';
      }
      if (o.stage < 4) {
        var shipReady = S.mode === 'demo' || (o.approved_at && balPaid(o));
        actions += shipReady
          ? '<button class="btn-primary btn-sm" id="btn-mark-shipped">Mark shipped 🎁 — customer gets tracking + photo request</button>'
          : '<span class="field-note">Shipping unlocks once the customer approves and the balance is paid.</span>';
      }
    } else {
      actions = '<button class="btn-mini" id="btn-get-rates">' +
        (state.shipRates && state.shipRates.orderCode === o.code ? 'Refresh rates' : 'Get live rates') + '</button>';
      if (chosen && balPaid(o)) {
        actions += '<button class="btn-primary btn-sm" id="btn-buy-label">Buy label · $' +
          esc(Number(chosen.amount).toFixed(2)) + '</button>';
      } else if (chosen && !balPaid(o)) {
        actions += '<span class="field-note">Label unlocks once the balance is paid.</span>';
      }
    }
    $('ship-actions').innerHTML = actions;
    $('ship-tracking').innerHTML = trackingHtml;

    var getBtn = $('btn-get-rates');
    if (getBtn) getBtn.addEventListener('click', function () {
      getBtn.disabled = true;
      getBtn.textContent = 'Getting rates…';
      S.getShippingRates(o).then(function (res) {
        state.shipRates = { orderCode: o.code, rates: res.rates || [] };
        renderShipping(o);
      }).catch(function (err) { toast(err.message, true); renderShipping(o); });
    });
    Array.prototype.forEach.call(document.querySelectorAll('.rate-option'), function (b) {
      b.addEventListener('click', function () {
        var rate = JSON.parse(b.getAttribute('data-rate'));
        b.disabled = true;
        S.chooseRate(o, rate).then(refresh).then(function () {
          state.shipRates = null;
          renderAll();
          toast('Rate saved — it’ll be added to the balance link');
        }).catch(function (err) { b.disabled = false; toast(err.message, true); });
      });
    });
    var buyBtn = $('btn-buy-label');
    if (buyBtn) buyBtn.addEventListener('click', function () {
      buyBtn.disabled = true;
      buyBtn.textContent = 'Buying label…';
      S.buyLabel(o, chosen ? chosen.rate_id : '').then(function (res) {
        return refresh().then(function () {
          renderAll();
          toast('Label ready — print it from the drawer' + (res.tracking_number ? ' · ' + res.tracking_number : ''));
        });
      }).catch(function (err) { buyBtn.disabled = false; buyBtn.textContent = 'Buy label'; toast(err.message, true); });
    });
    var refreshBtn = $('btn-refresh-label');
    if (refreshBtn) refreshBtn.addEventListener('click', function () {
      refreshBtn.disabled = true;
      refreshBtn.textContent = 'Fetching…';
      S.refreshLabel(o).then(refresh).then(function () {
        renderAll();
        toast('Label PDF attached — print it from the drawer');
      }).catch(function (err) {
        refreshBtn.disabled = false;
        refreshBtn.textContent = 'Fetch label PDF';
        toast(err.message, true);
      });
    });
    var shipBtn = $('btn-mark-shipped');
    if (shipBtn) shipBtn.addEventListener('click', function () {
      shipBtn.disabled = true;
      S.updateOrder(o.code, { stage: 4 }).then(refresh).then(renderAll)
        .then(function () { toast('Shipped 🎁 — customer notified' + (S.mode === 'demo' ? ' (demo: no real email)' : '')); })
        .catch(function (err) { shipBtn.disabled = false; toast(err.message, true); });
    });
  }

  /* ---------- Drawer: customer shares ---------- */
  function renderShares(o) {
    var section = $('drawer-shares-section');
    var mine = state.shares.filter(function (u) { return (u.order_code || '') === o.code; });
    if (!isManager() || !mine.length) { section.hidden = true; return; }
    section.hidden = false;
    $('drawer-shares').innerHTML = mine.map(function (u, i) {
      return '<div class="report-row">📎 <a href="#" data-share-view="' + i + '">' + esc(u.name || 'file') + '</a>' +
        (u.note ? '<div class="report-note">“' + esc(u.note) + '”</div>' : '') +
        '<div class="report-time">' + esc(fmtDate(u.created_at)) + '</div></div>';
    }).join('');
    Array.prototype.forEach.call(document.querySelectorAll('[data-share-view]'), function (a) {
      a.addEventListener('click', function (ev) {
        ev.preventDefault();
        var u = mine[Number(a.getAttribute('data-share-view'))];
        S.customerUploadUrl(u).then(function (url) {
          if (url) window.open(url, '_blank', 'noopener');
          else toast('Preview unavailable', true);
        });
      });
    });
  }

  /* ---------- Modal plumbing ---------- */
  var modalOpener = null;
  function openModal(title, bodyHtml) {
    modalOpener = document.activeElement;
    $('modal-title').textContent = title;
    $('modal-body').innerHTML = bodyHtml;
    $('modal-root').hidden = false;
    var first = document.querySelector('#modal-body input, #modal-body select, #modal-body textarea, #modal-body button');
    if (first) first.focus();
  }
  function closeModal() {
    $('modal-root').hidden = true;
    $('modal-body').innerHTML = '';
    if (modalOpener && document.contains(modalOpener) && typeof modalOpener.focus === 'function') {
      modalOpener.focus();
    }
    modalOpener = null;
  }

  /* ---------- Views ---------- */
  var VIEW_RENDER = { board: renderBoard, team: renderTeam, pay: renderPayments,
    staff: renderStaff, tasks: renderTasks, mypieces: renderMyPieces, mytasks: renderMyTasks,
    customers: renderCustomers, payouts: renderPayouts };

  function renderCurrentView() {
    ['board', 'team', 'pay', 'staff', 'tasks', 'mypieces', 'mytasks', 'customers', 'payouts'].forEach(function (v) {
      var el = $('view-' + v);
      if (el) el.classList.toggle('active', state.view === v);
    });
    (VIEW_RENDER[state.view] || function () {})();
  }

  function renderAll() {
    renderNav();
    renderHead();
    renderStats();
    renderCurrentView();
    if (state.selected) renderDrawer();
  }

  /* ---------- Gate / auth ---------- */
  function sha256Hex(str) {
    if (!(window.crypto && crypto.subtle)) {
      return Promise.reject(new Error('Web Crypto unavailable'));
    }
    var data = new TextEncoder().encode(str);
    return crypto.subtle.digest('SHA-256', data).then(function (buf) {
      return Array.prototype.map.call(new Uint8Array(buf), function (b) {
        return b.toString(16).padStart(2, '0');
      }).join('');
    });
  }
  function gateError(msg) {
    var el = $('gate-error');
    el.textContent = msg;
    el.classList.add('show');
  }

  function enter(me) {
    state.me = me;
    state.view = isManager() ? 'board' : 'mypieces';
    // Deep link from task notification emails: /studio/?task=<id>
    var taskParam = new URLSearchParams(location.search).get('task');
    if (taskParam) {
      state.highlightTask = taskParam;
      state.view = isManager() ? 'tasks' : 'mytasks';
    }
    $('gate').hidden = true;
    $('app').hidden = false;
    return refresh().then(renderAll).then(function () {
      if (state.highlightTask) {
        var el = document.querySelector('.task-card[data-task-id="' + state.highlightTask + '"]');
        if (el) { el.classList.add('highlight'); el.scrollIntoView({ block: 'center' }); }
        state.highlightTask = null;
      }
    });
  }

  function showGate() {
    $('gate').hidden = false;
    $('app').hidden = true;
    var cloud = S.mode === 'cloud';
    $('gate-cloud-fields').hidden = !cloud;
    $('gate-demo-fields').hidden = cloud;
    $('gate-demo-note').hidden = cloud;
    $('gate-note').textContent = cloud
      ? 'Sign in with your staff account.'
      : 'This area is for the Lulu & Loop team. Enter the studio passphrase to continue.';
    if (!cloud) {
      S.listProfiles().then(function (ps) {
        $('gate-profile').innerHTML = ps.filter(function (p) { return p.active; }).map(function (p) {
          return '<option value="' + esc(p.id) + '">' + esc(p.name + ' — ' + p.role) + '</option>';
        }).join('');
      });
    }
  }

  function initGate() {
    $('gate-form').addEventListener('submit', function (e) {
      e.preventDefault();
      $('gate-error').classList.remove('show');
      if (S.mode === 'cloud') {
        var email = $('gate-email').value.trim();
        var pass = $('gate-pass-cloud').value;
        $('gate-submit').disabled = true;
        S.signIn(email, pass).then(function (me) {
          $('gate-submit').disabled = false;
          if (!me) { gateError('Signed in, but no staff profile found — ask the owner to add you.'); return S.signOut(); }
          if (!me.active) { gateError('This account has been deactivated.'); return S.signOut(); }
          enter(me);
        }).catch(function (err) {
          $('gate-submit').disabled = false;
          gateError(err.message === 'Invalid login credentials' ? 'Wrong email or password.' : err.message);
        });
      } else {
        var input = $('gate-pass');
        sha256Hex(input.value).then(function (hex) {
          if (hex === PASS_HASH) {
            S.signIn($('gate-profile').value).then(function (me) {
              if (!me) {
                gateError('Your browser is blocking site storage — the demo needs it to sign you in.');
                return;
              }
              enter(me);
            });
          } else {
            input.classList.add('error');
            gateError('That’s not it — try again.');
          }
        }).catch(function () {
          gateError('Unlocking needs a secure connection (HTTPS or localhost).');
        });
      }
    });
  }

  /* ---------- Events ---------- */
  $('btn-signout').addEventListener('click', function () {
    S.signOut().then(function () { location.reload(); });
  });
  $('drawer-scrim').addEventListener('click', closeDrawer);
  $('drawer-close').addEventListener('click', closeDrawer);
  $('modal-scrim').addEventListener('click', closeModal);
  $('modal-close').addEventListener('click', closeModal);
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      if (!$('modal-root').hidden) { closeModal(); return; }
      if (!$('drawer-root').hidden) { closeDrawer(); return; }
    }
    if (e.key === 'Tab') {
      // Trap focus in the topmost open dialog (modal wins over drawer)
      var root = !$('modal-root').hidden ? $('modal-root')
        : (!$('drawer-root').hidden ? $('drawer-root') : null);
      if (!root) return;
      var focusables = Array.prototype.filter.call(
        root.querySelectorAll('button, select, input, textarea, a[href]'),
        function (el) { return !el.closest('[hidden]') && !el.disabled; });
      if (!focusables.length) return;
      var first = focusables[0], last = focusables[focusables.length - 1];
      var inside = root.contains(document.activeElement);
      if (e.shiftKey && (document.activeElement === first || !inside)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && (document.activeElement === last || !inside)) { e.preventDefault(); first.focus(); }
    }
  });
  $('drawer-artisan').addEventListener('change', function (e) {
    var o = selectedOrder();
    if (!o) return;
    S.updateOrder(o.code, { artisan_id: e.target.value })
      .then(refresh).then(renderAll)
      .catch(function (err) { toast(err.message, true); });
  });
  $('drawer-advance').addEventListener('click', function () {
    var o = selectedOrder();
    if (!o) return;
    var guardMsg = advanceGuard(o, Math.min(4, o.stage + 1));
    if (guardMsg) { toast(guardMsg, true); return; }
    S.updateOrder(o.code, { stage: Math.min(4, o.stage + 1) })
      .then(refresh).then(renderAll)
      .catch(function (err) { toast(err.message, true); });
  });
  $('btn-edit-quote').addEventListener('click', function () {
    var o = selectedOrder();
    if (!o) return;
    openModal('Edit final price — ' + o.item,
      '<form id="quote-form" class="modal-form">' +
      '<div class="modal-task-recap">Deposit already paid: <b>' + fmt(dep(o)) + '</b> (fixed) · current total: <b>' + fmt(o.price) + '</b></div>' +
      '<label>Final price (USD) <input id="qf-price" type="number" min="' + dep(o) + '" max="2000" step="1" value="' + Number(o.price) + '" required></label>' +
      '<label>Note for the customer <span class="field-note">(optional — goes into the order thread)</span>' +
      '<textarea id="qf-note" rows="2" placeholder="Added the tiny broom and hat you asked about"></textarea></label>' +
      '<div class="modal-error" id="modal-error"></div>' +
      '<button type="submit" class="btn-primary">Update quote</button>' +
      '</form>');
    $('quote-form').addEventListener('submit', function (e) {
      e.preventDefault();
      var price = parseFloat($('qf-price').value);
      S.updateQuote(o, price, $('qf-note').value.trim())
        .then(function () { closeModal(); return refresh(); }).then(renderAll)
        .then(function () { toast('Quote updated — the change is logged in the customer thread'); })
        .catch(function (err) { $('modal-error').textContent = err.message; });
    });
  });
  // Drawer composer (bound once; resolves the open order at click time)
  bindComposer(selectedOrder, 'msg-body', 'msg-file', 'msg-file-name', 'btn-send-msg',
    function () { return $('drawer-thread'); });
  $('drawer-balance-link').addEventListener('click', function () {
    var o = selectedOrder();
    if (!o) return;
    // With a chosen Shippo rate the server derives shipping from it;
    // otherwise the manual input applies
    var shipping = o.shipping_rate ? null : (parseFloat($('shipping-input').value) || 0);
    var btn = $('drawer-balance-link');
    btn.disabled = true;
    S.sendBalanceLink(o, shipping).then(function (res) {
      return refresh().then(function () {
        renderAll();
        if (res && res.url) {
          var ord = selectedOrder();
          if (ord && !ord.balance_url) ord.balance_url = res.url;
          renderDrawer();
          toast('Balance link created — copy it and send it to the customer');
        }
        btn.disabled = false; // re-enable only after state reflects the sent link
      });
    }).catch(function (err) { btn.disabled = false; toast(err.message, true); });
  });
  $('btn-copy-link').addEventListener('click', function () {
    var url = $('balance-link-url').textContent;
    (navigator.clipboard ? navigator.clipboard.writeText(url) : Promise.reject())
      .then(function () { toast('Copied ✓'); })
      .catch(function () { toast('Select and copy the link manually', true); });
  });
  $('btn-add-staff').addEventListener('click', function () { openStaffModal(null); });
  $('btn-add-task').addEventListener('click', function () { openTaskModal(); });
  $('customer-search').addEventListener('input', function (e) {
    state.customerQuery = e.target.value;
    renderCustomers();
  });

  /* ---------- Boot ---------- */
  initGate();
  Promise.resolve().then(function () { return S.init(); }).then(function () {
    var me = S.currentUser();
    if (me && me.active) enter(me);
    else showGate();
  }).catch(function () { showGate(); });
})();
