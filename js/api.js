/* Lulu & Loop — data layer.
   One async store, two backends:
   - CloudStore: Supabase (auth, Postgres, storage, edge functions) when
     window.LULU_CONFIG is filled in.
   - LocalStore: localStorage demo mode otherwise — lets the studio and the
     worker experience run end-to-end with no backend.
   Both expose the same interface, consumed by js/studio.js and js/site.js. */
(function () {
  'use strict';

  var cfg = window.LULU_CONFIG || {};
  var cloudEnabled = !!(cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY);

  var PILLARS = [
    { id: 'idea-to-piece', label: '“From idea to piece” reel', cadence: '2×/wk' },
    { id: 'abuela-at-work', label: '“Abuela at work” video', cadence: '2×/wk' },
    { id: 'queue-story', label: '“The queue” story', cadence: 'weekly' },
    { id: 'reveal-unboxing', label: 'Reveal & unboxing repost', cadence: 'as delivered' },
    { id: 'mini-drop', label: 'Monthly mini drop', cadence: 'monthly' },
    { id: 'general', label: 'General task', cadence: '' }];

  var STAGES = ['New request', 'Quoted', 'Queue · paid', 'In progress', 'Ready · balance', 'Shipped'];

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* ================= LocalStore (demo mode) ================= */

  var DEMO_PROFILES = [
    { id: 'p-lulu', email: 'lulu@luluandloop.com', name: 'Lourdes “Lulu”', role: 'owner', specialty: 'Faces, final details & QC', color: '#E4657E', capacity: 2, active: true },
    { id: 'p-marisol', email: 'marisol@luluandloop.com', name: 'Marisol', role: 'artisan', specialty: 'Blankets, lace & borders', color: '#8A6FA8', capacity: 4, active: true },
    { id: 'p-carmen', email: 'carmen@luluandloop.com', name: 'Carmen', role: 'artisan', specialty: 'Amigurumi bodies & outfits', color: '#5E8B6A', capacity: 4, active: true },
    { id: 'p-yesenia', email: 'yesenia@luluandloop.com', name: 'Yesenia', role: 'artisan', specialty: 'Wearables & sizing', color: '#C08A3E', capacity: 4, active: true },
    { id: 'p-beatriz', email: 'beatriz@luluandloop.com', name: 'Beatriz', role: 'artisan', specialty: 'Assembly, stuffing & QC', color: '#5B7A99', capacity: 4, active: true }];

  var DEMO_ORDERS = [
    { code: 'LU-2607-0155', customer: 'Grace L.', where_from: 'Dublin, IE', item: 'Christening blanket, butterfly', size_label: 'Crib · 36×48in', price: 240, stage: 0, artisan_id: '', img: '/assets/blanket-white.jpg', desc_text: 'All white, one butterfly like my mother made for me. Christening is in October.', colors: 'white, pearl', rush: false },
    { code: 'LU-2607-0158', customer: 'Julia P.', where_from: 'Austin, TX', item: 'Stroller blanket + rattle', size_label: 'Stroller · 30×36in', price: 165, stage: 0, artisan_id: '', img: '/assets/blanket-mint.jpg', desc_text: 'Mint with pink flowers for my niece — matching bunny rattle if possible.', colors: 'mint, rose', rush: false },
    { code: 'LU-2607-0154', customer: 'Isabel M.', where_from: 'Miami, FL', item: 'Fairy bear, birthday gift', size_label: 'Classic · 10in', price: 95, stage: 1, artisan_id: '', img: '/assets/bear-fairy.jpg', desc_text: 'A little bear with fairy wings and a sparkly tutu — she turns 6.', colors: 'taupe, glitter red', rush: true },
    { code: 'LU-2607-0159', customer: 'Amara B.', where_from: 'London, UK', item: 'Kids cardigan, sage', size_label: 'Cardigan · 4y', price: 110, stage: 1, artisan_id: 'p-yesenia', img: '/assets/squirrel-red.jpg', desc_text: 'Sage green with cream buttons, roomy fit for a tall 4-year-old.', colors: 'sage, cream', rush: false },
    { code: 'LU-2607-0151', customer: 'Sofía R.', where_from: 'CDMX, MX', item: 'Magical guardian doll', size_label: 'Grand · 14in', price: 140, stage: 2, artisan_id: 'p-lulu', img: '/assets/doll-blonde.jpg', desc_text: 'Like the heroine from my childhood — long golden twin-tails, sailor collar, red bow.', colors: 'gold, navy, red', rush: false },
    { code: 'LU-2607-0157', customer: 'Nadia K.', where_from: 'Toronto, CA', item: 'Party charms ×10, sea animals', size_label: 'Set · 2.5in ×10', price: 130, stage: 2, artisan_id: '', img: '/assets/bunny-overalls.jpg', desc_text: 'Ten mini sea friends for party favor bags — octopus, whale, turtle mix.', colors: 'ocean blues', rush: false },
    { code: 'LU-2607-0148', customer: 'Priya S.', where_from: 'Boston, MA', item: 'Witch-cat with broom', size_label: 'Classic · 12in', price: 95, stage: 3, artisan_id: 'p-carmen', img: '/assets/witch-cat.jpg', desc_text: 'My daughter’s gray cat as a little witch — purple nose, black hat and dress, tiny broom.', colors: 'gray, black, purple', rush: false },
    { code: 'LU-2607-0147', customer: 'Emma T.', where_from: 'Seattle, WA', item: 'Sunshine crib blanket', size_label: 'Crib · 36×48in', price: 240, stage: 3, artisan_id: 'p-marisol', img: '/assets/blanket-yellow.jpg', desc_text: 'Butter yellow with white bunnies along the corner, lace border.', colors: 'butter, white', rush: false },
    { code: 'LU-2607-0156', customer: 'Diego R.', where_from: 'CDMX, MX', item: 'Coquette squirrel', size_label: 'Classic · 10in', price: 95, stage: 3, artisan_id: 'p-lulu', img: '/assets/squirrel-red.jpg', desc_text: 'A red squirrel in a green striped dress with a fluffy stole — like the one from your gallery, but with glasses.', colors: 'brick red, green', rush: false },
    { code: 'LU-2607-0152', customer: 'Mark D.', where_from: 'NYC, NY', item: 'Little blue friend', size_label: 'Classic · 12in', price: 118, stage: 4, artisan_id: 'p-carmen', img: '/assets/doll-blue.jpg', desc_text: 'From my son’s drawing — blue guy, big ears, white hat and pants.', colors: 'sky blue, white', rush: true, balance_sent_at: 'demo' },
    { code: 'LU-2607-0150', customer: 'Chloe N.', where_from: 'Paris, FR', item: 'Butterfly lovey', size_label: 'Lovey · 12×12in', price: 55, stage: 4, artisan_id: 'p-marisol', img: '/assets/blanket-white.jpg', desc_text: 'Small white lovey with a single butterfly, for a newborn photoshoot.', colors: 'ivory', rush: false },
    { code: 'LU-2607-0153', customer: 'Hannah W.', where_from: 'Sydney, AU', item: 'Garden bunny in overalls', size_label: 'Grand · 14in', price: 140, stage: 5, artisan_id: 'p-yesenia', img: '/assets/bunny-overalls.jpg', desc_text: 'Cream bunny with gingham overalls and pink boots, floppy ears.', colors: 'cream, denim blue', rush: false }];

  var DEMO_TASKS = [
    { title: 'Reel: Priya’s witch-cat, sketch → piece', pillar: 'idea-to-piece', assignee_key: 'p-carmen', order_code: 'LU-2607-0148', details: 'Film the WIP next to the customer sketch; 20–30s, EN captions.', due_in: 2 },
    { title: 'Abuela at work: lace border close-up', pillar: 'abuela-at-work', assignee_key: 'p-marisol', order_code: 'LU-2607-0147', details: 'Hands + voiceover in Spanish with EN subtitles.', due_in: 3 },
    { title: 'This week’s queue story', pillar: 'queue-story', assignee_key: 'p-lulu', order_code: '', details: 'Board screenshot + “2 spots open” sticker, IG story.', due_in: 1 },
    { title: 'Repost Hannah’s unboxing, tag #HechoConLulu', pillar: 'reveal-unboxing', assignee_key: 'p-yesenia', order_code: 'LU-2607-0153', details: 'Ask permission, repost to feed + story.', due_in: 5 }];

  function LocalStore() {
    var K = {
      staff: 'luluandloop.demo.staff',
      orders: 'luluandloop.orders',          // shared with the wizard
      overrides: 'luluandloop.studio.overrides',
      tasks: 'luluandloop.demo.tasks',
      reports: 'luluandloop.demo.reports',
      session: 'luluandloop.demo.session',
      files: 'luluandloop.demo.files'
    };
    function get(k, fb) {
      try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : fb; } catch (e) { return fb; }
    }
    function set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } }
    function sget(k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } }
    function sset(k, v) { try { sessionStorage.setItem(k, v); } catch (e) { /* ignore */ } }
    function uid() { return 'd' + Math.random().toString(36).slice(2, 10); }

    function staff() {
      var s = get(K.staff, null);
      if (!s) { s = DEMO_PROFILES.map(function (p) { return Object.assign({}, p); }); set(K.staff, s); }
      return s;
    }
    function tasks() {
      var t = get(K.tasks, null);
      if (!t) {
        var today = new Date();
        t = DEMO_TASKS.map(function (d) {
          var due = new Date(today.getTime() + d.due_in * 864e5);
          return { id: uid(), title: d.title, details: d.details, pillar: d.pillar,
            assignee_id: d.assignee_key, order_code: d.order_code, due_date: due.toISOString().slice(0, 10),
            status: 'open', evidence_note: '', evidence_link: '', evidence_name: '', evidence_data: '',
            created_at: new Date().toISOString() };
        });
        set(K.tasks, t);
      }
      return t;
    }
    function orders() {
      // seed orders + wizard web orders + saved overrides (same model as v1)
      var all = DEMO_ORDERS.map(function (o) { return Object.assign({ id: o.code, pending: false }, o); });
      (get(K.orders, []) || []).forEach(function (w) {
        if (!w || !w.code || all.some(function (o) { return o.code === w.code; })) return;
        all.push({
          id: w.code, code: w.code, customer: w.customer || 'Web order', email: w.email || '',
          where_from: w.where || 'Online',
          item: w.item || 'Custom piece', size_label: w.size || '—', price: w.price || 0,
          stage: typeof w.stage === 'number' ? w.stage : 2, artisan_id: '',
          img: (typeof w.img === 'string' && /^\/assets\/[\w.-]+$/.test(w.img)) ? w.img : '/assets/doll-blonde.jpg',
          desc_text: w.desc || '', colors: w.colors || '—', rush: !!w.rush, pending: false
        });
      });
      var ov = get(K.overrides, {});
      all.forEach(function (o) {
        var x = ov[o.code];
        if (x) {
          if (typeof x.stage === 'number') o.stage = x.stage;
          if (typeof x.artisan === 'string') o.artisan_id = mapLegacyArtisan(x.artisan);
          if (typeof x.artisan_id === 'string') o.artisan_id = x.artisan_id;
          if (x.balanceSent) o.balance_sent_at = o.balance_sent_at || 'demo';
          if (x.balance_sent_at) o.balance_sent_at = x.balance_sent_at;
        }
        o.deposit = Math.round(o.price * .4);
        o.balance = o.price - o.deposit;
        if (o.stage >= 2) o.deposit_paid_at = o.deposit_paid_at || 'demo';
        if (o.stage >= 5) o.balance_paid_at = o.balance_paid_at || 'demo';
      });
      return all;
    }
    function mapLegacyArtisan(name) {
      var m = staff().find(function (p) { return p.name === name; });
      return m ? m.id : '';
    }
    function saveOverride(code, patch) {
      var ov = get(K.overrides, {});
      ov[code] = Object.assign(ov[code] || {}, patch);
      set(K.overrides, ov);
    }

    return {
      mode: 'demo',
      pillars: PILLARS, stages: STAGES,
      init: function () { return Promise.resolve(); },
      // demo sign-in: passphrase checked by studio.js gate; profile picked by id
      signIn: function (profileId) {
        sset(K.session, profileId);
        return Promise.resolve(this.currentUser());
      },
      signOut: function () { sset(K.session, ''); return Promise.resolve(); },
      currentUser: function () {
        var id = sget(K.session);
        return staff().find(function (p) { return p.id === id; }) || null;
      },
      listProfiles: function () { return Promise.resolve(staff()); },
      createStaff: function (input) {
        var s = staff();
        if (s.some(function (p) { return p.email === input.email; })) {
          return Promise.reject(new Error('That email already has an account'));
        }
        var p = { id: uid(), email: input.email, name: input.name, role: input.role || 'artisan',
          specialty: input.specialty || '', color: input.color || '#8A6FA8',
          capacity: input.capacity || 4, active: true };
        s.push(p); set(K.staff, s);
        return Promise.resolve(p);
      },
      updateProfile: function (id, patch) {
        var s = staff();
        var p = s.find(function (x) { return x.id === id; });
        if (p) Object.assign(p, patch);
        set(K.staff, s);
        return Promise.resolve(p);
      },
      listOrders: function () { return Promise.resolve(orders()); },
      updateOrder: function (code, patch) {
        saveOverride(code, patch);
        return Promise.resolve();
      },
      advanceStage: function (order, toStage, note, file) {
        var me = this.currentUser();
        saveOverride(order.code, { stage: toStage });
        var reps = get(K.reports, []);
        var rep = { id: uid(), order_code: order.code, user_id: me ? me.id : '', user_name: me ? me.name : '',
          from_stage: order.stage, to_stage: toStage, note: note || '',
          photo_name: file ? file.name : '', created_at: new Date().toISOString() };
        reps.unshift(rep); set(K.reports, reps.slice(0, 200));
        return Promise.resolve(rep);
      },
      listReports: function (orderCode) {
        var reps = get(K.reports, []);
        return Promise.resolve(orderCode ? reps.filter(function (r) { return r.order_code === orderCode; }) : reps);
      },
      listTasks: function (assigneeId) {
        var t = tasks();
        return Promise.resolve(assigneeId ? t.filter(function (x) { return x.assignee_id === assigneeId; }) : t);
      },
      createTask: function (input) {
        var t = tasks();
        var task = { id: uid(), title: input.title, details: input.details || '', pillar: input.pillar || 'general',
          assignee_id: input.assignee_id || '', order_code: input.order_code || '', due_date: input.due_date || '',
          status: 'open', evidence_note: '', evidence_link: '', evidence_name: '', evidence_data: '',
          created_at: new Date().toISOString() };
        t.unshift(task); set(K.tasks, t);
        return Promise.resolve(task);
      },
      submitTask: function (taskId, sub) {
        var t = tasks();
        var task = t.find(function (x) { return x.id === taskId; });
        if (!task) return Promise.reject(new Error('task not found'));
        task.status = 'submitted';
        task.evidence_note = sub.note || '';
        task.evidence_link = sub.link || '';
        task.submitted_at = new Date().toISOString();
        var done = function () {
          if (!set(K.tasks, t)) {
            // storage full: retry without the inline file blob, else fail loudly
            task.evidence_data = '';
            if (!set(K.tasks, t)) {
              throw new Error('Demo storage is full — evidence could not be saved. Clear old tasks or use a smaller file.');
            }
          }
          return task;
        };
        if (sub.file) {
          task.evidence_name = sub.file.name;
          if (sub.file.size <= 400 * 1024) {
            return new Promise(function (resolve) {
              var r = new FileReader();
              r.onload = function () { task.evidence_data = String(r.result); resolve(done()); };
              r.onerror = function () { resolve(done()); };
              r.readAsDataURL(sub.file);
            });
          }
        }
        return Promise.resolve(done());
      },
      reviewTask: function (taskId, approve) {
        var t = tasks();
        var task = t.find(function (x) { return x.id === taskId; });
        if (!task) return Promise.reject(new Error('task not found'));
        task.status = approve ? 'approved' : 'rejected';
        task.reviewed_at = new Date().toISOString();
        set(K.tasks, t);
        return Promise.resolve(task);
      },
      evidenceUrl: function (task) {
        return Promise.resolve(task.evidence_data || '');
      },
      reportPhotoUrl: function () { return Promise.resolve(''); },
      sendBalanceLink: function (order) {
        saveOverride(order.code, { balance_sent_at: new Date().toISOString() });
        return Promise.resolve({ url: 'https://checkout.stripe.com/demo-balance-link (demo — configure Stripe to generate real links)' });
      }
    };
  }

  /* ================= CloudStore (Supabase) ================= */

  function CloudStore() {
    var client = null;

    function sb() {
      if (!client) {
        if (!window.supabase) throw new Error('Could not load Supabase — check your connection and reload.');
        client = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
      }
      return client;
    }
    function fail(error) { throw new Error(error && error.message ? error.message : 'request failed'); }
    var meCache = null;

    function fetchMe() {
      return sb().auth.getUser().then(function (res) {
        if (!res.data || !res.data.user) return null;
        return sb().from('profiles').select('*').eq('id', res.data.user.id).single()
          .then(function (p) { meCache = p.data || null; return meCache; });
      });
    }
    function callFn(name, body) {
      return sb().functions.invoke(name, { body: body }).then(function (res) {
        if (res.error) {
          // supabase-js wraps non-2xx; try to surface the function's message
          return Promise.resolve(res.error.context && res.error.context.json ? res.error.context.json() : null)
            .catch(function () { return null; })
            .then(function (j) { throw new Error((j && j.error) || res.error.message || 'request failed'); });
        }
        return res.data;
      });
    }

    return {
      mode: 'cloud',
      pillars: PILLARS, stages: STAGES,
      init: function () { return fetchMe(); },
      signIn: function (email, password) {
        return sb().auth.signInWithPassword({ email: email, password: password }).then(function (res) {
          if (res.error) fail(res.error);
          return fetchMe();
        });
      },
      signOut: function () { meCache = null; return sb().auth.signOut(); },
      currentUser: function () { return meCache; },
      listProfiles: function () {
        return sb().from('profiles').select('*').order('created_at').then(function (r) {
          if (r.error) fail(r.error); return r.data;
        });
      },
      createStaff: function (input) { return callFn('admin-create-staff', input); },
      updateProfile: function (id, patch) {
        return sb().from('profiles').update(patch).eq('id', id).then(function (r) {
          if (r.error) fail(r.error);
        });
      },
      listOrders: function () {
        return sb().from('orders').select('*').eq('pending', false)
          .order('created_at', { ascending: false }).then(function (r) {
            if (r.error) fail(r.error);
            return r.data.map(function (o) {
              o.artisan_id = o.artisan_id || '';
              return o;
            });
          });
      },
      updateOrder: function (code, patch) {
        var p = {};
        if (typeof patch.stage === 'number') p.stage = patch.stage;
        if ('artisan_id' in patch) p.artisan_id = patch.artisan_id || null;
        return sb().from('orders').update(p).eq('code', code).then(function (r) {
          if (r.error) fail(r.error);
        });
      },
      advanceStage: function (order, toStage, note, file) {
        var me = meCache;
        var photoPath = null;
        var upload = Promise.resolve();
        if (file && me) {
          photoPath = 'wip/' + order.code + '/' + Date.now() + '-' + file.name.replace(/[^\w.-]+/g, '_');
          upload = sb().storage.from('evidence').upload(photoPath, file).then(function (r) {
            if (r.error) { photoPath = null; }
          });
        }
        return upload.then(function () {
          return sb().from('orders').update({ stage: toStage }).eq('id', order.id);
        }).then(function (r) {
          if (r.error) fail(r.error);
          return sb().from('stage_reports').insert({
            order_id: order.id, user_id: me.id, from_stage: order.stage, to_stage: toStage,
            note: note || '', photo_path: photoPath
          });
        }).then(function (r) { if (r.error) fail(r.error); });
      },
      listReports: function (orderIdOrNull) {
        var q = sb().from('stage_reports')
          .select('*, profiles(name), orders(code)')
          .order('created_at', { ascending: false }).limit(100);
        if (orderIdOrNull) q = q.eq('order_id', orderIdOrNull);
        return q.then(function (r) {
          if (r.error) fail(r.error);
          return r.data.map(function (x) {
            x.user_name = x.profiles ? x.profiles.name : '';
            x.order_code = x.orders ? x.orders.code : '';
            x.photo_name = x.photo_path ? x.photo_path.split('/').pop() : '';
            return x;
          });
        });
      },
      listTasks: function (assigneeId) {
        var q = sb().from('tasks').select('*, orders(code)').order('created_at', { ascending: false });
        if (assigneeId) q = q.eq('assignee_id', assigneeId);
        return q.then(function (r) {
          if (r.error) fail(r.error);
          return r.data.map(function (t) {
            t.order_code = t.orders ? t.orders.code : '';
            t.evidence_name = t.evidence_path ? t.evidence_path.split('/').pop() : '';
            return t;
          });
        });
      },
      createTask: function (input) {
        var row = { title: input.title, details: input.details || '', pillar: input.pillar || 'general',
          assignee_id: input.assignee_id || null, due_date: input.due_date || null,
          created_by: meCache ? meCache.id : null };
        var pre = Promise.resolve(null);
        if (input.order_code) {
          pre = sb().from('orders').select('id').eq('code', input.order_code).maybeSingle()
            .then(function (r) { return r.data ? r.data.id : null; });
        }
        return pre.then(function (orderId) {
          row.order_id = orderId;
          return sb().from('tasks').insert(row).then(function (r) { if (r.error) fail(r.error); });
        });
      },
      submitTask: function (taskId, sub) {
        var me = meCache;
        var path = null;
        var upload = Promise.resolve();
        if (sub.file && me) {
          path = 'tasks/' + taskId + '/' + Date.now() + '-' + sub.file.name.replace(/[^\w.-]+/g, '_');
          upload = sb().storage.from('evidence').upload(path, sub.file).then(function (r) {
            if (r.error) fail(r.error);
          });
        }
        return upload.then(function () {
          return sb().from('tasks').update({
            status: 'submitted', evidence_note: sub.note || '', evidence_link: sub.link || '',
            evidence_path: path, submitted_at: new Date().toISOString(),
            // resubmitting a rejected task must clear the old review to satisfy RLS
            reviewed_by: null, reviewed_at: null
          }).eq('id', taskId);
        }).then(function (r) { if (r.error) fail(r.error); });
      },
      reviewTask: function (taskId, approve) {
        return sb().from('tasks').update({
          status: approve ? 'approved' : 'rejected',
          reviewed_by: meCache ? meCache.id : null,
          reviewed_at: new Date().toISOString()
        }).eq('id', taskId).then(function (r) { if (r.error) fail(r.error); });
      },
      evidenceUrl: function (task) {
        if (!task.evidence_path) return Promise.resolve('');
        return sb().storage.from('evidence').createSignedUrl(task.evidence_path, 3600)
          .then(function (r) { return r.data ? r.data.signedUrl : ''; });
      },
      reportPhotoUrl: function (report) {
        if (!report.photo_path) return Promise.resolve('');
        return sb().storage.from('evidence').createSignedUrl(report.photo_path, 3600)
          .then(function (r) { return r.data ? r.data.signedUrl : ''; });
      },
      sendBalanceLink: function (order, shipping) {
        return callFn('create-balance-link', { order_id: order.id, shipping: shipping || 0 });
      }
    };
  }

  /* ================= Public API ================= */

  window.LuluAPI = {
    cloudEnabled: cloudEnabled,
    esc: esc,
    PILLARS: PILLARS,
    STAGES: STAGES,
    store: cloudEnabled ? CloudStore() : LocalStore(),
    // customer checkout (used by js/site.js)
    createCheckout: function (payload) {
      if (!cloudEnabled) return Promise.reject(new Error('cloud not configured'));
      var url = cfg.SUPABASE_URL + '/functions/v1/create-checkout';
      return fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: cfg.SUPABASE_ANON_KEY },
        body: JSON.stringify(payload)
      }).then(function (res) {
        return res.json().then(function (j) {
          if (!res.ok || j.error) throw new Error(j.error || 'checkout failed');
          return j;
        });
      });
    }
  };
})();
