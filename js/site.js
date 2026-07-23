/* Lulu & Loop — customer site + order wizard
   Copy and pricing data carried over verbatim from the design handoff. */
(function () {
  'use strict';

  var DEPOSIT_PCT = 40;

  /* ---------- Catalog (source of truth from the handoff) ---------- */
  var CATS = [
    { id: 'dolls', num: '01', img: '/assets/doll-blonde.jpg', en: 'Custom Companions', es: 'Compañeros a medida',
      ben: 'Dolls, animals & characters crocheted from your photos, sketches or wildest ideas.',
      bes: 'Muñecos, animales y personajes tejidos a partir de tus fotos, bocetos o ideas.',
      sizes: [
        { en: 'Mini', es: 'Mini', dim: '4in / 10cm', p: 45, wk: [1, 2] },
        { en: 'Small', es: 'Chico', dim: '6in / 15cm', p: 65, wk: [1, 2] },
        { en: 'Classic', es: 'Clásico', dim: '10in / 25cm', p: 95, wk: [2, 3] },
        { en: 'Grand', es: 'Grande', dim: '14in / 35cm', p: 140, wk: [3, 4] },
        { en: 'Showpiece', es: 'Gigante', dim: '20in / 50cm', p: 220, wk: [4, 6] }] },
    { id: 'blankets', num: '02', img: '/assets/blanket-yellow.jpg', en: 'Heirloom Blankets', es: 'Cobijas de herencia',
      ben: 'Baby & keepsake blankets with lace borders, flowers and appliqués — made to be passed down.',
      bes: 'Cobijas de bebé y de recuerdo con orillas de encaje, flores y apliques — hechas para heredarse.',
      sizes: [
        { en: 'Lovey', es: 'Apego', dim: '12×12in', p: 55, wk: [1, 2] },
        { en: 'Stroller', es: 'Carriola', dim: '30×36in', p: 165, wk: [3, 4] },
        { en: 'Crib', es: 'Cuna', dim: '36×48in', p: 240, wk: [4, 6] },
        { en: 'Throw', es: 'Sofá', dim: '50×60in', p: 340, wk: [6, 8] }] },
    { id: 'baby', num: '03', img: '/assets/blanket-mint.jpg', en: 'Baby Sets', es: 'Sets de bebé',
      ben: 'Booties, bonnets and rattles for arrivals, baptisms and first photos.',
      bes: 'Zapatitos, gorritos y sonajas para recién nacidos, bautizos y primeras fotos.',
      sizes: [
        { en: 'Booties + bonnet', es: 'Zapatitos + gorrito', dim: '0–12m', p: 48, wk: [1, 2] },
        { en: 'Set + rattle', es: 'Set + sonaja', dim: '0–12m', p: 68, wk: [1, 2] },
        { en: 'Full layette', es: 'Ajuar completo', dim: '5 pieces', p: 120, wk: [2, 3] }] },
    { id: 'wear', num: '04', img: '/assets/bunny-overalls.jpg', en: 'Wearables', es: 'Para vestir',
      ben: 'Beanies, scarves and little cardigans in your colors — sized to the person.',
      bes: 'Gorros, bufandas y cárdigans en tus colores — a la medida de la persona.',
      sizes: [
        { en: 'Beanie', es: 'Gorro', dim: 'baby–adult', p: 42, wk: [1, 2] },
        { en: 'Scarf', es: 'Bufanda', dim: '60in', p: 75, wk: [2, 3] },
        { en: 'Kids cardigan', es: 'Cárdigan infantil', dim: '1–8y', p: 110, wk: [3, 4] }] },
    { id: 'minis', num: '05', img: '/assets/squirrel-red.jpg', en: 'Minis & Charms', es: 'Minis y llaveros',
      ben: 'Keychains and pocket-size minis — party favors, bag charms, tiny gifts.',
      bes: 'Llaveros y minis de bolsillo — recuerdos de fiesta, dijes, regalitos.',
      sizes: [
        { en: 'Single charm', es: 'Llavero', dim: '2.5in', p: 18, wk: [1, 1] },
        { en: 'Trio', es: 'Trío', dim: '2.5in ×3', p: 45, wk: [1, 2] },
        { en: 'Party set (10)', es: 'Set fiesta (10)', dim: '2.5in ×10', p: 130, wk: [2, 3] }] },
    { id: 'home', num: '06', img: '/assets/blanket-white.jpg', en: 'Home & Decor', es: 'Hogar y decoración',
      ben: 'Pillows, garlands and wall pieces that make a room feel yours.',
      bes: 'Cojines, guirnaldas y piezas de pared que hacen tuyo un espacio.',
      sizes: [
        { en: 'Pillow', es: 'Cojín', dim: '16×16in', p: 85, wk: [2, 3] },
        { en: 'Garland', es: 'Guirnalda', dim: '6ft', p: 70, wk: [2, 3] },
        { en: 'Wall piece', es: 'Pieza de pared', dim: 'up to 20in', p: 95, wk: [3, 4] }] }];

  /* ---------- Bilingual strings ---------- */
  var STR = { en: {
    navGallery: 'Gallery', navHow: 'How it works', navPricing: 'Pricing', navStory: 'Our story', navCta: 'Start your piece',
    heroEyebrow: 'Custom crochet studio · Boston', heroTitle: 'If you can imagine it, we can', heroTitleEm: 'crochet it.',
    heroSub: 'One-of-one dolls, heirloom blankets and little wonders — hand-stitched to your idea by Lulu and her artisans, and shipped anywhere in the world.',
    heroCta: 'Start your piece', heroCta2: 'See the work', fromChip: 'Pieces from',
    trust1: '40% deposit, rest when it ships', trust2: 'Handmade — never machine-made', trust3: 'Ships worldwide',
    howEyebrow: 'How it works', howTitle: 'From your idea to your doorstep',
    galEyebrow: 'The gallery', galTitle: 'Recently stitched',
    galNote: 'Every piece here began as someone’s photo, sketch or memory. Yours is next.',
    priceEyebrow: 'Categories & pricing', priceTitle: 'What we make',
    priceSub: 'Every piece is quoted from a base size price — final quote confirmed before you pay anything. Crochet can’t be machine-made: every stitch below is by hand.',
    priceNote1: '⚡ Rush (−40% time): +25%', priceNote2: '📦 Shipping quoted at checkout', priceNote3: '💳 40% deposit · balance when it ships',
    storyChip: 'Est. in México · Grown in Boston', storyEyebrow: 'Our story', storyTitle: 'Three countries, one thread',
    storyP1: 'Lourdes — Lulu to everyone who loves her — learned to crochet as a girl in Cuba, where a skein of yarn was worth more than gold and nothing ever went to waste.',
    storyP2: 'In México she turned the craft into a company, teaching a small circle of artisans that a toy stitched by hand carries something a factory can never copy.',
    storyP3: 'Today she works from Boston, near her daughter and grandkids — the first testers of every new design. Five artisans, two languages, one rule: made with love, or not at all.',
    storyStat1: '3 years in business', storyStat3: 'Cuba → CDMX → Boston',
    bandTitle: 'Your imagination, our hands.',
    footBlurb: 'A bilingual, made-to-order crochet studio. One-of-one pieces, stitched by hand and shipped worldwide.',
    footContact: 'Say hello', footPolicy: 'Good to know',
    footP1: '40% deposit · 60% when it ships', footP2: 'Timelines: 1–8 weeks by size', footP3: 'Worldwide shipping',
    back: 'Back to Lulu & Loop', backStep: 'Back',
    s1Title: 'Design your piece',
    s1Sub: 'Three choices and a few words — that’s all it takes. Your price updates live on the right, and Lulu personally confirms every quote within 24h.',
    fCat: 'What are we making?', fSize: 'Pick a size', fDesc: 'Describe your idea',
    fDescPh: '“My daughter’s cat as a little witch, with a purple nose and a tiny broom…”',
    fDescHint: 'A photo, a sketch or three sentences — anything works. You can send reference photos after checkout too.',
    fColors: 'Colors', fColorsPh: 'dusty pink, cream, sage…', fRef: 'Reference', fRefPh: 'Drop a photo or sketch',
    optional: '(optional)', fName: 'Your name', fEmail: 'Email',
    fRush: '⚡ Rush my piece', fRushSub: '+25% · jumps the queue, −40% wait',
    estTitle: 'Your estimate', qBase: 'Base price', qRush: 'Rush — jumps the queue', qTotal: 'Total',
    turnLabel: 'Estimated time', contBtn: 'Continue to deposit', contHint: 'Describe your idea to continue',
    estNote: 'You only pay the deposit today. Lulu confirms your final quote within 24h — if anything changes, you approve it first.',
    s3Title: 'Deposit checkout', s3Secure: 'Secure', s3Card: 'Card information', s3Demo: 'demo — no real charge',
    s3Live: 'you’ll finish on Stripe’s secure page',
    payNow: 'Pay', processing: 'Processing…', payHint: 'Add your name and email to continue',
    payError: 'Something went wrong starting the payment — please try again.',
    balancePaidMsg: '¡Gracias! Balance received — your piece ships next. 🎁',
    canceledMsg: 'Payment canceled — your design is safe below, try again when ready.',
    s4Title: '¡Gracias! Your piece is in the queue', s4Order: 'Order',
    balCard: 'Your piece is ready! Balance due',
    balCardSub: 'Pay the remaining 60% + shipping to release it. We never ship before you’ve seen finished photos.',
    balPay: 'Pay balance ·', again: 'Start another piece',
    portalCta: 'Track my order & message us',
    portalHint: 'Your confirmation email has a magic link — or create an account with the same email to see all your pieces.',
    tl1: 'Deposit paid', tl1s: '40% received via Stripe — your spot in the queue is secured.',
    tl2: 'Quote review', tl2s: 'Lulu personally reviews your idea and confirms the final quote within 24h — any change lands in your order portal.',
    tl3: 'In progress', tl3s: 'Your artisan gets to work. Work-in-progress photos and messages arrive in your portal and inbox.',
    tl4: 'Ready — your approval', tl4s: 'You get the finished photos. Approve the piece and pay the balance + shipping; we never ship without your sign-off.',
    tl5: 'Shipped 🎁', tl5s: 'Tracked worldwide, wrapped like the gift it is.',
    confEmail: 'confirmation sent to', yourEmail: 'your email',
    week: ' week', weeks: ' weeks',
    step1Chip: 'Design it', step2Chip: 'Deposit', step3Chip: 'Confirmed',
    mNext: 'Next', mEstimate: 'See estimate',
    from: 'from ',
    steps: [
      { n: '01', title: 'Tell us your dream', body: 'A photo, a sketch, three sentences — any idea works. Pick a category and size.' },
      { n: '02', title: 'Approve your quote', body: 'Lulu confirms price and timeline. You secure your spot with a 40% deposit via Stripe.' },
      { n: '03', title: 'Watch it come to life', body: 'Your piece is assigned to an artisan. Work-in-progress photos along the way.' },
      { n: '04', title: 'Balance, then it ships', body: 'Approve the finished photos, pay the balance, and it ships to you — anywhere on Earth.' }],
    gallery: [
      'Magical guardian · 14in, from a childhood photo', 'Sunshine crib blanket · bunny appliqués',
      'Coquette squirrel · 10in companion', 'Mint & rose stroller blanket + rattle',
      'Little blue friend · 12in, from a sketch', 'Butterfly christening blanket',
      'Garden bunny in overalls · 14in', 'Fairy godbear · birthday surprise'],
    quotes: [
      { text: 'Que bonito 😍 — it looked even better in person. My mom cried.', who: '@ivettebaaez · verified order' },
      { text: 'The WIP photos were half the fun. Felt like watching it be born.', who: 'Sarah M. · Boston' },
      { text: 'I sent three sentences and a bad sketch. What arrived was exactly what I meant.', who: 'Diego R. · CDMX' }],
    depositLabel: '40% deposit due today', balanceLabel: 'Balance when it ships'
  }, es: {
    navGallery: 'Galería', navHow: 'Cómo funciona', navPricing: 'Precios', navStory: 'Nuestra historia', navCta: 'Crea tu pieza',
    heroEyebrow: 'Estudio de crochet a medida · Boston', heroTitle: 'Si lo puedes imaginar, lo podemos', heroTitleEm: 'tejer.',
    heroSub: 'Muñecos únicos, cobijas de herencia y pequeñas maravillas — tejidos a mano según tu idea por Lulu y sus artesanas, con envío a todo el mundo.',
    heroCta: 'Crea tu pieza', heroCta2: 'Ver el trabajo', fromChip: 'Piezas desde',
    trust1: '40% de anticipo, el resto al enviar', trust2: 'Hecho a mano — nunca a máquina', trust3: 'Envíos a todo el mundo',
    howEyebrow: 'Cómo funciona', howTitle: 'De tu idea a tu puerta',
    galEyebrow: 'La galería', galTitle: 'Recién tejido',
    galNote: 'Cada pieza aquí empezó como la foto, el boceto o el recuerdo de alguien. La tuya sigue.',
    priceEyebrow: 'Categorías y precios', priceTitle: 'Lo que hacemos',
    priceSub: 'Cada pieza se cotiza desde un precio base por tamaño — la cotización final se confirma antes de pagar. El crochet no se puede hacer a máquina: cada puntada es a mano.',
    priceNote1: '⚡ Urgente (−40% tiempo): +25%', priceNote2: '📦 Envío se cotiza al pagar', priceNote3: '💳 40% anticipo · resto al enviar',
    storyChip: 'Nació en México · Creció en Boston', storyEyebrow: 'Nuestra historia', storyTitle: 'Tres países, un mismo hilo',
    storyP1: 'Lourdes — Lulu para quien la quiere — aprendió a tejer de niña en Cuba, donde una madeja de estambre valía oro y nada se desperdiciaba.',
    storyP2: 'En México convirtió el oficio en una empresa, enseñando a un pequeño círculo de artesanas que un juguete tejido a mano lleva algo que ninguna fábrica puede copiar.',
    storyP3: 'Hoy trabaja desde Boston, cerca de su hija y sus nietos — los primeros probadores de cada diseño. Cinco artesanas, dos idiomas, una regla: hecho con amor, o no se hace.',
    storyStat1: '3 años de trayectoria', storyStat3: 'Cuba → CDMX → Boston',
    bandTitle: 'Tu imaginación, nuestras manos.',
    footBlurb: 'Un estudio bilingüe de crochet a pedido. Piezas únicas, tejidas a mano y enviadas a todo el mundo.',
    footContact: 'Escríbenos', footPolicy: 'Bueno saber',
    footP1: '40% anticipo · 60% al enviar', footP2: 'Tiempos: 1–8 semanas según tamaño', footP3: 'Envíos a todo el mundo',
    back: 'Volver a Lulu & Loop', backStep: 'Atrás',
    s1Title: 'Diseña tu pieza',
    s1Sub: 'Tres elecciones y unas palabras — eso es todo. Tu precio se actualiza en vivo a la derecha, y Lulu confirma personalmente cada cotización en 24h.',
    fCat: '¿Qué vamos a hacer?', fSize: 'Elige el tamaño', fDesc: 'Describe tu idea',
    fDescPh: '“El gato de mi hija como brujita, con nariz morada y su escobita…”',
    fDescHint: 'Una foto, un boceto o tres frases — lo que sea sirve. También puedes mandar referencias después del pago.',
    fColors: 'Colores', fColorsPh: 'rosa viejo, crema, salvia…', fRef: 'Referencia', fRefPh: 'Sube una foto o boceto',
    optional: '(opcional)', fName: 'Tu nombre', fEmail: 'Correo',
    fRush: '⚡ Pieza urgente', fRushSub: '+25% · se adelanta en la fila, −40% de espera',
    estTitle: 'Tu estimado', qBase: 'Precio base', qRush: 'Urgente — se adelanta', qTotal: 'Total',
    turnLabel: 'Tiempo estimado', contBtn: 'Continuar al anticipo', contHint: 'Describe tu idea para continuar',
    estNote: 'Hoy solo pagas el anticipo. Lulu confirma tu cotización final en 24h — si algo cambia, tú lo apruebas primero.',
    s3Title: 'Pago del anticipo', s3Secure: 'Seguro', s3Card: 'Datos de tarjeta', s3Demo: 'demo — sin cargo real',
    s3Live: 'terminarás en la página segura de Stripe',
    payNow: 'Pagar', processing: 'Procesando…', payHint: 'Agrega tu nombre y correo para continuar',
    payError: 'Algo falló al iniciar el pago — inténtalo de nuevo.',
    balancePaidMsg: '¡Gracias! Saldo recibido — tu pieza se envía pronto. 🎁',
    canceledMsg: 'Pago cancelado — tu diseño sigue abajo, inténtalo cuando quieras.',
    s4Title: '¡Gracias! Tu pieza está en la fila', s4Order: 'Pedido',
    balCard: '¡Tu pieza está lista! Saldo pendiente',
    balCardSub: 'Paga el 60% restante + envío para liberarla. Nunca enviamos sin que veas fotos de la pieza terminada.',
    balPay: 'Pagar saldo ·', again: 'Crear otra pieza',
    portalCta: 'Ver mi pedido y escribirnos',
    portalHint: 'Tu correo de confirmación trae un enlace mágico — o crea una cuenta con el mismo correo para ver todas tus piezas.',
    tl1: 'Anticipo pagado', tl1s: '40% recibido vía Stripe — tu lugar en la fila está apartado.',
    tl2: 'Revisión de cotización', tl2s: 'Lulu revisa tu idea personalmente y confirma la cotización final en 24h — cualquier cambio llega a tu portal.',
    tl3: 'En proceso', tl3s: 'Tu artesana se pone manos a la obra. Fotos del avance y mensajes llegan a tu portal y correo.',
    tl4: 'Lista — tu visto bueno', tl4s: 'Recibes las fotos finales. Apruebas la pieza y pagas el saldo + envío; nunca enviamos sin tu aprobación.',
    tl5: 'Enviada 🎁', tl5s: 'Con rastreo a todo el mundo, envuelta como el regalo que es.',
    confEmail: 'confirmación enviada a', yourEmail: 'tu correo',
    week: ' semana', weeks: ' semanas',
    step1Chip: 'Diseña', step2Chip: 'Anticipo', step3Chip: 'Confirmado',
    mNext: 'Siguiente', mEstimate: 'Ver estimado',
    from: 'desde ',
    steps: [
      { n: '01', title: 'Cuéntanos tu sueño', body: 'Una foto, un boceto, tres frases — cualquier idea sirve. Elige categoría y tamaño.' },
      { n: '02', title: 'Aprueba tu cotización', body: 'Lulu confirma precio y tiempo. Apartas tu lugar con un anticipo del 40% vía Stripe.' },
      { n: '03', title: 'Míralo cobrar vida', body: 'Tu pieza se asigna a una artesana. Fotos del avance en el camino.' },
      { n: '04', title: 'Saldo, y se envía', body: 'Apruebas las fotos finales, pagas el saldo y se envía — a cualquier parte del mundo.' }],
    gallery: [
      'Guardiana mágica · 35cm, de una foto de infancia', 'Cobija de cuna sol · apliques de conejito',
      'Ardilla coqueta · compañera de 25cm', 'Cobija carriola menta y rosa + sonaja',
      'Amiguito azul · 30cm, de un boceto', 'Cobija de bautizo mariposa',
      'Coneja jardinera de overol · 35cm', 'Osita hada · sorpresa de cumpleaños'],
    quotes: [
      { text: 'Que bonito 😍 — en persona era aún más linda. Mi mamá lloró.', who: '@ivettebaaez · verified order' },
      { text: 'Las fotos del avance fueron la mitad de la magia. Fue como verla nacer.', who: 'Sarah M. · Boston' },
      { text: 'Mandé tres frases y un boceto feo. Lo que llegó era exactamente lo que quise decir.', who: 'Diego R. · CDMX' }],
    depositLabel: 'Anticipo del 40% hoy', balanceLabel: 'Saldo al enviar'
  } };

  var GALLERY_IMGS = ['/assets/doll-blonde.jpg', '/assets/blanket-yellow.jpg', '/assets/squirrel-red.jpg',
    '/assets/blanket-mint.jpg', '/assets/doll-blue.jpg', '/assets/blanket-white.jpg',
    '/assets/bunny-overalls.jpg', '/assets/bear-fairy.jpg'];

  /* Yarn palette — pick up to 4, plus free text for anything else */
  var PALETTE = [
    { id: 'blush', en: 'Blush pink', es: 'Rosa viejo', hex: '#E8A9B8' },
    { id: 'cream', en: 'Cream', es: 'Crema', hex: '#F3E9D7' },
    { id: 'sage', en: 'Sage', es: 'Salvia', hex: '#A8BFA0' },
    { id: 'butter', en: 'Butter yellow', es: 'Amarillo suave', hex: '#F2D98C' },
    { id: 'sky', en: 'Sky blue', es: 'Azul cielo', hex: '#9CC3E4' },
    { id: 'navy', en: 'Navy', es: 'Azul marino', hex: '#33456E' },
    { id: 'brick', en: 'Brick red', es: 'Rojo ladrillo', hex: '#B5483A' },
    { id: 'lavender', en: 'Lavender', es: 'Lavanda', hex: '#B9A8D8' },
    { id: 'mint', en: 'Mint', es: 'Menta', hex: '#ABDCC9' },
    { id: 'terracotta', en: 'Terracotta', es: 'Terracota', hex: '#C97B4F' },
    { id: 'chocolate', en: 'Chocolate', es: 'Chocolate', hex: '#6E4B34' },
    { id: 'gray', en: 'Gray', es: 'Gris', hex: '#9A9AA2' },
    { id: 'white', en: 'White', es: 'Blanco', hex: '#FDFDFB' },
    { id: 'black', en: 'Black', es: 'Negro', hex: '#2B2B30' }];
  var PALETTE_MAX = 4;

  var TITLES = {
    en: 'Lulu & Loop — Custom crochet, made to order',
    es: 'Lulu & Loop — Crochet a medida, hecho a pedido'
  };

  /* ---------- State ---------- */
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* storage unavailable */ } }

  var state = {
    lang: lsGet('luluandloop.lang') || 'en',
    step: 1,
    paying: false,
    orderCode: null,
    checkoutHint: null, // null | 'validate' | 'canceled' | 'error'
    mpane: 1, // mobile sub-step within step 1 (1 category · 2 size · 3 details · 4 estimate)
    form: { cat: 'dolls', size: 1, colors: '', palette: [], desc: '', name: '', email: '', rush: false, refName: '' }
  };
  if (state.lang !== 'en' && state.lang !== 'es') state.lang = 'en';

  function t() { return STR[state.lang]; }
  function fmt(n) { return '$' + n; }
  function $(id) { return document.getElementById(id); }
  var mobileMQ = window.matchMedia('(max-width: 740px)');

  // Selected palette names (localized) + free text, joined for the order record
  function composedColors() {
    var names = state.form.palette.map(function (id) {
      var p = PALETTE.find(function (x) { return x.id === id; });
      return p ? (state.lang === 'en' ? p.en : p.es).toLowerCase() : null;
    }).filter(Boolean);
    var custom = state.form.colors.trim();
    if (custom) names.push(custom);
    return names.join(', ');
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* ---------- Quote math (as specified in the handoff) ---------- */
  function quote() {
    var f = state.form;
    var cat = CATS.find(function (c) { return c.id === f.cat; }) || CATS[0];
    var sz = cat.sizes[Math.min(f.size, cat.sizes.length - 1)];
    var base = sz.p;
    var rush = f.rush ? Math.round(base * 0.25) : 0;
    var total = base + rush;
    var deposit = Math.round(total * DEPOSIT_PCT / 100);
    var balance = total - deposit;
    var wk = f.rush
      ? [Math.max(1, Math.round(sz.wk[0] * 0.6)), Math.max(1, Math.round(sz.wk[1] * 0.6))]
      : sz.wk;
    return { cat: cat, sz: sz, base: base, rush: rush, total: total, deposit: deposit, balance: balance, wk: wk };
  }

  function turnLabel(wk) {
    var L = state.lang;
    if (wk[0] === wk[1]) {
      return wk[0] + (L === 'en' ? (wk[0] > 1 ? t().weeks : t().week) : (wk[0] > 1 ? t().weeks : t().week));
    }
    return wk[0] + '–' + wk[1] + t().weeks;
  }

  /* ---------- Static i18n ---------- */
  function applyStatic() {
    var tt = t();
    document.querySelectorAll('[data-i18n]').forEach(function (el) {
      var key = el.getAttribute('data-i18n');
      if (tt[key] != null) el.textContent = tt[key];
    });
    document.querySelectorAll('[data-i18n-ph]').forEach(function (el) {
      var key = el.getAttribute('data-i18n-ph');
      if (tt[key] != null) el.placeholder = tt[key];
    });
    document.documentElement.lang = state.lang;
    document.title = TITLES[state.lang];
    $('lang-en').classList.toggle('on', state.lang === 'en');
    $('lang-es').classList.toggle('on', state.lang === 'es');
    // Dropzone label shows the picked file name if any
    if (state.form.refName) $('dropzone-label').textContent = state.form.refName + ' ✓';
  }

  /* ---------- Marquee ---------- */
  function renderMarquee() {
    var items = ['Hecho a mano con amor', 'Handmade with love', 'One of one', 'Cuba → México → Boston'];
    var half = items.map(function (s) {
      return '<span>' + esc(s) + '</span><span class="flower">✿</span>';
    }).join('');
    $('marquee-track').innerHTML = half + half;
  }

  /* ---------- Home sections ---------- */
  function renderHome() {
    var tt = t();
    $('how-grid').innerHTML = tt.steps.map(function (s) {
      return '<div class="how-card"><div class="how-num display">' + s.n + '</div>' +
        '<div class="how-title">' + esc(s.title) + '</div>' +
        '<div class="how-body">' + esc(s.body) + '</div></div>';
    }).join('');

    $('gallery-grid').innerHTML = tt.gallery.map(function (cap, i) {
      return '<figure><img src="' + GALLERY_IMGS[i] + '" alt="' + esc(cap) + '" loading="lazy">' +
        '<figcaption>' + esc(cap) + '</figcaption></figure>';
    }).join('');

    $('pricing-grid').innerHTML = CATS.map(function (c) {
      var rows = c.sizes.map(function (s) {
        return '<div class="price-row"><span class="size">' + esc(state.lang === 'en' ? s.en : s.es) + '</span>' +
          '<span class="dim">' + esc(s.dim) + '</span><span class="price">' + fmt(s.p) + '</span></div>';
      }).join('');
      return '<div class="price-card"><div class="price-card-head">' +
        '<div class="price-card-name display">' + esc(state.lang === 'en' ? c.en : c.es) + '</div>' +
        '<div class="price-card-num">' + c.num + '</div></div>' +
        '<div class="price-card-blurb">' + esc(state.lang === 'en' ? c.ben : c.bes) + '</div>' +
        '<div class="price-rows">' + rows + '</div></div>';
    }).join('');

    $('quotes-grid').innerHTML = tt.quotes.map(function (q) {
      return '<div class="quote-card"><div class="quote-text display">“' + esc(q.text) + '”</div>' +
        '<div class="quote-who">' + esc(q.who) + '</div></div>';
    }).join('');
  }

  /* ---------- Wizard ---------- */
  function renderStepper() {
    var tt = t();
    var labels = [tt.step1Chip, tt.step2Chip, tt.step3Chip];
    $('stepper').innerHTML = labels.map(function (label, i) {
      var n = i + 1;
      var cls = n === state.step ? 'active' : n < state.step ? 'done' : 'todo';
      return '<div class="step-chip ' + cls + '">' + n + ' · ' + esc(label) + '</div>';
    }).join('');
  }

  function renderCatCards() {
    var f = state.form;
    $('cat-grid').innerHTML = CATS.map(function (c) {
      var minP = Math.min.apply(null, c.sizes.map(function (s) { return s.p; }));
      var sel = c.id === f.cat ? ' selected' : '';
      return '<button type="button" class="cat-card' + sel + '" data-cat="' + c.id + '">' +
        '<img src="' + c.img + '" alt="">' +
        '<div class="cat-card-name">' + esc(state.lang === 'en' ? c.en : c.es) + '</div>' +
        '<div class="cat-card-from">' + t().from + fmt(minP) + '</div></button>';
    }).join('');
    Array.prototype.forEach.call(document.querySelectorAll('.cat-card'), function (el) {
      el.addEventListener('click', function () {
        state.form.cat = el.getAttribute('data-cat');
        state.form.size = 0;
        renderCatCards(); renderSizePills(); renderSummary();
      });
    });
  }

  function renderSizePills() {
    var f = state.form;
    var cat = CATS.find(function (c) { return c.id === f.cat; }) || CATS[0];
    var selIdx = Math.min(f.size, cat.sizes.length - 1);
    $('size-pills').innerHTML = cat.sizes.map(function (s, i) {
      var sel = i === selIdx ? ' selected' : '';
      return '<button type="button" class="size-pill' + sel + '" data-i="' + i + '">' +
        esc(state.lang === 'en' ? s.en : s.es) + ' · ' + esc(s.dim) + ' — ' + fmt(s.p) + '</button>';
    }).join('');
    Array.prototype.forEach.call(document.querySelectorAll('.size-pill'), function (el) {
      el.addEventListener('click', function () {
        state.form.size = parseInt(el.getAttribute('data-i'), 10);
        renderSizePills(); renderSummary();
      });
    });
  }

  function renderPalette() {
    var sel = state.form.palette;
    $('palette').innerHTML = PALETTE.map(function (p) {
      var on = sel.indexOf(p.id) > -1;
      var light = ['cream', 'white', 'butter', 'mint'].indexOf(p.id) > -1;
      return '<button type="button" class="swatch' + (on ? ' on' : '') + (light ? ' light' : '') +
        '" data-color="' + p.id + '" style="--sw:' + p.hex + '" aria-pressed="' + on + '">' +
        '<span class="swatch-dot"></span>' + esc(state.lang === 'en' ? p.en : p.es) +
        (on ? ' ✓' : '') + '</button>';
    }).join('');
    Array.prototype.forEach.call(document.querySelectorAll('.swatch'), function (b) {
      b.addEventListener('click', function () {
        var id = b.getAttribute('data-color');
        var i = state.form.palette.indexOf(id);
        if (i > -1) state.form.palette.splice(i, 1);
        else if (state.form.palette.length < PALETTE_MAX) state.form.palette.push(id);
        renderPalette();
        // the rebuild destroyed the focused button — restore keyboard focus
        var nb = document.querySelector('.swatch[data-color="' + id + '"]');
        if (nb) nb.focus();
      });
    });
  }

  /* ---------- Mobile sub-steps (step 1 only) ---------- */
  function renderMobileBar() {
    var q = quote(), tt = t();
    var w = $('wizard');
    w.setAttribute('data-mpane', String(state.mpane));
    $('mbar-total').textContent = tt.qTotal + ' ' + fmt(q.total);
    $('mbar-dep').textContent = tt.depositLabel + ' · ' + fmt(q.deposit);
    $('mbar-dots').innerHTML = [1, 2, 3, 4].map(function (n) {
      return '<span class="mdot' + (n === state.mpane ? ' on' : n < state.mpane ? ' done' : '') + '"></span>';
    }).join('');
    $('mbar-back').hidden = state.mpane === 1;
    var next = $('mbar-next');
    if (state.mpane === 4) {
      var disabled = !state.form.desc.trim();
      next.textContent = tt.contBtn + ' →';
      next.disabled = disabled;
    } else {
      next.textContent = (state.mpane === 3 ? tt.mEstimate : tt.mNext) + ' →';
      next.disabled = false;
    }
  }

  function goPane(n) {
    state.mpane = Math.max(1, Math.min(4, n));
    renderMobileBar();
    window.scrollTo(0, 0);
  }

  function renderSummary() {
    var q = quote(), tt = t();
    $('q-item').textContent = (state.lang === 'en' ? q.cat.en : q.cat.es) + ' · ' +
      (state.lang === 'en' ? q.sz.en : q.sz.es) + ' (' + q.sz.dim + ')';
    $('q-base').textContent = fmt(q.base);
    $('q-rush-row').hidden = !state.form.rush;
    $('q-rush').textContent = '+' + fmt(q.rush);
    $('q-total').textContent = fmt(q.total);
    $('q-dep-label').textContent = tt.depositLabel;
    $('q-deposit').textContent = fmt(q.deposit);
    $('q-bal-label').textContent = tt.balanceLabel;
    $('q-balance').textContent = fmt(q.balance);
    $('q-turn').textContent = turnLabel(q.wk);
    var disabled = !state.form.desc.trim();
    var btn = $('btn-continue');
    btn.disabled = disabled;
    btn.textContent = tt.contBtn + ' · ' + fmt(q.deposit) + ' →';
    $('continue-hint').hidden = !disabled;
    renderMobileBar();
  }

  function renderCheckout() {
    var q = quote(), tt = t();
    // With the real backend, payment details are collected on Stripe's hosted
    // page — the inline demo card fields disappear.
    var cloud = !!(window.LuluAPI && window.LuluAPI.cloudEnabled);
    document.querySelector('.card-group').hidden = cloud;
    document.querySelector('.card-split').hidden = cloud;
    $('note-demo').hidden = cloud;
    $('note-live').hidden = !cloud;
    $('pay-amount').textContent = fmt(q.deposit);
    $('pay-recap1').textContent = tt.depositLabel + ' · ' +
      (state.lang === 'en' ? q.cat.en : q.cat.es) + ' · ' +
      (state.lang === 'en' ? q.sz.en : q.sz.es) + ' (' + q.sz.dim + ')';
    $('pay-recap2').textContent = tt.qTotal + ' ' + fmt(q.total) + ' · ' + tt.balanceLabel + ' ' + fmt(q.balance);
    $('pay-label').textContent = state.paying ? tt.processing : tt.payNow + ' ' + fmt(q.deposit);
    $('pay-spinner').hidden = !state.paying;
    var hintMsg = { validate: tt.payHint, canceled: tt.canceledMsg, error: tt.payError }[state.checkoutHint] || '';
    $('checkout-hint').textContent = hintMsg;
    $('checkout-hint').classList.toggle('show', !!hintMsg);
  }

  function renderTimeline() {
    var tt = t();
    var defs = [[tt.tl1, tt.tl1s], [tt.tl2, tt.tl2s], [tt.tl3, tt.tl3s], [tt.tl4, tt.tl4s], [tt.tl5, tt.tl5s]];
    var doneCount = 1; // deposit paid; later stages advance server-side / by email
    $('timeline').innerHTML = defs.map(function (d, i) {
      var done = i < doneCount, active = i === doneCount;
      var dotCls = done ? 'done' : active ? 'active' : 'todo';
      var mark = done ? '✓' : (i + 1);
      var line = i < 4 ? '<div class="tl-line"></div>' : '';
      var titleCls = done || active ? '' : ' future';
      return '<div class="tl-node"><div class="tl-rail"><div class="tl-dot ' + dotCls + '">' + mark + '</div>' + line + '</div>' +
        '<div class="tl-body"><div class="tl-title' + titleCls + '">' + esc(d[0]) + '</div>' +
        '<div class="tl-sub">' + esc(d[1]) + '</div></div></div>';
    }).join('');
    $('conf-email').textContent = tt.confEmail + ' ' + (state.form.email || tt.yourEmail);
    $('btn-portal').href = '/orders/?code=' + encodeURIComponent(state.orderCode || '') + '&lang=' + state.lang;
    var q = quote();
    $('btn-balance').textContent = tt.balPay + ' ' + fmt(q.balance);
    if (state.orderCode) $('order-code').textContent = state.orderCode;
  }

  function renderWizard() {
    $('wizard').setAttribute('data-step', String(state.step));
    renderStepper();
    if (state.step === 1) { renderCatCards(); renderSizePills(); renderPalette(); renderSummary(); }
    if (state.step === 2) renderCheckout();
    if (state.step === 3) renderTimeline();
  }

  function renderAll() {
    applyStatic();
    renderMarquee();
    renderHome();
    renderWizard();
  }

  /* ---------- Routing ---------- */
  function isOrderRoute() { return location.hash.replace('#', '') === 'order'; }

  var wasOrder = isOrderRoute();
  function applyRoute() {
    var order = isOrderRoute();
    document.body.classList.toggle('view-order', order);
    if (order) renderWizard();
    // Scroll to top only when entering/leaving the wizard — plain section
    // anchors (#gallery, #pricing, …) must keep native fragment scrolling.
    if (order !== wasOrder) window.scrollTo(0, 0);
    wasOrder = order;
  }

  function goStep(n) {
    state.step = n;
    renderWizard();
    window.scrollTo(0, 0);
  }

  /* ---------- Orders (shared with /studio via localStorage) ---------- */
  function nextOrderCode() {
    var now = new Date();
    var yy = String(now.getFullYear()).slice(-2);
    var mm = String(now.getMonth() + 1).padStart(2, '0');
    var seq = parseInt(lsGet('luluandloop.orderSeq') || '159', 10) + 1;
    lsSet('luluandloop.orderSeq', String(seq));
    return 'LU-' + yy + mm + '-' + String(seq).padStart(4, '0');
  }

  function saveOrder(q) {
    var f = state.form;
    var order = {
      code: state.orderCode,
      customer: f.name || 'Web order',
      email: f.email,
      where: 'Online',
      item: (state.lang === 'en' ? q.cat.en : q.cat.es) + ' · ' + (state.lang === 'en' ? q.sz.en : q.sz.es),
      size: (state.lang === 'en' ? q.sz.en : q.sz.es) + ' · ' + q.sz.dim,
      price: q.total, stage: 0, artisan: '', img: q.cat.img,
      desc: f.desc, colors: composedColors() || '—', rush: f.rush,
      lang: state.lang, createdAt: new Date().toISOString()
    };
    try {
      var orders = JSON.parse(lsGet('luluandloop.orders') || '[]');
      orders.push(order);
      lsSet('luluandloop.orders', JSON.stringify(orders));
    } catch (e) { /* storage unavailable — order still confirmed on screen */ }
  }

  /* ---------- Events ---------- */
  function bind() {
    $('lang-en').addEventListener('click', function () { setLang('en'); });
    $('lang-es').addEventListener('click', function () { setLang('es'); });

    $('brand').addEventListener('click', function () {
      if (isOrderRoute()) location.hash = '';
      window.scrollTo(0, 0);
    });

    Array.prototype.forEach.call(document.querySelectorAll('[data-start]'), function (el) {
      el.addEventListener('click', function () {
        state.step = 1;
        state.mpane = 1;
        if (isOrderRoute()) { renderWizard(); window.scrollTo(0, 0); }
        else location.hash = 'order';
      });
    });

    $('mbar-back').addEventListener('click', function () { goPane(state.mpane - 1); });
    $('mbar-next').addEventListener('click', function () {
      if (state.mpane < 4) { goPane(state.mpane + 1); return; }
      if (!state.form.desc.trim()) return;
      goStep(2);
    });

    $('back-home').addEventListener('click', function () { location.hash = ''; });

    $('f-desc').addEventListener('input', function (e) { state.form.desc = e.target.value; renderSummary(); });
    $('f-colors').addEventListener('input', function (e) { state.form.colors = e.target.value; });
    $('f-rush').addEventListener('change', function (e) { state.form.rush = e.target.checked; renderSummary(); });

    var dz = $('dropzone'), fileInput = $('f-ref');
    function pickFile() { fileInput.click(); }
    dz.addEventListener('click', pickFile);
    dz.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pickFile(); } });
    fileInput.addEventListener('change', function () {
      if (fileInput.files && fileInput.files[0]) {
        state.form.refName = fileInput.files[0].name;
        $('dropzone-label').textContent = state.form.refName + ' ✓';
        dz.classList.add('has-file');
      }
    });
    dz.addEventListener('dragover', function (e) { e.preventDefault(); });
    dz.addEventListener('drop', function (e) {
      e.preventDefault();
      if (e.dataTransfer.files && e.dataTransfer.files[0]) {
        state.form.refName = e.dataTransfer.files[0].name;
        $('dropzone-label').textContent = state.form.refName + ' ✓';
        dz.classList.add('has-file');
      }
    });

    $('btn-continue').addEventListener('click', function () {
      if (!state.form.desc.trim()) return;
      goStep(2);
    });
    $('btn-back-step').addEventListener('click', function () { goStep(Math.max(1, state.step - 1)); });

    $('f-name').addEventListener('input', function (e) { state.form.name = e.target.value; e.target.classList.remove('invalid'); });
    $('f-email').addEventListener('input', function (e) { state.form.email = e.target.value; e.target.classList.remove('invalid'); });

    $('btn-pay').addEventListener('click', function () {
      if (state.paying) return;
      var nameOk = !!state.form.name.trim();
      var emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(state.form.email.trim());
      if (!nameOk || !emailOk) {
        $('f-name').classList.toggle('invalid', !nameOk);
        $('f-email').classList.toggle('invalid', !emailOk);
        state.checkoutHint = 'validate';
        renderCheckout();
        return;
      }
      state.checkoutHint = null;
      state.paying = true;
      renderCheckout();

      if (window.LuluAPI && window.LuluAPI.cloudEnabled) {
        // Real Stripe Checkout: the server derives all prices from the catalog —
        // we only send stable identifiers plus the customer's own content.
        var q = quote();
        try {
          sessionStorage.setItem('luluandloop.pendingForm',
            JSON.stringify({ form: state.form, lang: state.lang }));
        } catch (e) { /* ignore */ }
        window.LuluAPI.createCheckout({
          name: state.form.name.trim(),
          email: state.form.email.trim(),
          cat_id: q.cat.id,
          size_idx: Math.min(state.form.size, q.cat.sizes.length - 1),
          rush: state.form.rush,
          desc: state.form.desc.trim(),
          colors: composedColors() || '—',
          lang: state.lang
        }).then(function (res) {
          location.href = res.url; // Stripe-hosted checkout page
        }).catch(function () {
          state.paying = false;
          state.checkoutHint = 'error';
          renderCheckout();
        });
        return;
      }

      // Demo checkout (no backend configured) — simulated, clearly labeled on-screen
      setTimeout(function () {
        state.paying = false;
        state.orderCode = nextOrderCode();
        saveOrder(quote());
        goStep(3);
      }, 1100);
    });

    $('btn-again').addEventListener('click', function () {
      state.step = 1;
      state.mpane = 1;
      state.orderCode = null;
      state.form.desc = '';
      state.form.rush = false;
      state.form.refName = '';
      state.form.palette = [];
      state.form.colors = '';
      $('f-colors').value = '';
      $('f-desc').value = '';
      $('f-rush').checked = false;
      $('dropzone').classList.remove('has-file');
      renderAll();
      window.scrollTo(0, 0);
    });

    $('btn-balance').addEventListener('click', function () {
      // Balance payments are sent as a Stripe Payment Link by the studio.
      $('balance-card').hidden = true;
    });

    window.addEventListener('hashchange', applyRoute);

    // If the page is restored from the back/forward cache mid-checkout
    // (user hit Back on Stripe's page), clear the stuck 'Processing…' state.
    window.addEventListener('pageshow', function (e) {
      if (e.persisted && state.paying) {
        state.paying = false;
        if (state.step === 2) renderCheckout();
      }
    });
  }

  function setLang(l) {
    state.lang = l;
    lsSet('luluandloop.lang', l);
    renderAll();
  }

  /* ---------- Init ---------- */
  function siteToast(msg) {
    var el = document.createElement('div');
    el.className = 'site-toast';
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(function () { el.classList.add('show'); }, 10);
    setTimeout(function () { el.classList.remove('show'); setTimeout(function () { el.remove(); }, 400); }, 6000);
  }

  function restorePendingForm() {
    try {
      var pending = JSON.parse(sessionStorage.getItem('luluandloop.pendingForm') || 'null');
      sessionStorage.removeItem('luluandloop.pendingForm');
      if (pending && pending.form) {
        state.form = Object.assign(state.form, pending.form);
        if (pending.lang === 'en' || pending.lang === 'es') state.lang = pending.lang;
        $('f-desc').value = state.form.desc || '';
        $('f-colors').value = state.form.colors || '';
        $('f-rush').checked = !!state.form.rush;
        $('f-name').value = state.form.name || '';
        $('f-email').value = state.form.email || '';
      }
    } catch (e) { /* ignore */ }
  }

  var params = new URLSearchParams(location.search);
  if (params.get('lang') === 'es' || params.get('lang') === 'en') {
    state.lang = params.get('lang');
    lsSet('luluandloop.lang', state.lang);
  }

  var backFromStripe = null;
  if (params.get('paid') === 'deposit') backFromStripe = 'deposit';
  else if (params.get('paid') === 'balance') backFromStripe = 'balance';
  else if (params.get('canceled')) backFromStripe = 'canceled';

  if (backFromStripe === 'deposit') {
    restorePendingForm();
    state.orderCode = params.get('code') || null;
    state.step = 3;
    history.replaceState(null, '', '/#order');
  } else if (backFromStripe === 'canceled') {
    restorePendingForm();
    state.step = 2;
    state.checkoutHint = 'canceled';
    history.replaceState(null, '', '/#order');
  } else if (backFromStripe === 'balance') {
    history.replaceState(null, '', '/');
  }

  bind();
  renderAll();
  document.body.classList.toggle('view-order', isOrderRoute());
  if (backFromStripe === 'balance') siteToast(t().balancePaidMsg);
})();
