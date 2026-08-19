/* ══════════════════════════════════════════════════════════════════
   خريطةٌ ذهنيةٌ تفاعلية — منطقُ العرض
   المستوى ١ = البطاقة · المستوى ٢ = .k · المستوى ٣ = .v
   ══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var D = document, NS = 'http://www.w3.org/2000/svg';
  var panels = [].slice.call(D.querySelectorAll('.panel'));
  var tabs   = [].slice.call(D.querySelectorAll('.tab'));
  var tablist= D.querySelector('.tabs');
  var ind    = D.querySelector('.tabind');
  if (!panels.length) return;

  gsap.registerPlugin(DrawSVGPlugin);
  var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce) gsap.globalTimeline.timeScale(200);

  var trees = new Map();   // panel -> {svg,spine,cards,wires,nodes,grid}
  var tls   = new Map();   // card  -> timeline
  var drawn = new Set();   // panel-panel التي رُسمت أسلاكُها مرّةً

  /* ── مؤقّتُ إعادة الرسم: واحدٌ للجميع، يعمل ما دامت حركةٌ جارية ── */
  var live = 0;
  function tick() { var p = current(); if (p) layout(p); }
  function tickOn()  { if (++live === 1) gsap.ticker.add(tick); }
  function tickOff() { if (--live <= 0) { live = 0; gsap.ticker.remove(tick); } }

  function current() {
    for (var i = 0; i < panels.length; i++) if (!panels[i].hidden) return panels[i];
    return null;
  }
  function mk(tag, attrs) {
    var e = D.createElementNS(NS, tag);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    return e;
  }

  /* ═══ بناءُ طبقة الأسلاك ═══ */
  function buildTree(panel) {
    var grid = panel.querySelector('.grid');
    var wrap = panel.querySelector('.stage') || panel.querySelector('.treewrap');
    if (!grid || !wrap) return;
    var svg   = mk('svg', { 'class': 'wires', 'aria-hidden': 'true' });
    var spine = mk('path', { 'class': 'spine' });
    svg.appendChild(spine);
    var cards = [].slice.call(grid.querySelectorAll('.card'));
    var wires = [], nodes = [];
    cards.forEach(function () {
      var w = mk('path', { 'class': 'wire' });
      svg.appendChild(w); wires.push(w);
    });
    cards.forEach(function () {
      var n = mk('circle', { 'class': 'node', r: 4 });
      svg.appendChild(n); nodes.push(n);
    });
    wrap.insertBefore(svg, grid);
    trees.set(panel, { svg: svg, spine: spine, cards: cards, wires: wires, nodes: nodes, grid: grid });
  }

  /* ═══ حسابُ إحداثيات الأسلاك من مواضع البطاقات الفعلية ═══ */
  function layoutTree(panel) {
    var t = trees.get(panel);
    if (!t) return;
    var grid = t.grid, W = grid.offsetWidth, H = grid.offsetHeight;
    if (!W || !H) return;

    t.svg.setAttribute('width', W);
    t.svg.setAttribute('height', H);
    t.svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);

    // في عمودٍ واحدٍ يكون الجذعُ عند الحافّة اليمنى، وفي عمودين في الوسط
    var cols = getComputedStyle(grid).gridTemplateColumns.trim().split(/\s+/).length;
    var spineX = cols < 2 ? W - 16 : W / 2;
    var top = Infinity, bot = -Infinity;

    t.cards.forEach(function (card, i) {
      var y1 = card.offsetTop + 22;              // منتصفُ العنوان — ثابتٌ مهما عَلَت البطاقة
      var y0 = Math.max(6, y1 - 16);             // نقطةُ التفرُّع على الجذع
      var mid = card.offsetLeft + card.offsetWidth / 2;
      var edgeX = mid > spineX ? card.offsetLeft : card.offsetLeft + card.offsetWidth;
      var mx = (spineX + edgeX) / 2;
      t.wires[i].setAttribute('d',
        'M' + spineX + ',' + y0 + 'C' + mx + ',' + y0 + ' ' + mx + ',' + y1 + ' ' + edgeX + ',' + y1);
      t.nodes[i].setAttribute('cx', spineX);
      t.nodes[i].setAttribute('cy', y0);
      if (y0 < top) top = y0;
      if (y0 > bot) bot = y0;
    });

    if (top !== Infinity) {
      t.spine.setAttribute('d',
        'M' + spineX + ',' + Math.max(0, top - 12) + 'L' + spineX + ',' + (bot + 12));
    }
  }

/* ═══════════════ عرضُ المدار ═══════════════ */
  var GAP = 26;              // أدنى فُرجةٍ بين كوكبين
  var sel = new Map();       // panel → الكوكبُ المفتوح

  function isOrbit() {
    return D.documentElement.getAttribute('data-view') === 'orbit' && innerWidth >= 760;
  }

  var SUN_H = 118;      // ارتفاعُ النواة: اسمُ الكتاب ووسومُه فقط
  var MIN_LABEL = 44;   // دون هذا لا يبقى إلّا الرقم
  var STAGGER = 0.08;   // تناوبُ الأبعاد: يفكُّ ازدحامَ الأكتاف

  /* مَدُّ الشعاعِ حتى يخرجَ من مستطيلٍ نصفُ قطريه (a,b) حولَ المبدأ.
     تُستعمَل مرّتين: للخروج من النواة، وللخروج من نافذة الكاميرا. */
  function rayOut(ca, sa, a, b) {
    return Math.min(Math.abs(ca) < 1e-6 ? Infinity : a / Math.abs(ca),
                    Math.abs(sa) < 1e-6 ? Infinity : b / Math.abs(sa));
  }

  /* ═══ توزيعٌ حرٌّ: لكلِّ كوكبٍ زاويتُه وبُعدُه ═══
     لا مسارَ يربطهم. لكلِّ كوكبٍ نصيبٌ من الدائرة بقدرِ عرضِه، ثمّ يُدفَع
     إلى أدنى بُعدٍ يَسَعُه نصيبُه: كوكبٌ عريضٌ في نصيبٍ ضيّقٍ لا بدَّ أن
     يبتعد، ‏(w/2)/tan(Δθ/2)‏ — وضيّقٌ يبقى قريبًا. ويُضاف شرطُ الخروجِ من
     النواة، والنواةُ مستطيلةٌ فمَخرجُها الأفقيُّ أطولُ من الرأسيّ.

     من هذين وحدَهما تخرج الأبعادُ مختلفةً بلا افتعال، وهذا هو المطلوب:
     حين يُفتَح موضوعٌ ثقيلٌ يستطيع كلُّ كوكبٍ أن يزيد بُعدَه وحدَه. */
  function spread(ws, hs, A, B, mul) {
    var n = ws.length, i, th = [], r = [], pos = [], sum = 0;
    for (i = 0; i < n; i++) sum += ws[i] + GAP;
    var acc = 0;
    for (i = 0; i < n; i++) {
      var share = 2 * Math.PI * (ws[i] + GAP) / sum;
      th.push(acc + share / 2);
      acc += share;
      var need = (ws[i] / 2 + GAP / 2) / Math.tan(share / 2);
      var ca = Math.cos(th[i]), sa = -Math.sin(th[i]);
      /* الخروجُ من النواة يُحَلُّ لا يُقدَّر: أصغرُ بُعدٍ يُخرِج مركزَ الكارت
         من مستطيلِ النواة موسَّعًا بنصفِ الكارت. مدُّ الشعاعِ ثمّ زيادةُ
         نصفِ الكارت عليه يُبقي الركنَ داخلًا في الاتّجاهات المائلة. */
      var base = Math.max(need,
        outOf(ca, sa, 0, 0, A + ws[i] / 2 + GAP, B + hs[i] / 2 + GAP));
      /* تناوبٌ خفيفٌ في البُعد: كتفا جارَين لا يلتقيان على خطٍّ واحد */
      r.push(base * (1 + (i % 2 ? STAGGER : -STAGGER)) * mul);
    }
    for (i = 0; i < n; i++) pos.push([r[i] * Math.cos(th[i]), -r[i] * Math.sin(th[i])]);
    return { th: th, r: r, pos: pos };
  }

  function hits(pos, ws, hs, A, B) {
    var n = pos.length, i, j;
    for (i = 0; i < n; i++) {
      if (Math.abs(pos[i][0]) < A + ws[i] / 2 + GAP &&
          Math.abs(pos[i][1]) < B + hs[i] / 2 + GAP) return true;      // فوقَ النواة
      for (j = i + 1; j < n; j++) {
        if (Math.abs(pos[i][0] - pos[j][0]) < (ws[i] + ws[j]) / 2 + GAP &&
            Math.abs(pos[i][1] - pos[j][1]) < (hs[i] + hs[j]) / 2 + GAP) return true;
      }
    }
    return false;
  }

  function spanOf(pos, ws, hs) {
    var mx = 0, my = 0;
    for (var i = 0; i < pos.length; i++) {
      mx = Math.max(mx, Math.abs(pos[i][0]) + ws[i] / 2);
      my = Math.max(my, Math.abs(pos[i][1]) + hs[i] / 2);
    }
    return { w: 2 * mx, h: 2 * my };
  }

  /* لأنّ النصيبَ يُعطى بقدر العرض، يخرج «البُعدُ المطلوب» متقاربًا فتقترب
     الصورةُ من الدائرة — والإطارُ ليس دائرةً: أعرضُ منه ارتفاعًا. فيُمدَّد
     كلُّ محورٍ وحدَه حتى يملأ حصّتَه. الأبعادُ تبقى مختلفةً لكلِّ كوكب، وإنّما
     يتمدّد الفضاءُ حولَها. */
  function axisFit(pos, ws, hs, W, H) {
    var sx = Infinity, sy = Infinity, i, ax, ay;
    for (i = 0; i < pos.length; i++) {
      ax = Math.abs(pos[i][0]); ay = Math.abs(pos[i][1]);
      if (ax > 0.5) sx = Math.min(sx, (W / 2 - ws[i] / 2) / ax);
      if (ay > 0.5) sy = Math.min(sy, (H / 2 - hs[i] / 2) / ay);
    }
    if (!isFinite(sx) || sx <= 0) sx = 1;
    if (!isFinite(sy) || sy <= 0) sy = 1;
    return { sx: sx, sy: sy };
  }

  /* الاعوجاجُ يغيّر الزاويةَ والبُعدَ معًا، فيُعاد اشتقاقُهما من الموضع
     الجديد — وبذلك يبقى كلُّ ما بعدَه (الأسلاك، الدفعُ خارجَ النافذة)
     يعمل بإحداثياتٍ قطبيةٍ صريحةٍ لا يعرف عن الاعوجاج شيئًا. */
  function repolar(pos) {
    var th = [], r = [];
    for (var i = 0; i < pos.length; i++) {
      r.push(Math.hypot(pos[i][0], pos[i][1]));
      th.push(Math.atan2(-pos[i][1], pos[i][0]));
    }
    return { th: th, r: r };
  }

  function layoutOrbit(panel) {
    var t = trees.get(panel);
    if (!t) return;
    var wrap = panel.querySelector('.treewrap');
    var W = wrap.clientWidth;
    if (!W) return;

    var H = Math.max(520, Math.min(760, innerHeight - 150));
    wrap.style.setProperty('--orbit-h', H + 'px');

    /* الإطارُ كما هو: لا شيءَ يُعاد قياسُه. وهذا مَخرجُ اللوح — شريطُ عنوانه
       يظهر ويختفي مع كلِّ تمريرةٍ فيُطلِق resize، وكان كلُّ واحدٍ منها يُعيد
       الكواكبَ إلى مواضعها الأولى فوق الشبكة المفتوحة. ويقطع كذلك حلقةَ
       ‏--orbit-h ← ResizeObserver. */
    var pre = panel._orbit;
    if (pre && pre.W === W && pre.H === H) { drawWires(panel); updateOrbs(panel); return; }

    var cards = t.cards;
    var A = Math.round(Math.min(360, W * 0.34)) / 2, B = SUN_H / 2;
    wrap.style.setProperty('--hub-w', Math.round(2 * A) + 'px');
    wrap.style.setProperty('--hub-h', Math.round(2 * B) + 'px');

    function measure(level) {
      wrap.classList.toggle('numonly', level === 'num');
      if (level === 'num' || level === null) wrap.style.removeProperty('--planet-w');
      else wrap.style.setProperty('--planet-w', Math.round(level) + 'px');

      var ws = [], hs = [], maxT = 0, i;
      for (i = 0; i < cards.length; i++) {
        ws.push(cards[i].offsetWidth); hs.push(cards[i].offsetHeight);
        var h3 = cards[i].querySelector('.chead h3');
        if (h3 && h3.offsetWidth > maxT) maxT = h3.offsetWidth;
      }

      /* البناءُ نفسُه يمنع التقاطعَ عند mul = 1، فلا يبقى إلّا أن نمدَّ
         حتى يمتلئ الإطارُ: أكبرُ تمديدٍ يَسَعُه، بالبحث الثنائيّ. ولو لم
         يَسَعِ الإطارُ حتى عند ١ فقد ضاق حقًّا، فتُنقَص العناوين. */
      /* أوّلًا أصغرُ تمديدٍ لا تقاطعَ فيه (البناءُ يكفي غالبًا عند ١)،
         ثمّ يُمدَّد كلُّ محورٍ حتى يملأ الإطار. إن أحدثَ المدُّ المعوَجُّ
         تقاطعًا رُجِع إلى مدٍّ متساوٍ في المحورين. */
      var q, m, mLo = 1;
      if (hits(spread(ws, hs, A, B, 1).pos, ws, hs, A, B)) {
        var a = 1, bb = 4;
        if (hits(spread(ws, hs, A, B, bb).pos, ws, hs, A, B)) {
          return { level: level, maxT: maxT, ok: false };
        }
        for (q = 0; q < 18; q++) {
          m = (a + bb) / 2;
          if (hits(spread(ws, hs, A, B, m).pos, ws, hs, A, B)) a = m; else bb = m;
        }
        mLo = bb;
      }
      var raw = spread(ws, hs, A, B, mLo);
      var f = axisFit(raw.pos, ws, hs, W, H);
      /* الانكماشُ القليلُ مقبولٌ ما لم يُحدِثْ تقاطعًا — والفيصلُ hits لا
         مقارنةُ المعامل بواحد. رفضُ كلِّ انكماشٍ كان يُسقِط العناوينَ من
         أجل تسعةَ عشرَ بكسلًا. */
      function scaled(sx, sy) {
        return raw.pos.map(function (pp) { return [pp[0] * sx, pp[1] * sy]; });
      }
      var pos = scaled(f.sx, f.sy);
      if (hits(pos, ws, hs, A, B)) {
        var iso2 = Math.min(f.sx, f.sy);
        pos = scaled(iso2, iso2);
        if (hits(pos, ws, hs, A, B)) return { level: level, maxT: maxT, ok: false };
      }
      var pol = repolar(pos);
      return { level: level, maxT: maxT, ok: true,
               th: pol.th, r: pol.r, pos: pos, ws: ws, hs: hs,
               span: spanOf(pos, ws, hs) };
    }

    /* درجاتُ التضييق: لا نهبط درجةً إلّا إذا لم يسَعِ الإطارُ فعلًا —
       فقدُ العناوين بلا مقابلٍ أسوأُ من ازدحامٍ محتمَل. */
    var chosen = measure(null);
    if (!chosen.ok) {
      var full = chosen;
      var levels = [Math.round(full.maxT * 0.78), Math.round(full.maxT * 0.58),
                    MIN_LABEL, 'num'];
      chosen = null;
      for (var li = 0; li < levels.length; li++) {
        var c = measure(levels[li]);
        if (c.ok) { chosen = c; break; }
      }
      if (!chosen) return;                // لا شيءَ يسَع: أبقِ ما كان
      measure(chosen.level);              // أعِدْ تطبيقَ الفائز
    }

    var cx = W / 2, cy = H / 2;
    panel._orbit = { cx: cx, cy: cy, W: W, H: H, A: A, B: B,
                     th: chosen.th.slice(), r: chosen.r.slice(),
                     baseTh: chosen.th.slice(), baseR: chosen.r.slice(),
                     pos: chosen.pos.map(function (p) { return p.slice(); }),
                     ws: chosen.ws, hs: chosen.hs };

    t.svg.setAttribute('width', W);
    t.svg.setAttribute('height', H);
    t.svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    t.spine.setAttribute('d', '');       // لا مسارَ يربطُ الكواكبَ بعد اليوم

    cards.forEach(function (card, k) {
      // RTL: الكوكبُ الأوّلُ عند الساعة ٣ ثمّ عكسَ عقارب الساعة
      gsap.set(card, { xPercent: -50, yPercent: -50,
                       x: cx + chosen.pos[k][0], y: cy + chosen.pos[k][1] });
    });
    drawWires(panel);

    /* المواضعُ أعلاه هي المواضعُ الأولى، وقد مُحيَ بها انزياحُ الكواكب عن
       الشبكة المفتوحة. تُستعاد الحالةُ كما كانت، بلا حركةٍ ولا تفتُّح. */
    var cur = sel.get(panel);
    if (cur) openWeb(panel, cur, false);
  }

  /* الأسلاكُ وحدَها — رخيصةٌ وتُستدعى كلّما تغيّر ارتفاعُ النواة.
     فصلُها ضروريّ: النواةُ تعلو حين يُفتَح موضوعٌ وتنخفض حين يُغلَق،
     ولولا هذا بقيت النقاطُ عالقةً على حافّةِ الحجم القديم. */
  function drawWires(panel) {
    var t = trees.get(panel), o = panel._orbit;
    if (!t || !o) return;
    var hub = panel.querySelector('.hub');
    var hw = hub.offsetWidth / 2, hh = hub.offsetHeight / 2;
    if (!hw || !hh) return;
    t.cards.forEach(function (card, k) {
      var ang = o.th[k];
      var px = o.cx + o.pos[k][0], py = o.cy + o.pos[k][1];
      // مَخرجُ السلك: تقاطعُ الشعاع مع مستطيل النواة
      var ca = Math.cos(ang), sa = -Math.sin(ang);
      var tt = rayOut(ca, sa, hw + 5, hh + 5);
      var sx = o.cx + tt * ca, sy = o.cy + tt * sa;
      t.wires[k].setAttribute('d', 'M' + sx + ',' + sy + 'L' + px + ',' + py);
      t.nodes[k].setAttribute('cx', sx);
      t.nodes[k].setAttribute('cy', sy);
    });
  }

  /* ═══════════ الكاميرا ═══════════
     ‏.stage يحمل transform: translate(tx,ty) scale(k) بمبدأ 0 0،
     فنقطةُ العالَم (x,y) تقع على الشاشة عند (k·x + tx, k·y + ty). */
  var CAM_MIN = 0.5, CAM_MAX = 1.45, CAM_PAD = 90;

  function applyCam(panel, k, tx, ty, animate) {
    var stage = panel.querySelector('.stage');
    if (!stage) return;
    gsap.killTweensOf(stage);   // وإلّا نازعتِ الحركةُ الجاريةُ يدَ الساحب
    panel._cam = { k: k, tx: tx, ty: ty };
    var to = { x: tx, y: ty, scaleX: k, scaleY: k, transformOrigin: '0 0' };
    if (animate) gsap.to(stage, Object.assign({
      duration: .62, ease: 'power2.inOut',
      onUpdate: function () { updateOrbs(panel); },
      onComplete: function () { updateOrbs(panel); }
    }, to));
    else { gsap.set(stage, to); updateOrbs(panel); }
  }

  function camHome(panel, animate) { applyCam(panel, 1, 0, 0, animate); }

  /* القراءةُ من الـ transform الجاري لا من panel._cam: الأخيرُ يحمل
     الوجهةَ لا الموضع، فيسبق الحركةَ فتقفز الأجرامُ قبل الكاميرا. */
  function camNow(panel) {
    var stage = panel.querySelector('.stage');
    if (!stage) return { k: 1, tx: 0, ty: 0 };
    return { k: +gsap.getProperty(stage, 'scaleX') || 1,
             tx: +gsap.getProperty(stage, 'x') || 0,
             ty: +gsap.getProperty(stage, 'y') || 0 };
  }

  /* ═══════════ جُرْما الكوكبين المجاورين ═══════════
     زرّان خارجَ .stage — أي في فضاء الشاشة — يحملان رقمَ الموضوع
     المجاور وعنوانَه. يتبعان كوكبَيهما ما داما داخل الإطار، فإن خرجا
     انحصرا عند الحافّة فبقيا في المتناول مهما اقتربت الكاميرا. */
  var ORB_PAD = 8, ORB_STEP = 18, ORB_KEEP = 70;

  function orbFill(orb, card) {
    var num = card.querySelector('.chead .num'), h3 = card.querySelector('.chead h3');
    orb.querySelector('.onum').textContent = num ? num.textContent : '';
    var title = h3 ? h3.textContent.trim() : '';
    orb.querySelector('.otitle').textContent = title;
    orb.setAttribute('title', title);
    orb.setAttribute('aria-label', 'الموضوع ' + (num ? num.textContent : '') + ' — ' + title);
    if (orb._card !== card) orb._x = null;   // لا يُورَّثُ موضعُ جارٍ إلى جار
    orb._card = card;
  }

  function updateOrbs(panel) {
    var prev = panel.querySelector('.orb.prev'), next = panel.querySelector('.orb.next');
    if (!prev || !next) return;
    var t = trees.get(panel), cur = sel.get(panel);
    if (!t || !cur || !isOrbit() || !t.cards.length) {
      prev.classList.remove('on'); next.classList.remove('on');
      prev._card = next._card = null;
      prev._x = next._x = null;
      return;
    }
    var n = t.cards.length, i = t.cards.indexOf(cur);
    if (n < 2 || i < 0) { prev.classList.remove('on'); next.classList.remove('on'); return; }
    orbFill(prev, t.cards[(i - 1 + n) % n]);
    orbFill(next, t.cards[(i + 1) % n]);
    prev.classList.add('on'); next.classList.add('on');

    var wrap = panel.querySelector('.treewrap');
    var W = wrap.clientWidth, H = wrap.clientHeight, cam = camNow(panel);

    /* العوائق: عُقَدُ الشبكةِ والبطاقةُ المفتوحة، محسوبةً من إحداثيات
       العالَم المحفوظة — فلا قياسَ من الصفحة في كلِّ إطار. */
    var obs = (panel._webRects || []).map(function (r) {
      var hw = r.w / 2, hh = r.h / 2;
      return { l: cam.k * (r.x - hw) + cam.tx, r: cam.k * (r.x + hw) + cam.tx,
               t: cam.k * (r.y - hh) + cam.ty, b: cam.k * (r.y + hh) + cam.ty };
    });
    function free(b) {
      for (var q = 0; q < obs.length; q++) {
        var o = obs[q];
        if (!(b.r <= o.l || o.r <= b.l || b.b <= o.t || o.b <= b.t)) return false;
      }
      return true;
    }

    /* الجرمُ لا يحطُّ إلّا على حافّةِ الإطار. كان له مسلكٌ أوّلُ يلتصق فيه
       بكوكبه ما دام موضعُه «خاليًا» — وهو مسلكُ الحجب: يُحسَب مرّةً قبل أن
       تُبنى الشبكةُ فتكون العوائقُ خاليةً فيُختار دائمًا، ثمّ تُثبِّته حِيلةُ
       ‏ORB_KEEP. ولمّا كانت الأجرامُ لا تظهر إلّا وموضوعٌ مفتوحٌ، فالحافّةُ
       هي موضعُها الصحيحُ دائمًا. والانزلاقُ رأسيٌّ وأفقيٌّ معًا: على شاشةٍ
       قصيرةٍ (لوحٌ عرضُه أكبرُ من طوله) تملأ الشبكةُ العمودَ كلَّه، فلا
       تُوجَدُ فُرجةٌ إلّا بمغادرة ذلك العمود. */
    [prev, next].forEach(function (o) {
      var c = o._card;
      var wx = +gsap.getProperty(c, 'x') || 0, wy = +gsap.getProperty(c, 'y') || 0;
      var hw = o.offsetWidth / 2 + ORB_PAD, hh = o.offsetHeight / 2 + ORB_PAD;
      var xlo = hw, xhi = Math.max(hw, W - hw);
      var ylo = hh, yhi = Math.max(hh, H - hh);
      var ix = clamp(cam.k * wx + cam.tx, xlo, xhi);
      var iy = clamp(cam.k * wy + cam.ty, ylo, yhi);

      /* لا يحطُّ الجرمُ إلّا على أشرطةٍ أربعةٍ عند الحواف، فعائقٌ لا يمسُّ
         واحدًا منها لا يمكن أن يلامسَ موضعًا مرشَّحًا. تصفيةٌ واحدةٌ تسبق
         المسحَ فتُغني عن مقارنته مئاتِ المرّات — والنتيجةُ هي هي بالضبط.
         بغيرها كانت أسلاكُ الشبكة، وقد صارت عوائقَ، تُثقِل كلَّ إطار. */
      var near = [], qf;
      for (qf = 0; qf < obs.length; qf++) {
        var gf = obs[qf];
        if ((gf.b <= ylo - hh || gf.t >= ylo + hh) &&
            (gf.b <= yhi - hh || gf.t >= yhi + hh) &&
            (gf.r <= xlo - hw || gf.l >= xlo + hw) &&
            (gf.r <= xhi - hw || gf.l >= xhi + hw)) continue;
        near.push(gf);
      }

      function overlap(x, y) {
        var l = x - hw, r = x + hw, t = y - hh, b = y + hh, sum = 0;
        for (var q = 0; q < near.length; q++) {
          var g = near[q];
          var dw = Math.min(r, g.r) - Math.max(l, g.l);
          if (dw <= 0) continue;
          var dh = Math.min(b, g.b) - Math.max(t, g.t);
          if (dh > 0) sum += dw * dh;
        }
        return sum;
      }

      /* تحيُّزٌ للموضع السابق كي لا يتنطَّطَ الجرمُ بين فُرجتين والكاميرا تتحرّك */
      var best = o._x != null
        ? { x: o._x, y: o._y, ov: overlap(o._x, o._y), d: dist(o._x, o._y, ix, iy) - ORB_KEEP }
        : null;
      var put = function (x, y) {
        var ov = overlap(x, y), d = dist(x, y, ix, iy);
        if (!best || ov < best.ov - 1 || (ov <= best.ov + 1 && d < best.d))
          best = { x: x, y: y, ov: ov, d: d };
      };
      var v;
      for (v = xlo; v <= xhi; v += ORB_STEP) { put(v, ylo); put(v, yhi); }
      for (v = ylo; v <= yhi; v += ORB_STEP) { put(xlo, v); put(xhi, v); }
      put(ix, ylo); put(ix, yhi); put(xlo, iy); put(xhi, iy);
      o._x = best.x; o._y = best.y;
      o.style.left = best.x + 'px'; o.style.top = best.y + 'px';
      obs.push({ l: best.x - hw, r: best.x + hw,
                 t: best.y - hh, b: best.y + hh });   // الثاني يتحاشى الأوّل
    });
  }

  function dist(x1, y1, x2, y2) { return Math.hypot(x1 - x2, y1 - y2); }

  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

  /* النافذةُ التي ستُرى: مركزُها وسطُ الشبكة، وسَعتُها الإطارُ مقسومًا
     على التقريب. تُحسَب قبل تحريك الكواكب، فتُدفَع خارجَها بالحساب لا بالظنّ. */
  function camPlan(panel, box) {
    var wrap = panel.querySelector('.treewrap');
    var W = wrap.clientWidth, H = wrap.clientHeight;
    var bw = Math.max(1, box.x2 - box.x1), bh = Math.max(1, box.y2 - box.y1);
    /* لا سقفَ عند ١ بعد اليوم: موضوعٌ قليلُ المحتوى كان يترك الشاشةَ
       مليئةً بكواكبَ أخرى لأنّ الكاميرا تأبى أن تقترب. */
    var k = clamp(Math.min((W - CAM_PAD) / bw, (H - CAM_PAD) / bh), CAM_MIN, CAM_MAX);
    var bx = (box.x1 + box.x2) / 2, by = (box.y1 + box.y2) / 2;
    return { k: k, tx: W / 2 - k * bx, ty: H / 2 - k * by,
             cx: bx, cy: by, hw: W / (2 * k), hh: H / (2 * k) };
  }

  function camFocus(panel, box, animate) {
    var c = camPlan(panel, box);
    applyCam(panel, c.k, c.tx, c.ty, animate);
  }

  /* ═══════════ شبكةُ الموضوع ═══════════
     العُقَدُ نُسَخٌ من .k و .chip؛ الأصلُ لا يبرح بطاقتَه أبدًا. فلا حاجةَ
     إلى إرجاعٍ قبل الطباعة ولا قبل تبديل العرض — لأنّ شيئًا لم يذهب. */
  var W_D1 = 170, W_COLGAP = 80, W_VGAP = 8, W_BGAP = 26;
  var W_SEG = 6, W_THIN = 4;   // تقطيعُ السلك إلى عوائقَ رفيعة

  function clearWeb(panel) {
    var web = panel.querySelector('.web');
    if (web) web.textContent = '';
    (panel._webWires || []).forEach(function (el) {
      if (el.parentNode) el.parentNode.removeChild(el);
    });
    panel._webWires = [];
    panel._webBox = null;
    panel._webRects = null;
  }

  function place(el, x, y) { el.style.left = x + 'px'; el.style.top = y + 'px'; }

  function buildWeb(panel, card, animate) {
    var web = panel.querySelector('.web'), o = panel._orbit, t = trees.get(panel);
    if (!web || !o) return null;
    var i = t.cards.indexOf(card);
    var px = o.cx + o.pos[i][0], py = o.cy + o.pos[i][1];
    var dir = px >= o.cx ? 1 : -1;          // تنمو مبتعدةً عن النواة

    var rows = [].slice.call(card.querySelectorAll('.rows .r'));
    var frag = D.createDocumentFragment(), groups = [];
    rows.forEach(function (r) {
      var kEl = r.querySelector('.k');
      var b = D.createElement('div');
      b.className = 'wnode branch';
      b.innerHTML = kEl ? kEl.innerHTML : '';
      frag.appendChild(b);
      var leaves = [].slice.call(r.querySelectorAll('.chip')).map(function (c) {
        var l = D.createElement('div');
        l.className = 'wnode leaf';
        l.innerHTML = c.innerHTML;
        frag.appendChild(l);
        return l;
      });
      groups.push({ b: b, leaves: leaves });
    });
    web.appendChild(frag);

    // قياسٌ واحدٌ ثمّ تثبيتٌ واحد — لا حساب في كلِّ إطار
    groups.forEach(function (g) {
      g.bw = g.b.offsetWidth; g.bh = g.b.offsetHeight;
      g.lh = g.leaves.map(function (l) { return l.offsetHeight; });
      g.lw = g.leaves.map(function (l) { return l.offsetWidth; });
      g.stack = g.lh.reduce(function (a, h) { return a + h + W_VGAP; }, -W_VGAP);
      if (g.stack < 0) g.stack = 0;
      g.h = Math.max(g.bh, g.stack);
    });
    var total = groups.reduce(function (a, g) { return a + g.h + W_BGAP; }, -W_BGAP);

    var box = { x1: px, y1: py, x2: px, y2: py };
    /* تُحفَظُ الصناديقُ بإحداثيات العالَم لا الشاشة، فتصلح لكلِّ وضعٍ
       للكاميرا بضربٍ واحدٍ — والجُرمان يتحاشيانها كي لا يحجبا بندًا. */
    var rects = [{ x: px, y: py, w: card.offsetWidth, h: card.offsetHeight }];
    function grow(x, y, w, h) {
      box.x1 = Math.min(box.x1, x - w / 2); box.x2 = Math.max(box.x2, x + w / 2);
      box.y1 = Math.min(box.y1, y - h / 2); box.y2 = Math.max(box.y2, y + h / 2);
      rects.push({ x: x, y: y, w: w, h: h });
    }
    /* السلكُ خيطٌ لا صندوق: صندوقُه الكاملُ يبتلع الفراغَ بين العمودين كلَّه،
       فيُقطَّع قِطَعًا صغيرةً بعرض الخيط. والجرمُ يوازن بالمساحة، فالقطعةُ
       الرفيعةُ تزنُ قليلًا بحقٍّ: تجنُّبُ بندٍ أَولى من تجنُّبِ خيط.
       أطرافُ السلك محسوبةٌ في box سلفًا، فلا يُمَدُّ هنا. */
    function growWire(x1, y1, x2, y2) {
      var mx = (x1 + x2) / 2, ax = x1, ay = y1, q, u, v2, bx, by;
      for (q = 1; q <= W_SEG; q++) {
        v2 = q / W_SEG; u = 1 - v2;
        bx = u * u * u * x1 + 3 * u * u * v2 * mx + 3 * u * v2 * v2 * mx + v2 * v2 * v2 * x2;
        by = u * u * u * y1 + 3 * u * u * v2 * y1 + 3 * u * v2 * v2 * y2 + v2 * v2 * v2 * y2;
        rects.push({ x: (ax + bx) / 2, y: (ay + by) / 2,
                     w: Math.abs(bx - ax) + W_THIN, h: Math.abs(by - ay) + W_THIN });
        ax = bx; ay = by;
      }
    }
    /* العُقَدُ تُصَفُّ بحافّتها الداخلية لا بمركزها، وإلّا تعرّج العمودُ
       كلّما اختلفت عروضُ النصوص. */
    var maxBW = 0;
    groups.forEach(function (g) { if (g.bw > maxBW) maxBW = g.bw; });
    var xbEdge = px + dir * W_D1;                    // حافّةُ عمود الفروع
    var xlEdge = xbEdge + dir * (maxBW + W_COLGAP);  // حافّةُ عمود البنود
    var y = py - total / 2, wires = [];

    groups.forEach(function (g) {
      var yb = y + g.h / 2, xb = xbEdge + dir * g.bw / 2;
      place(g.b, xb, yb); grow(xb, yb, g.bw, g.bh);
      wires.push(curve(px, py, xbEdge, yb, 'wire2'));
      growWire(px, py, xbEdge, yb);
      var ly = y + (g.h - g.stack) / 2;
      g.leaves.forEach(function (l, j) {
        var yl = ly + g.lh[j] / 2, xl = xlEdge + dir * g.lw[j] / 2;
        place(l, xl, yl); grow(xl, yl, g.lw[j], g.lh[j]);
        wires.push(curve(xbEdge + dir * maxBW, yb, xlEdge, yl, 'wire3'));
        growWire(xbEdge + dir * maxBW, yb, xlEdge, yl);
        ly += g.lh[j] + W_VGAP;
      });
      y += g.h + W_BGAP;
    });

    wires.forEach(function (w) { t.svg.appendChild(w); });
    panel._webWires = wires;
    panel._webBox = box;
    panel._webRects = rects;

    /* الاستعادةُ بعد إعادة التخطيط تبني الشبكةَ نفسَها من جديد، فلو تفتّحت
       كلَّ مرّةٍ لارتجفت الخريطةُ مع كلِّ تغيُّرِ ارتفاعٍ في اللوح. */
    if (animate) {
      gsap.from(groups.map(function (g) { return g.b; }),
        { opacity: 0, scale: .9, duration: .32, stagger: .04, ease: 'power2.out' });
      gsap.from(web.querySelectorAll('.leaf'),
        { opacity: 0, x: -dir * 18, duration: .32, stagger: .012, ease: 'power2.out' });
      gsap.from(wires, { drawSVG: '0%', duration: .45, stagger: .012, ease: 'power2.out',
        onComplete: function () { gsap.set(wires, { clearProps: 'strokeDasharray,strokeDashoffset' }); } });
    }
    return box;
  }

  function curve(x1, y1, x2, y2, cls) {
    var mx = (x1 + x2) / 2;
    var pth = mk('path', { 'class': cls });
    pth.setAttribute('d', 'M' + x1 + ',' + y1 + 'C' + mx + ',' + y1 + ' ' + mx + ',' + y2 +
                          ' ' + x2 + ',' + y2);
    return pth;
  }

  /* ═══ الكواكبُ تُخلي الميدان ═══
     أوّلًا يتّسع نصيبُ المفتوح من الدائرة فينزاح الباقون زاويًّا، ثمّ يزيد
     كلٌّ منهم بُعدَه حتى يخرجَ من نافذة الكاميرا. البعدُ حرٌّ الآن، فالخروجُ
     ممكنٌ دائمًا — وهذا ما كان يتعذّر حين كان الجميعُ مربوطين بمسارٍ واحد. */
  var OPEN_SHARE = 0.38;   // نصيبُ الكوكب المفتوح من الدائرة
  var OUT_PAD = 30, OUT_MAX = 3000;

  function placePlanets(panel, openIdx, animate, win) {
    var o = panel._orbit, t = trees.get(panel);
    if (!o || !o.th) return;
    var n = o.th.length, i;

    if (openIdx < 0) {                       // العودةُ إلى المواضع الأصلية
      for (i = 0; i < n; i++) { o.th[i] = o.baseTh[i]; o.r[i] = o.baseR[i]; }
    } else {
      var w = [], sum = 0;
      for (i = 0; i < n; i++) { w.push(o.ws[i] + GAP); sum += w[i]; }
      var rest = sum - w[openIdx];
      w[openIdx] = Math.max(w[openIdx], OPEN_SHARE / (1 - OPEN_SHARE) * rest);
      sum = 0; for (i = 0; i < n; i++) sum += w[i];
      var sc = 2 * Math.PI / sum, acc = 0;
      for (i = 0; i < n; i++) {
        var share = w[i] * sc;
        o.th[i] = o.baseTh[0] + acc + share / 2 - w[0] * sc / 2;
        acc += share;
        o.r[i] = o.baseR[i];
      }
      if (win) {
        /* النافذةُ محسوبةٌ حولَ وسطِ الشبكة لا حولَ النواة، فيُنقَلُ مركزُها
           إلى إحداثيات النواة قبل مدِّ الشعاع. */
        var dx = win.cx - o.cx, dy = win.cy - o.cy;
        for (i = 0; i < n; i++) {
          if (i === openIdx) continue;
          var need = outOf(Math.cos(o.th[i]), -Math.sin(o.th[i]),
                           dx, dy, win.hw + o.ws[i] / 2 + OUT_PAD,
                                   win.hh + o.hs[i] / 2 + OUT_PAD);
          if (need > o.r[i]) o.r[i] = Math.min(need, OUT_MAX);
        }
      }
    }

    for (i = 0; i < n; i++) {
      o.pos[i][0] = o.r[i] * Math.cos(o.th[i]);
      o.pos[i][1] = -o.r[i] * Math.sin(o.th[i]);
      var to = { x: o.cx + o.pos[i][0], y: o.cy + o.pos[i][1] };
      if (animate) gsap.to(t.cards[i], Object.assign({ duration: .5, ease: 'power2.inOut',
        onUpdate: function () { updateOrbs(panel); } }, to));
      else gsap.set(t.cards[i], to);
    }
    if (animate) gsap.delayedCall(.5, function () { drawWires(panel); updateOrbs(panel); });
    else { drawWires(panel); updateOrbs(panel); }
  }

  /* أصغرُ بُعدٍ r يجعل مركزَ الكارت (r·ca, r·sa) خارجَ مستطيلٍ مركزُه
     (dx,dy) ونصفا قطريه (hw,hh) — وقد وُسِّعا سلفًا بنصفِ الكارت، فيكفي
     أن يخرجَ المركزُ ليخرجَ الكارتُ كلُّه.

     الخروجُ يقع متى بعُد أفقيًّا **أو** رأسيًّا، لا شرطَ اجتماعِهما، فيُؤخَذ
     الأصغرُ من الحلَّين. وهذا ما أخطأه الحسابُ الأوّل: كان يمدُّ الشعاعَ حتى
     حافّة النافذة ثمّ يضيف نصفَ الكارت على استقامته، فيبقى الركنُ داخلًا في
     الاتّجاهات المائلة. */
  function outOf(ca, sa, dx, dy, hw, hh) {
    var rx = ca > 1e-6 ? (dx + hw) / ca : ca < -1e-6 ? (dx - hw) / ca : Infinity;
    var ry = sa > 1e-6 ? (dy + hh) / sa : sa < -1e-6 ? (dy - hh) / sa : Infinity;
    if (rx < 0) rx = Infinity;
    if (ry < 0) ry = Infinity;
    var r = Math.min(rx, ry);
    return r === Infinity ? 0 : r;
  }

  function paintOrbitState(panel) {
    var t = trees.get(panel);
    if (!t) return;
    var cur = sel.get(panel);
    var wrap = panel.querySelector('.treewrap');
    if (wrap) wrap.classList.toggle('webopen', !!cur);
    t.cards.forEach(function (c, i) {
      var on = c === cur;
      c.classList.toggle('sel', on);
      c.classList.toggle('dim', !!cur && !on);
      t.wires[i].classList.toggle('on', on);
      t.nodes[i].classList.toggle('on', on);
    });
  }

  function closeWeb(panel, hard) {
    if (!sel.get(panel)) {
      /* لا شيءَ مفتوحٌ: يبقى معنى Esc والنقرِ على الخلفية «أعِدِ النظر
         إلى موضعه» — وهو ما يحتاجه من جرَّ اللوحةَ أو قرَّبها بيده. */
      camHome(panel, !hard);
      return;
    }
    var cur = sel.get(panel);
    cur.querySelector('.chead').setAttribute('aria-expanded', 'false');
    sel['delete'](panel);
    clearWeb(panel);
    paintOrbitState(panel);
    updateOrbs(panel);
    placePlanets(panel, -1, !hard);
    camHome(panel, !hard);
  }

  function stepPlanet(panel, dir) {
    var t = trees.get(panel);
    if (!t || !t.cards.length) return;
    var cards = t.cards, cur = sel.get(panel);
    var i = cur ? cards.indexOf(cur) : (dir > 0 ? -1 : 0);
    var n = cards.length;
    selectPlanet(cards[((i + dir) % n + n) % n]);   // يدور دورةً كاملةً في الاتجاهين
  }

  /* فتحُ الشبكة، مفصولًا عن النقر: يُستدعى مرّةً باليد عند الاختيار، ومرّةً
     صامتًا حين يُعاد تخطيطُ المدار وكوكبٌ مفتوحٌ — فلا تعود الكواكبُ إلى
     مواضعها الأولى فوق البنود. */
  function openWeb(panel, card, animate) {
    var t = trees.get(panel);
    if (!t) return;
    clearWeb(panel);
    sel.set(panel, card);
    t.cards.forEach(function (c) {
      c.querySelector('.chead').setAttribute('aria-expanded', String(c === card));
    });
    paintOrbitState(panel);
    var idx = t.cards.indexOf(card);
    placePlanets(panel, idx, false);          // زاويًّا أوّلًا كي تُبنى الشبكةُ في مكانها
    var box = buildWeb(panel, card, animate);
    /* ‏placePlanets آنفًا نادى updateOrbs و_webRects بعدُ خاليةٌ، فحُسِب موضعُ
       الجرمِ أعمى عن العوائق ثمّ ثبّتته حِيلةُ ORB_KEEP. تُمحى الذاكرةُ هنا
       كي يبدأ الحسابُ الأخيرُ من صفحةٍ بيضاء. */
    var pv = panel.querySelector('.orb.prev'), nx = panel.querySelector('.orb.next');
    if (pv) pv._x = null;
    if (nx) nx._x = null;
    if (box) {
      var plan = camPlan(panel, box);
      placePlanets(panel, idx, animate, plan);   // ثمّ ادفعِ البقيةَ خارجَ نافذتها
      applyCam(panel, plan.k, plan.tx, plan.ty, animate);
    }
    updateOrbs(panel);
  }

  function selectPlanet(card) {
    var panel = card.closest('.panel');
    if (sel.get(panel) === card) { closeWeb(panel); return; }
    openWeb(panel, card, true);
  }

  /* الموزِّع: أيُّ تخطيطٍ يعمل، مع تنظيفِ أثرِ الآخر عند الانتقال */
  function layout(panel) {
    var mode = isOrbit() ? 'orbit' : 'tree';
    var t = trees.get(panel);
    if (t && panel._mode !== mode) {
      gsap.set(t.cards, { clearProps: 'x,y,xPercent,yPercent' });
      if (mode === 'tree') { closeWeb(panel); camHome(panel, false); }
      panel._mode = mode;
      panel._orbit = null;        // مُحِيَتِ التحويلات: لا مَخرجَ مختصرًا بعدها
    }
    if (mode === 'orbit') { layoutOrbit(panel); updateOrbs(panel); }
    else layoutTree(panel);
  }

  function setView(v) {
    D.documentElement.setAttribute('data-view', v);
    try { localStorage.setItem('mm-view', v); } catch (e) {}
    panels.forEach(function (p) {
      closeWeb(p); camHome(p, false);
      p.querySelectorAll('.card.open').forEach(function (c) { toggle(c, false); });
    });
    var b = D.querySelector('.js-view');
    if (b) {
      b.querySelector('.ic').textContent = v === 'orbit' ? '⊙' : '⊞';
      b.querySelector('.tx').textContent = v === 'orbit' ? 'مدار' : 'شجرة';
    }
    var cur = current();
    if (cur) { cur._mode = null; layout(cur); }
  }

  function paintState(panel) {
    var t = trees.get(panel);
    if (!t) return;
    t.cards.forEach(function (card, i) {
      var on = card.classList.contains('open');
      t.wires[i].classList.toggle('on', on);
      t.nodes[i].classList.toggle('on', on);
    });
  }

  /* ═══ فتحُ البطاقة وإغلاقُها ═══ */
  function toggle(card, want) {
    var isOpen = card.classList.contains('open');
    var open = (want === undefined) ? !isOpen : !!want;
    if (open === isOpen) return;

    var panel = card.closest('.panel');
    var head  = card.querySelector('.chead');
    var rows  = card.querySelector('.rows');
    var chev  = card.querySelector('.chev');
    var rs    = [].slice.call(rows.querySelectorAll('.r'));

    var prev = tls.get(card);
    if (prev) { prev.kill(); tickOff(); }

    card.classList.toggle('open', open);
    head.setAttribute('aria-expanded', String(open));
    paintState(panel);

    var tl = gsap.timeline({
      onStart: tickOn,
      onComplete: function () { tickOff(); tls['delete'](card); layout(panel); }
    });
    tls.set(card, tl);

    if (open) {
      tl.to(rows, { height: 'auto', duration: .45, ease: 'power2.inOut' })
        .fromTo(rs, { opacity: 0, y: -8 },
                    { opacity: 1, y: 0, duration: .3, stagger: .04, ease: 'power2.out' }, '<0.08')
        .to(chev, { rotation: 180, duration: .35, ease: 'power2.out' }, '<');
    } else {
      tl.to(rs, { opacity: 0, y: -6, duration: .2, stagger: { each: .02, from: 'end' } })
        .to(rows, { height: 0, duration: .4, ease: 'power2.inOut' }, '<0.05')
        .to(chev, { rotation: 0, duration: .35, ease: 'power2.out' }, '<');
    }
  }

  /* ═══ الأقسام ═══ */
  function moveInd(tab) {
    if (!ind) return;
    ind.style.background = getComputedStyle(tab).color;
    gsap.to(ind, { x: tab.offsetLeft, width: tab.offsetWidth, duration: .35, ease: 'power3.out' });
  }

  function activate(i) {
    tabs.forEach(function (t, j) {
      t.setAttribute('aria-selected', String(j === i));
      t.tabIndex = j === i ? 0 : -1;
    });
    // كلُّ قسمٍ يُستأنَف من منظره الأصلي: لولا هذا لعُدنا إلى تبويبٍ
    // كاميراتُه ما تزال مقرَّبةً على شبكةٍ قديمة، فلا يُنقَر كوكبٌ آخر
    panels.forEach(function (q) { if (trees.get(q)) closeWeb(q, true); });
    // data-tab يقود الإظهارَ في CSS، و hidden لأجل قارئات الشاشة
    D.documentElement.setAttribute('data-tab', panels[i].id);
    panels.forEach(function (p, j) { p.hidden = j !== i; });

    var panel = panels[i];
    moveInd(tabs[i]);
    layout(panel);

    var t = trees.get(panel);
    if (!drawn.has(panel) && t) {
      drawn.add(panel);
      var lines = [t.spine].concat(t.wires);
      gsap.from(t.cards, { opacity: 0, y: 16, duration: .45, stagger: .04, ease: 'power2.out' });
      gsap.from(lines, {
        drawSVG: '0%', duration: .6, stagger: .05, ease: 'power2.out',
        onComplete: function () {
          // وإلّا بقيَت قيمُ التقطيع قديمةً فانقطع السلكُ عند تغيُّر طولِه
          gsap.set(lines, { clearProps: 'strokeDasharray,strokeDashoffset' });
        }
      });
    } else {
      gsap.fromTo(panel, { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: .3, ease: 'power2.out' });
    }
  }

  function route() {
    var id = location.hash.replace('#', '');
    var i = 0;
    for (var j = 0; j < panels.length; j++) if (panels[j].id === id) { i = j; break; }
    activate(i);
  }

  /* ═══ السِّمة ═══ */
  function setTheme(mode) {
    D.documentElement.setAttribute('data-theme', mode);
    try { localStorage.setItem('mm-theme', mode); } catch (e) {}
    var b = D.querySelector('.js-theme');
    if (b) {
      b.querySelector('.ic').textContent = mode === 'dark' ? '☀' : '☾';
      b.setAttribute('aria-label', mode === 'dark' ? 'الوضع النهاري' : 'الوضع الليلي');
    }
  }

  /* ═══ التركيب ═══ */
  panels.forEach(buildTree);

  D.querySelectorAll('.chead').forEach(function (h) {
    var t = h.querySelector('h3');
    if (t) h.setAttribute('title', t.textContent.trim());   // يظهر حين لا يبقى إلّا الرقم
    h.addEventListener('click', function () {
      var card = h.closest('.card');
      if (isOrbit()) selectPlanet(card); else toggle(card);
    });
  });

  /* إغلاقُ الشبكة: النقرُ على الخلفية الفارغة، أو Escape.
     ولا جرَّ ولا تقريبَ باليد: التقريبُ يذهب إلى الكوكب المنقور وحدَه.
     كان الجرُّ شبكةَ أمانٍ لما لا يسَعُ الإطار، ثمّ تبيّن بالقياس أنّ أكبرَ
     شبكةٍ تسَعُه عند ٠٫٥٦ — فلم يُحرَسْ شيءٌ، وبقي أنّه يخطف تمريرَ الصفحة
     تحت الإصبع على اللوح. */
  D.querySelectorAll('.treewrap').forEach(function (w) {
    w.addEventListener('click', function (e) {
      if (!isOrbit()) return;
      if (e.target.closest('.card, .wnode, .orb, .hub')) return;
      closeWeb(w.closest('.panel'));
    });
  });

  addEventListener('keydown', function (e) {
    if (e.key !== 'Escape' || !isOrbit()) return;
    if (D.querySelector('dialog.about[open]')) return;
    var p = current(); if (p) closeWeb(p);
  });

  /* النقرُ على جرمٍ ينقل إلى موضوعه. و selectPlanet نفسُه يمسح الشبكةَ
     القائمةَ قبل أن يبني الجديدة، فإغلاقُ السابق يقع بلا سطرٍ زائد. */
  D.querySelectorAll('.orb').forEach(function (b) {
    b.addEventListener('click', function (e) {
      e.stopPropagation();
      if (b._card) selectPlanet(b._card);
    });
  });

  /* في RTL: اليسارُ تقدُّمٌ واليمينُ رجوع.
     ولا نخطف السهمين من شريط الأقسام — لهما هناك معنًى قائم — ولا من اللوحة. */
  addEventListener('keydown', function (e) {
    if (!isOrbit()) return;
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    if (D.activeElement && D.activeElement.closest('.tabs')) return;
    if (D.querySelector('dialog.about[open]')) return;
    var panel = current();
    if (!panel) return;
    e.preventDefault();
    stepPlanet(panel, e.key === 'ArrowLeft' ? 1 : -1);
  });

  /* النواةُ تعلو حين يُفتَح موضوعٌ وتنخفض حين يُغلَق، فتتحرّك حوافُّها.
     نراقبها ونعيد رسمَ الأسلاك وحدَها — لا التخطيطَ كلَّه، فالتخطيطُ
     يُغيّر حجمَ النواة فيوقظ المراقبَ من جديدٍ بلا نهاية. */


  var viewBtn = D.querySelector('.js-view');
  if (viewBtn) {
    viewBtn.addEventListener('click', function () {
      setView(D.documentElement.getAttribute('data-view') === 'orbit' ? 'tree' : 'orbit');
    });
    var v0 = D.documentElement.getAttribute('data-view') || 'tree';
    viewBtn.querySelector('.ic').textContent = v0 === 'orbit' ? '⊙' : '⊞';
    viewBtn.querySelector('.tx').textContent = v0 === 'orbit' ? 'مدار' : 'شجرة';
  }

  tabs.forEach(function (t, i) {
    t.addEventListener('click', function () {
      if (location.hash === '#' + panels[i].id) activate(i);
      else location.hash = panels[i].id;
    });
  });

  if (tablist) {
    tablist.addEventListener('keydown', function (e) {
      var i = tabs.indexOf(D.activeElement);
      if (i < 0) return;
      var rtl = getComputedStyle(tablist).direction === 'rtl' ? -1 : 1;
      var n = null;
      if (e.key === 'ArrowRight') n = i + rtl;
      else if (e.key === 'ArrowLeft') n = i - rtl;
      else if (e.key === 'Home') n = 0;
      else if (e.key === 'End') n = tabs.length - 1;
      if (n === null) return;
      e.preventDefault();
      n = (n + tabs.length) % tabs.length;
      tabs[n].focus();
      tabs[n].click();
    });
  }

  var allBtn = D.querySelector('.js-all');
  if (allBtn) {
    allBtn.addEventListener('click', function () {
      var panel = current();
      if (!panel || isOrbit()) return;   // في المدار تُفتَح واحدةٌ لا الكلّ
      var cards = [].slice.call(panel.querySelectorAll('.card'));
      var opening = cards.some(function (c) { return !c.classList.contains('open'); });
      cards.forEach(function (c, i) {
        gsap.delayedCall(i * .05, function () { toggle(c, opening); });
      });
      allBtn.querySelector('.tx').textContent = opening ? 'اطوِ الكلَّ' : 'افتحِ الكلَّ';
      allBtn.querySelector('.ic').textContent = opening ? '⊖' : '⊕';
    });
  }


  /* ═══ لوحةُ «؟» ═══ */
  var dlg = D.querySelector('dialog.about');
  var aboutBtn = D.querySelector('.js-about');
  if (dlg && aboutBtn) {
    aboutBtn.addEventListener('click', function () {
      if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', '');
    });
    var closeBtn = dlg.querySelector('.js-close');
    if (closeBtn) closeBtn.addEventListener('click', function () { dlg.close(); });
    // النقرُ على الخلفية خارجَ اللوحة يُغلِقها
    dlg.addEventListener('click', function (e) {
      if (e.target !== dlg) return;
      var r = dlg.getBoundingClientRect();
      if (e.clientX < r.left || e.clientX > r.right ||
          e.clientY < r.top  || e.clientY > r.bottom) dlg.close();
    });
  }

  var themeBtn = D.querySelector('.js-theme');
  if (themeBtn) {
    themeBtn.addEventListener('click', function () {
      var now = D.documentElement.getAttribute('data-theme');
      if (!now) now = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
      setTheme(now === 'dark' ? 'light' : 'dark');
    });
    setTheme(D.documentElement.getAttribute('data-theme') ||
             (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));
  }

  if (window.ResizeObserver) {
    panels.forEach(function (p) {
      var g = p.querySelector('.grid');
      if (g) new ResizeObserver(function () { layout(p); }).observe(g);
    });
  }
  var wasNarrow = innerWidth < 760;
  /* الرصُّ في إطارٍ واحد: تمريرةُ إصبعٍ على اللوح تُطلِق عشراتِ الأحداث */
  var rzRaf = 0;
  addEventListener('resize', function () {
    if (rzRaf) return;
    rzRaf = requestAnimationFrame(function () { rzRaf = 0; onResize(); });
  });
  function onResize() {
    var narrow = innerWidth < 760;
    if (narrow !== wasNarrow) {           // عبَرْنا العتبة: بدِّلِ التخطيطَ كلَّه
      wasNarrow = narrow;
      panels.forEach(function (q) { q._mode = null; });
    }
    var p = current();
    if (p) { layout(p); }
    var cur = tabs.filter(function (t) { return t.getAttribute('aria-selected') === 'true'; })[0];
    if (cur) gsap.set(ind, { x: cur.offsetLeft, width: cur.offsetWidth });
  }

  /* الطباعة: افتحِ كلَّ شيءٍ وامسحِ الأنماطَ السطرية التي خلّفها GSAP */
  function prepPrint() {
    gsap.globalTimeline.clear();
    panels.forEach(closeWeb);   // الشبكةُ نُسَخٌ عابرة؛ الأصلُ في بطاقته سليمٌ دائمًا
    live = 0; gsap.ticker.remove(tick);
    tls.forEach(function (tl) { tl.kill(); });
    tls.clear();
    D.querySelectorAll('.rows, .rows .r, .rows .chip, .chev').forEach(function (el) {
      gsap.set(el, { clearProps: 'all' });
    });
    panels.forEach(function (p) { p.hidden = false; });
  }

  /* مَشْبَكان لا واحد: beforeprint لا يُوثَق به وحدَه — لا يُطلَق في بعض
     مسارات التصدير إلى PDF، فتذهب صفوفُ الكوكب المفتوح من الورق. */
  addEventListener('beforeprint', prepPrint);
  var mqPrint = matchMedia('print');
  if (mqPrint.addEventListener) {
    mqPrint.addEventListener('change', function (e) { if (e.matches) prepPrint(); });
  } else if (mqPrint.addListener) {
    mqPrint.addListener(function (e) { if (e.matches) prepPrint(); });
  }
  addEventListener('afterprint', function () { route(); });

  addEventListener('hashchange', route);
  route();

  // القياسُ الأوّلُ قد يسبق تحميلَ الخطّ، فتتغيّر الارتفاعات بعده
  /* عرضُ العناوين يتغيّر بعد أميري، فيلزم قياسٌ كاملٌ لا مَخرجٌ مختصر */
  function remeasure() { var p = current(); if (p) { p._orbit = null; layout(p); } }
  if (D.fonts && D.fonts.ready) { D.fonts.ready.then(remeasure); }
  addEventListener('load', remeasure);
})();
