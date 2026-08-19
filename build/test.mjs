import { chromium } from 'playwright';
import path from 'node:path';

const URL = 'file://' + path.resolve(process.argv[2] || 'index.html');
let pass = 0, fail = 0;
const ok = (n, c, extra = '') => { c ? pass++ : fail++; console.log(`${c ? ' OK ' : 'FAIL'}  ${n}${extra ? '  — ' + extra : ''}`); };

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
// 47 uji pertama menguji modus pohon; modus bawaan kini orbit, jadi dipaksa
await ctx.addInitScript(() => { try { if (!localStorage.getItem('mm-seeded')) {
  localStorage.setItem('mm-view', 'tree'); localStorage.setItem('mm-seeded', '1'); } } catch (e) {} });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', e => errs.push(String(e)));
page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });

await page.goto(URL);
await page.waitForTimeout(1200);

// 0 — tiada galat
ok('0. tiada galat JS', errs.length === 0, errs.join(' | '));

// 1 — muat awal: hanya judul pokok
const visRows = async () => page.$$eval('.panel:not([hidden]) .r',
  els => els.filter(e => e.getBoundingClientRect().height > 0.5 &&
                         parseFloat(getComputedStyle(e).opacity) > 0.05).length);
const heads = async () => page.$$eval('.panel:not([hidden]) .chead', e => e.length);
ok('1a. tab-1 menampilkan 13 judul', await heads() === 13, `dapat ${await heads()}`);
ok('1b. tab-1 nol baris rincian terlihat', await visRows() === 0, `dapat ${await visRows()}`);

// 2 — buka satu
await page.click('.panel:not([hidden]) .card:nth-of-type(1) .chead');
await page.waitForTimeout(900);
const c1 = '.panel:not([hidden]) .card:nth-of-type(1)';
ok('2a. kartu 1 terbuka', await page.$eval(c1, e => e.classList.contains('open')));
ok('2b. aria-expanded=true', await page.$eval(c1 + ' .chead', e => e.getAttribute('aria-expanded')) === 'true');
ok('2c. rincian kartu 1 terlihat (6 baris)', await visRows() === 6, `dapat ${await visRows()}`);

// 5 — kabel ikut bergeser (diukur sebelum & sesudah membuka kartu di atasnya)
const wireD = i => page.$eval(`.panel:not([hidden]) .wire:nth-of-type(${i})`, e => e.getAttribute('d'));
const before = await wireD(9);

// 3 — buka poin lain TANPA menutup yang pertama  ← syarat utama
await page.click('.panel:not([hidden]) .card:nth-of-type(5) .chead');
await page.waitForTimeout(900);
const openCount = () => page.$$eval('.panel:not([hidden]) .card.open', e => e.length);
ok('3.  buka kartu 5 → kartu 1 TETAP terbuka', await page.$eval(c1, e => e.classList.contains('open')) && await openCount() === 2,
   `kartu terbuka: ${await openCount()}`);

const after = await wireD(9);
ok('5.  kabel ikut bergeser saat kartu membesar', before !== after);

// 4 — tutup kembali
await page.click(c1 + ' .chead');
await page.waitForTimeout(900);
ok('4a. kartu 1 tertutup lagi', !(await page.$eval(c1, e => e.classList.contains('open'))));
ok('4b. kartu 5 tak terganggu', await openCount() === 1, `terbuka: ${await openCount()}`);

// 6 — klik beruntun
for (let i = 0; i < 5; i++) await page.click('.panel:not([hidden]) .card:nth-of-type(3) .chead');
await page.waitForTimeout(1400);
const c3 = '.panel:not([hidden]) .card:nth-of-type(3)';
const c3open = await page.$eval(c3, e => e.classList.contains('open'));
const c3h = await page.$eval(c3 + ' .rows', e => e.getBoundingClientRect().height);
ok('6.  klik 5× beruntun → keadaan konsisten', c3open ? c3h > 30 : c3h < 1, `open=${c3open} tinggi=${c3h.toFixed(1)}`);
if (c3open) { await page.click(c3 + ' .chead'); await page.waitForTimeout(800); }

// 8 — buka semua / tutup semua
await page.click('.js-all'); await page.waitForTimeout(2200);
ok('8a. buka semua → 13 kartu terbuka', await openCount() === 13, `dapat ${await openCount()}`);
ok('8b. semua 53 baris terlihat', await visRows() === 53, `dapat ${await visRows()}`);
await page.click('.js-all'); await page.waitForTimeout(2400);
ok('8c. tutup semua → 0 kartu terbuka', await openCount() === 0, `dapat ${await openCount()}`);

// 7 — tab + hash + tombol Back
await page.click('.panel:not([hidden]) .card:nth-of-type(2) .chead');
await page.waitForTimeout(800);
await page.click('#tab-s2'); await page.waitForTimeout(900);
ok('7a. pindah ke tab 2', await page.$eval('#s2', e => !e.hidden) && await page.$eval('#s1', e => e.hidden));
ok('7b. hash jadi #s2', page.url().endsWith('#s2'));
ok('7c. tab 2 punya 11 judul', await heads() === 11, `dapat ${await heads()}`);
await page.click('#tab-s3'); await page.waitForTimeout(900);
ok('7d. tab 3 punya 6 judul', await heads() === 6, `dapat ${await heads()}`);
await page.click('#tab-s4'); await page.waitForTimeout(900);
ok('7d1. tab 4 punya 4 judul', await heads() === 4, `dapat ${await heads()}`);
ok('7d2. hash jadi #s4', page.url().endsWith('#s4'));
await page.goBack(); await page.waitForTimeout(800);
ok('7d3. Back kembali ke #s3', page.url().endsWith('#s3') && await page.$eval('#s3', e => !e.hidden));
await page.goBack(); await page.waitForTimeout(800);
ok('7e. Back kembali ke #s2', page.url().endsWith('#s2') && await page.$eval('#s2', e => !e.hidden));
await page.goBack(); await page.waitForTimeout(900);
ok('7f. Back lagi → #s1 dan kartu 2 MASIH terbuka',
   await page.$eval('#s1', e => !e.hidden) && await openCount() === 1, `terbuka: ${await openCount()}`);

// 9 — mode gelap
const themeOf = () => page.$eval('html', e => e.getAttribute('data-theme'));
const t0 = await themeOf();
await page.click('.js-theme'); await page.waitForTimeout(500);
const t1 = await themeOf();
ok('9a. tema berganti', t0 !== t1, `${t0} → ${t1}`);
const strokeDark = await page.$eval('.panel:not([hidden]) .wire', e => getComputedStyle(e).stroke);
await page.reload(); await page.waitForTimeout(1200);
ok('9b. tema bertahan setelah muat ulang', await themeOf() === t1, `dapat ${await themeOf()}`);
ok('9c. warna kabel ikut tema', /rgb/.test(strokeDark), strokeDark);
await page.click('.js-theme'); await page.waitForTimeout(400);

// 11 — responsif 390px
await page.setViewportSize({ width: 390, height: 800 });
await page.waitForTimeout(900);
const cols = await page.$eval('.panel:not([hidden]) .grid',
  e => getComputedStyle(e).gridTemplateColumns.trim().split(/\s+/).length);
ok('11a. 390px → grid 1 kolom', cols === 1, `dapat ${cols} kolom`);
const noHScroll = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
ok('11b. tiada guliran mendatar', noHScroll);
const wOk = await page.$eval('.panel:not([hidden]) .wire', e => (e.getAttribute('d') || '').length > 10);
ok('11c. kabel tetap tergambar', wOk);
await page.setViewportSize({ width: 1280, height: 900 });
await page.waitForTimeout(600);

// 10 — cetak: semua terbuka, semua bagian tampil
await page.click('.panel:not([hidden]) .card:nth-of-type(4) .chead');   // interaksi dulu
await page.waitForTimeout(800);
await page.emulateMedia({ media: 'print' });
await page.waitForTimeout(600);
const printRows = await page.$$eval('.r', els =>
  els.filter(e => e.getBoundingClientRect().height > 0.5 &&
                  parseFloat(getComputedStyle(e).opacity) > 0.9).length);
ok('10a. cetak: seluruh 162 baris terlihat', printRows === 162, `dapat ${printRows}`);
const printSecs = await page.$$eval('.panel', els =>
  els.filter(e => getComputedStyle(e).display !== 'none').length);
ok('10b. cetak: keempat bagian tampil', printSecs === 4, `dapat ${printSecs}`);
const barHidden = await page.$eval('.topbar', e => getComputedStyle(e).display === 'none');
ok('10c. cetak: bilah tab disembunyikan', barHidden);
await page.pdf({ path: process.argv[3] || 'out.pdf', format: 'A4', printBackground: true });
await page.emulateMedia({ media: 'screen' });

// ═══ v2: perancah, simpul, panel ؟ ═══
await page.goto(URL); await page.waitForTimeout(1200);

// 13 — layar pertama bersih: bilah tab langsung terlihat, perancah tidak
const barTop = await page.$eval('.topbar', e => Math.round(e.getBoundingClientRect().top));
ok('13a. bilah tab di puncak halaman', barTop <= 1, `top=${barTop}`);
const scaffoldVisible = await page.evaluate(() =>
  ['.warn', '.levels', 'table.key'].filter(sel => {
    const e = document.querySelector(sel);
    return e && e.getBoundingClientRect().height > 0 && e.checkVisibility?.() !== false;
  }).length);
ok('13b. perancah tak terlihat di layar pertama', scaffoldVisible === 0, `terlihat ${scaffoldVisible}`);
ok('13c. catatan Ustadz hilang dari peta', await page.$$eval('.note', e => e.length) === 0);

// 14 — panel ؟
await page.click('.js-about'); await page.waitForTimeout(400);
ok('14a. panel ؟ terbuka', await page.$eval('dialog.about', e => e.open));
ok('14b. panel memuat tabel kunci', await page.$eval('dialog.about table.key', e => !!e));
ok('14c. panel memuat nama Ustadz', /أحمد حسيني/.test(await page.$eval('dialog.about .meta', e => e.textContent)));
await page.keyboard.press('Escape'); await page.waitForTimeout(400);
ok('14d. Esc menutup panel', !(await page.$eval('dialog.about', e => e.open)));

// 15 — jumlah simpul
const nChip = await page.$$eval('.chip', e => e.length);
const nLong = await page.$$eval('.chip.long', e => e.length);
ok('15a. total butir = 363', nChip === 363, `dapat ${nChip}`);
ok('15b. butir baris-penuh = 92', nLong === 92, `dapat ${nLong}`);
ok('15c. .k dan .r tetap 162', await page.$$eval('.k', e => e.length) === 162 &&
                               await page.$$eval('.r', e => e.length) === 162);

// 16 — frasa ber-«·» di dalam <b> tetap satu butir, tag tidak rusak
//   (frasa ketiga dahulu «المطلَقُ يوافق السنة · والمعلَّقُ يخالفها» ada di bab nadzar
//    versi lama; susunan barunya di s4 memakai koma, bukan «·», jadi tinggal dua.)
const glued = await page.evaluate(() => {
  const want = ['العدالة · الكفاية',
                'كلُّ المُخِلِّ بالأركان فاسدٌ مُفسِد · وكلُّ الخارج عنها فاسدٌ غيرُ مُفسِد'];
  const chips = [...document.querySelectorAll('.chip')];
  return want.map(w => chips.some(c => c.textContent.includes(w)));
});
ok('16a. dua frasa ber-«·» dalam <b> tetap utuh', glued.every(Boolean), JSON.stringify(glued));
const orphanB = await page.$$eval('.chip', els =>
  els.filter(e => (e.innerHTML.match(/<b>/g) || []).length !== (e.innerHTML.match(/<\/b>/g) || []).length).length);
ok('16b. tiada butir dengan <b> tak seimbang', orphanB === 0, `rusak ${orphanB}`);

// 17 — cabang: .k satu baris di atas, .v di bawahnya (bukan dua kolom)
await page.click('.panel:not([hidden]) .card:nth-of-type(1) .chead');
await page.waitForTimeout(900);
const stacked = await page.evaluate(() => {
  const r = document.querySelector('.panel:not([hidden]) .card.open .r');
  const k = r.querySelector('.k').getBoundingClientRect();
  const v = r.querySelector('.v').getBoundingClientRect();
  return v.top >= k.bottom - 2;
});
ok('17. isi kartu bertingkat, bukan dua kolom', stacked);

// 18 — cetak: kembali dua kolom, semua baris terlihat, panel ؟ tercetak
await page.emulateMedia({ media: 'print' }); await page.waitForTimeout(500);
const sideBySide = await page.evaluate(() => {
  const r = document.querySelector('.r');
  const k = r.querySelector('.k').getBoundingClientRect();
  const v = r.querySelector('.v').getBoundingClientRect();
  return Math.abs(v.top - k.top) < 6;
});
ok('18a. cetak: .k dan .v kembali sebaris', sideBySide);
const pRows = await page.$$eval('.r', els => els.filter(e =>
  e.getBoundingClientRect().height > 0.5 && parseFloat(getComputedStyle(e).opacity) > 0.9).length);
ok('18b. cetak: seluruh 162 baris terlihat', pRows === 162, `dapat ${pRows}`);
ok('18c. cetak: panel ؟ tampil', await page.$eval('dialog.about',
  e => getComputedStyle(e).display !== 'none'));
const sep = await page.evaluate(() => {
  const c = document.querySelector('.chip + .chip');
  return getComputedStyle(c, '::before').content.includes('·');
});
ok('18d. cetak: pemisah «·» disusun ulang', sep);
await page.emulateMedia({ media: 'screen' });

// 12 — tanpa JS
const ctx2 = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 1280, height: 900 } });
const p2 = await ctx2.newPage();
await p2.goto(URL); await p2.waitForTimeout(800);
const nojsRows = await p2.$$eval('.r', els => els.filter(e => e.getBoundingClientRect().height > 0.5).length);
ok('12. tanpa JS: seluruh 162 baris tetap terbaca', nojsRows === 162, `dapat ${nojsRows}`);

// ═══════════ v5: orbit + jaring + kamera ═══════════
const octx = await browser.newContext({ viewport: { width: 1440, height: 940 } });
await octx.addInitScript(() => { try { if (!localStorage.getItem('mm-seeded')) {
  localStorage.setItem('mm-view', 'orbit'); localStorage.setItem('mm-seeded', '1'); } } catch (e) {} });
const op = await octx.newPage();
const oerr = [];
op.on('pageerror', e => oerr.push(String(e)));
await op.goto(URL); await op.waitForTimeout(1700);
const P = '.panel:not([hidden]) ';

ok('19. orbit: tiada galat JS', oerr.length === 0, oerr.join(' | '));

// 20 — orbit terbentuk
const g0 = await op.evaluate(() => {
  const panel = document.querySelector('.panel:not([hidden])');
  const R = e => e.getBoundingClientRect();
  return { n: panel.querySelectorAll('.card').length,
           pos: getComputedStyle(panel.querySelector('.card')).position,
           stage: !!panel.querySelector('.stage'),
           tf: getComputedStyle(panel.querySelector('.stage')).transform };
});
ok('20a. 13 planet, diposisikan absolut', g0.n === 13 && g0.pos === 'absolute', JSON.stringify(g0));
ok('20b. lapisan kamera ada dan diam di awal', g0.stage && g0.tf === 'matrix(1, 0, 0, 1, 0, 0)', g0.tf);

// 21 — tiada tabrakan antar planet, beberapa lebar
for (const w of [1440, 1280, 1000, 850]) {
  await op.setViewportSize({ width: w, height: 900 });
  await op.waitForTimeout(950);
  const n = await op.evaluate(() => {
    const panel = document.querySelector('.panel:not([hidden])');
    const R = [...panel.querySelectorAll('.card')].map(e => e.getBoundingClientRect());
    const hub = panel.querySelector('.hub').getBoundingClientRect();
    const hit = (a, b) => !(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top);
    let c = 0;
    for (let i = 0; i < R.length; i++) {
      for (let j = i + 1; j < R.length; j++) if (hit(R[i], R[j])) c++;
      if (hit(R[i], hub)) c++;
    }
    return c;
  });
  ok(`21. ${w}px: planet tidak bertabrakan`, n === 0, `${n} tabrakan`);
  // 21b — لا مسارَ يربطهم: الأبعادُ عن المركز مختلفة
  const rr = await op.evaluate(() => {
    const o = document.querySelector('.panel:not([hidden])')._orbit;
    return o.baseR.map(x => Math.round(x));
  });
  const uniq = [...new Set(rr)].length;
  ok(`21b. ${w}px: jarak ke inti beragam, bukan satu lintasan`, uniq >= 3,
     `${uniq} nilai: ${rr.join(' ')}`);
}
await op.setViewportSize({ width: 1440, height: 940 }); await op.waitForTimeout(900);

// 22 — jaring: jumlah simpul cocok dengan sumbernya, untuk SELURUH 13 planet
const webCheck = await op.evaluate(async () => {
  const panel = document.querySelector('.panel:not([hidden])');
  const cards = [...panel.querySelectorAll('.card')];
  const out = [];
  for (const c of cards) {
    c.querySelector('.chead').click();
    await new Promise(r => setTimeout(r, 260));
    out.push({
      num: c.querySelector('.num').textContent.trim(),
      srcB: c.querySelectorAll('.rows .r').length,
      srcL: c.querySelectorAll('.rows .chip').length,
      gotB: panel.querySelectorAll('.wnode.branch').length,
      gotL: panel.querySelectorAll('.wnode.leaf').length,
      webs: panel.querySelectorAll('.card.sel').length
    });
  }
  return out;
});
const mismatch = webCheck.filter(r => r.srcB !== r.gotB || r.srcL !== r.gotL);
ok('22a. simpul jaring cocok sumbernya di 13 planet', mismatch.length === 0,
   mismatch.slice(0, 2).map(r => `${r.num}: ${r.srcB}/${r.srcL} → ${r.gotB}/${r.gotL}`).join(' · '));
ok('22b. selalu satu jaring saja', webCheck.every(r => r.webs === 1));

// 23 — tiada tumpang tindih di dalam jaring, pada planet terberat tiap kitab
for (const [tab, n, label] of [['#tab-s1', 9, 'حنبلي ٩'], ['#tab-s2', 5, 'شافعي ٥'],
                               ['#tab-s3', 6, 'أيمان ٦'], ['#tab-s4', 3, 'نذور ٣']]) {
  await op.click(tab); await op.waitForTimeout(1100);
  await op.click(`${P}.card:nth-of-type(${n}) .chead`); await op.waitForTimeout(1300);
  const r = await op.evaluate(() => {
    const panel = document.querySelector('.panel:not([hidden])');
    const R = [...panel.querySelectorAll('.wnode')].map(e => e.getBoundingClientRect());
    const hit = (a, b) => !(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top);
    let c = 0;
    for (let i = 0; i < R.length; i++) for (let j = i + 1; j < R.length; j++) if (hit(R[i], R[j])) c++;
    const m = getComputedStyle(panel.querySelector('.stage')).transform.match(/matrix\(([\d.-]+)/);
    return { c, n: R.length, k: m ? +(+m[1]).toFixed(3) : 1,
             dim: panel.querySelectorAll('.card.dim').length };
  });
  ok(`23. ${label}: ${r.n} simpul tanpa tumpang tindih`, r.c === 0, `${r.c} tabrakan`);
  ok(`24. ${label}: kamera mendekat, skala di [0.5, 1.45]`,
     r.k >= 0.5 && r.k <= 1.45, `skala ${r.k}`);
  ok(`25. ${label}: planet lain meredup`, r.dim > 0, `${r.dim} meredup`);
}

// 26 — kamera kembali persis ke pangkal
await op.click('#tab-s1'); await op.waitForTimeout(1100);
await op.click(`${P}.card:nth-of-type(11) .chead`); await op.waitForTimeout(1300);
await op.keyboard.press('Escape'); await op.waitForTimeout(1300);
const back = await op.evaluate(() => {
  const panel = document.querySelector('.panel:not([hidden])');
  return { tf: getComputedStyle(panel.querySelector('.stage')).transform,
           web: panel.querySelectorAll('.wnode').length,
           dim: panel.querySelectorAll('.card.dim').length,
           w2: panel.querySelectorAll('.wire2,.wire3').length };
});
ok('26. Escape → kamera pulang, jaring hilang seluruhnya',
   back.tf === 'matrix(1, 0, 0, 1, 0, 0)' && !back.web && !back.dim && !back.w2, JSON.stringify(back));

// 27 — jurm planet tetangga: isi, jangkauan, dan perpindahan
await op.click(`${P}.card:nth-of-type(5) .chead`); await op.waitForTimeout(1400);
const numOf = () => op.$eval(P + '.card.sel .num', e => e.textContent.trim());
const orbState = () => op.evaluate(() => {
  const panel = document.querySelector('.panel:not([hidden])');
  const frame = panel.querySelector('.treewrap').getBoundingClientRect();
  const read = c => {
    const o = panel.querySelector('.orb.' + c), r = o.getBoundingClientRect();
    return { on: o.classList.contains('on'), num: o.querySelector('.onum').textContent.trim(),
             title: o.querySelector('.otitle').textContent.trim(),
             x: Math.round(r.left), y: Math.round(r.top), w: r.width, h: r.height,
             inside: r.left >= frame.left - 0.5 && r.right <= frame.right + 0.5 &&
                     r.top >= frame.top - 0.5 && r.bottom <= frame.bottom + 0.5, r };
  };
  const a = read('prev'), b = read('next');
  const hit = (p, q) => !(p.right <= q.left || q.right <= p.left ||
                          p.bottom <= q.top || q.bottom <= p.top);
  return { a, b, overlap: hit(a.r, b.r) };
});
const o5 = await orbState();
const t46 = await op.evaluate(() => {
  const c = [...document.querySelectorAll('.panel:not([hidden]) .card')];
  return [4, 6].map(i => c[i - 1].querySelector('h3').textContent.trim());
});
ok('27a. dua jurm tampil dengan nomor tetangga',
   o5.a.on && o5.b.on && [o5.a.num, o5.b.num].sort().join() === '4,6',
   `${o5.a.num} / ${o5.b.num}`);
ok('27b. jurm membawa judul topik tetangganya',
   [o5.a.title, o5.b.title].sort().join('|') === t46.slice().sort().join('|'),
   `${o5.a.title} / ${o5.b.title}`);

// 27c — pada planet terberat tiap kitab jurm tetap di dalam bingkai, tak bertumpuk
const reach = [];
for (const [tab, n, label] of [['#tab-s1', 9, 'حنبلي ٩'], ['#tab-s2', 5, 'شافعي ٥'],
                               ['#tab-s3', 6, 'أيمان ٦'], ['#tab-s4', 3, 'نذور ٣']]) {
  await op.click(tab); await op.waitForTimeout(1100);
  await op.click(`${P}.card:nth-of-type(${n}) .chead`); await op.waitForTimeout(1500);
  const r = await orbState();
  reach.push(`${label}:${r.a.inside && r.b.inside && !r.overlap ? 'ok' : 'X'}`);
}
ok('27c. jurm selalu terjangkau, tak bertumpuk, di planet terberat',
   reach.every(x => x.endsWith('ok')), reach.join(' · '));

// 27d — mengklik jurm memindah topik dan menutup yang sebelumnya
await op.click('#tab-s1'); await op.waitForTimeout(1100);
await op.click(`${P}.card:nth-of-type(5) .chead`); await op.waitForTimeout(1400);
const num5 = await numOf();
const goto6 = await op.evaluate(() => {
  const panel = document.querySelector('.panel:not([hidden])');
  const o = [...panel.querySelectorAll('.orb')].find(x => x.querySelector('.onum').textContent.trim() === '6');
  return !!o && (o.click(), true);
});
await op.waitForTimeout(1500);
const orb6 = await op.evaluate(() => {
  const panel = document.querySelector('.panel:not([hidden])');
  const cards = [...panel.querySelectorAll('.card')];
  const sel = panel.querySelector('.card.sel');
  const i = cards.indexOf(sel);
  return { num: sel.querySelector('.num').textContent.trim(),
           sels: panel.querySelectorAll('.card.sel').length,
           srcB: sel.querySelectorAll('.rows .r').length,
           srcL: sel.querySelectorAll('.rows .chip').length,
           gotB: panel.querySelectorAll('.wnode.branch').length,
           gotL: panel.querySelectorAll('.wnode.leaf').length,
           open5: cards[4].classList.contains('sel'), i };
});
ok('27d. klik jurm ٦: topik ٦ terbuka, ٥ tertutup, satu jaring saja',
   goto6 && num5 === '5' && orb6.num === '6' && orb6.sels === 1 && !orb6.open5 &&
   orb6.srcB === orb6.gotB && orb6.srcL === orb6.gotL, JSON.stringify(orb6));

// 27e — papan ketik ← → tetap menelusuri walau sedang diperbesar
await op.keyboard.press('ArrowLeft'); await op.waitForTimeout(1300);
const n7 = await numOf();
await op.keyboard.press('ArrowRight'); await op.waitForTimeout(1300);
const n6 = await numOf();
ok('27e. ← → menelusuri walau sedang diperbesar', n7 === '7' && n6 === '6', `${n7} → ${n6}`);

// 27f — seret tak lagi menggeser apa pun
//   (dimulai di atas simpul: tanpa seret, angkat-jari di latar kini murni
//    sebuah nokta, dan nokta di latar memang menutup jaring — itu benar.)
//   (ditutup dulu: selama satu topik terbuka, planet lain memang berada di
//    luar bingkai dan tak bisa dinokta — itulah gunanya orb dan panah.)
await op.keyboard.press('Escape'); await op.waitForTimeout(1300);
await op.click(`${P}.card:nth-of-type(4) .chead`); await op.waitForTimeout(1600);
const tf0 = await op.$eval(P + '.stage', e => getComputedStyle(e).transform);
const spot = await op.$eval(P + '.wnode.leaf', e => {
  const r = e.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
});
await op.mouse.move(spot.x, spot.y);
await op.mouse.down();
for (let i = 1; i <= 10; i++) await op.mouse.move(spot.x - i * 20, spot.y + i * 10);
//   يُقاس والزرُّ مضغوطٌ: الرفعُ فوق الخلفية نقرةُ خلفيةٍ تُغلِق الشبكة،
//   وذلك صوابٌ — المقصودُ هنا إثباتُ أنّ السحبَ نفسَه لا يحرّك شيئًا.
const afterDrag = await op.evaluate(() => {
  const panel = document.querySelector('.panel:not([hidden])');
  return { tf: getComputedStyle(panel.querySelector('.stage')).transform,
           web: panel.querySelectorAll('.wnode').length };
});
await op.mouse.up();
await op.waitForTimeout(700);
ok('27f. seret tidak menggeser kanvas sedikit pun',
   afterDrag.tf === tf0 && afterDrag.web > 0,
   `${tf0} → ${afterDrag.tf} · ${afterDrag.web} simpul`);
await op.click(`${P}.card:nth-of-type(4) .chead`); await op.waitForTimeout(1600);

// 27g — gulir tak lagi memperbesar, dan tak lagi merampas guliran halaman
const afterWheel = await op.evaluate(async () => {
  const panel = document.querySelector('.panel:not([hidden])');
  const w = panel.querySelector('.treewrap'), st = panel.querySelector('.stage');
  const before = getComputedStyle(st).transform;
  const r = w.getBoundingClientRect();
  let prevented = false;
  for (let i = 0; i < 6; i++) {
    const ev = new WheelEvent('wheel', { deltaY: -300, bubbles: true, cancelable: true,
      clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 });
    w.dispatchEvent(ev);
    if (ev.defaultPrevented) prevented = true;
  }
  await new Promise(rr => setTimeout(rr, 200));
  return { before, after: getComputedStyle(st).transform, prevented,
           touch: getComputedStyle(w).touchAction };
});
ok('27g. gulir tidak memperbesar dan tidak dicegat',
   afterWheel.after === afterWheel.before && !afterWheel.prevented &&
   afterWheel.touch !== 'none', JSON.stringify(afterWheel));

// 27h — cubit dua jari juga tiada
const afterPinch = await op.evaluate(async () => {
  const panel = document.querySelector('.panel:not([hidden])');
  const w = panel.querySelector('.treewrap'), st = panel.querySelector('.stage');
  const before = getComputedStyle(st).transform;
  const r = w.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
  const send = (type, id, x, y) => w.dispatchEvent(new PointerEvent(type,
    { pointerId: id, clientX: x, clientY: y, bubbles: true, isPrimary: id === 1 }));
  send('pointerdown', 1, cx - 40, cy); send('pointerdown', 2, cx + 40, cy);
  for (let d = 50; d <= 200; d += 25) { send('pointermove', 1, cx - d, cy); send('pointermove', 2, cx + d, cy); }
  send('pointerup', 1, cx - 200, cy); send('pointerup', 2, cx + 200, cy);
  await new Promise(rr => setTimeout(rr, 150));
  return getComputedStyle(st).transform === before;
});
ok('27h. cubit dua jari tidak memperbesar', afterPinch);

// 27i — planet pulang ke tempatnya sesudah ditutup
await op.keyboard.press('Escape'); await op.waitForTimeout(1300);
const homeAgain = await op.evaluate(() => {
  const panel = document.querySelector('.panel:not([hidden])'), o = panel._orbit;
  const cards = [...panel.querySelectorAll('.card')];
  let worst = 0;
  cards.forEach((c, i) => {
    const dx = (+gsap.getProperty(c, 'x')) - (o.cx + o.baseR[i] * Math.cos(o.baseTh[i]));
    const dy = (+gsap.getProperty(c, 'y')) - (o.cy - o.baseR[i] * Math.sin(o.baseTh[i]));
    worst = Math.max(worst, Math.hypot(dx, dy));
  });
  return { worst: +worst.toFixed(2),
           tf: getComputedStyle(panel.querySelector('.stage')).transform };
});
ok('27i. planet pulang tepat ke tempatnya, kamera ikut pulang',
   homeAgain.worst <= 2 && homeAgain.tf === 'matrix(1, 0, 0, 1, 0, 0)',
   JSON.stringify(homeAgain));

// 27j — Esc tetap aman ditekan walau tak ada yang terbuka
await op.keyboard.press('Escape'); await op.waitForTimeout(1300);
const home = await op.$eval(P + '.stage', e => getComputedStyle(e).transform);
ok('27j. Esc memulangkan pandangan walau tiada yang terbuka',
   home === 'matrix(1, 0, 0, 1, 0, 0)', home);

// 27k — sapuan besar: pada setiap planet dari tiga puluh empat, di tiga ukuran
//       layar — jurm tak menutupi simpul, jurm tetap di dalam bingkai, DAN
//       tak ada satu planet lain pun yang masih tampak.
const cover = [], seen = [], onWire = [];
for (const [W, H] of [[1440, 940], [1024, 768], [820, 1180]]) {
  await op.setViewportSize({ width: W, height: H }); await op.waitForTimeout(900);
  for (const tab of ['#tab-s1', '#tab-s2', '#tab-s3', '#tab-s4']) {
    await op.click(tab); await op.waitForTimeout(800);
    const n = await op.$$eval(P + '.card', e => e.length);
    for (let i = 1; i <= n; i++) {
      await op.click(`${P}.card:nth-of-type(${i}) .chead`); await op.waitForTimeout(820);
      const r = await op.evaluate(() => {
        const panel = document.querySelector('.panel:not([hidden])');
        const f = panel.querySelector('.treewrap').getBoundingClientRect();
        const hit = (a, b) => !(a.right <= b.left || b.right <= a.left ||
                                a.bottom <= b.top || b.bottom <= a.top);
        const orbs = [...panel.querySelectorAll('.orb.on')].map(e => e.getBoundingClientRect());
        const nodes = [...panel.querySelectorAll('.wnode')].map(e => e.getBoundingClientRect());
        /* الأسلاكُ خيوطٌ منحنيةٌ لا صناديق، فتُقاس من المسار نفسه بنقاطٍ
           عليه — لا من حسابِ التقطيع الذي في app.js، وإلّا شهد الحسابُ لنفسه */
        let w = 0;
        for (const pth of panel.querySelectorAll('.wire2, .wire3')) {
          const L = pth.getTotalLength(), m = pth.getScreenCTM();
          for (let q = 0; q <= 20; q++) {
            const pt = pth.getPointAtLength(L * q / 20);
            const px = m.a * pt.x + m.c * pt.y + m.e, py = m.b * pt.x + m.d * pt.y + m.f;
            for (const o of orbs)
              if (px >= o.left && px <= o.right && py >= o.top && py <= o.bottom) { w++; break; }
          }
        }
        let c = 0, out = 0;
        for (const o of orbs) {
          for (const nd of nodes) if (hit(o, nd)) c++;
          if (o.left < f.left - .5 || o.right > f.right + .5 ||
              o.top < f.top - .5 || o.bottom > f.bottom + .5) out++;
        }
        const cur = panel.querySelector('.card.sel');
        const vis = [...panel.querySelectorAll('.card')]
          .filter(x => x !== cur)
          .filter(x => hit(x.getBoundingClientRect(), f)).length;
        return { c, out, vis, w, orbs: orbs.length,
                 num: cur.querySelector('.num').textContent.trim() };
      });
      if (r.c || r.out || r.orbs !== 2) cover.push(`${W}/${tab.slice(5)}/${r.num}:${r.c}/${r.out}`);
      if (r.vis) seen.push(`${W}/${tab.slice(5)}/${r.num}:${r.vis}`);
      if (r.w) onWire.push(`${W}/${tab.slice(5)}/${r.num}:${r.w}`);
      await op.keyboard.press('Escape'); await op.waitForTimeout(620);
    }
  }
}
await op.setViewportSize({ width: 1440, height: 940 }); await op.waitForTimeout(1000);
await op.click('#tab-s1'); await op.waitForTimeout(900);
ok('27k. jurm tak menutupi simpul mana pun di 34 planet × 3 ukuran layar',
   cover.length === 0, cover.slice(0, 6).join(' '));
ok('27l. tiada planet lain yang tampak saat satu planet terbuka (34 × 3)',
   seen.length === 0, seen.slice(0, 8).join(' '));
ok('27q. jurm tak menduduki kabel penghubung mana pun (34 × 3)',
   onWire.length === 0, onWire.slice(0, 8).join(' '));

// 27m — keluhan lapangan: di tablet, menggulir halaman menyembunyikan bilah
//        alamat, innerHeight berubah, resize menyala, dan dahulu itu memulangkan
//        semua planet ke posisi awalnya tepat di atas materi yang sedang dibuka.
await op.click(P + '.card:nth-of-type(3) .chead'); await op.waitForTimeout(1000);
const beforeH = await op.evaluate(() => {
  const panel = document.querySelector('.panel:not([hidden])');
  const n = panel.querySelector('.wnode');
  return { tf: getComputedStyle(panel.querySelector('.stage')).transform,
           x: n ? Math.round(n.getBoundingClientRect().left) : -1 };
});
for (const h of [880, 940, 900]) {                 // bilah alamat muncul-sembunyi
  await op.setViewportSize({ width: 1440, height: h }); await op.waitForTimeout(500);
}
await op.waitForTimeout(700);
const afterH = await op.evaluate(() => {
  const panel = document.querySelector('.panel:not([hidden])');
  const f = panel.querySelector('.treewrap').getBoundingClientRect();
  const hit = (a, b) => !(a.right <= b.left || b.right <= a.left ||
                          a.bottom <= b.top || b.bottom <= a.top);
  const cur = panel.querySelector('.card.sel');
  const nodes = [...panel.querySelectorAll('.wnode')].map(e => e.getBoundingClientRect());
  let over = 0;
  [...panel.querySelectorAll('.card')].filter(x => x !== cur).forEach(x => {
    const r = x.getBoundingClientRect();
    if (!hit(r, f)) return;                        // sudah keluar bingkai
    for (const nd of nodes) if (hit(r, nd)) over++;
  });
  return { open: panel.querySelector('.treewrap').classList.contains('webopen'),
           over, nodes: nodes.length };
});
ok('27m. materi tetap terbuka dan tak tertimpa planet sesudah tinggi layar berubah',
   afterH.open && afterH.over === 0 && afterH.nodes > 0, JSON.stringify(afterH));

// 27n — bukan sekadar tak terlihat: titik tengah butir benar-benar tersentuh
const touchable = await op.evaluate(() => {
  const panel = document.querySelector('.panel:not([hidden])');
  const f = panel.querySelector('.treewrap').getBoundingClientRect();
  let tried = 0, blocked = 0, by = '';
  for (const n of panel.querySelectorAll('.wnode')) {
    const r = n.getBoundingClientRect();
    const x = (r.left + r.right) / 2, y = (r.top + r.bottom) / 2;
    if (x < f.left || x > f.right || y < f.top || y > f.bottom) continue;
    tried++;
    const el = document.elementFromPoint(x, y);
    if (!el || !el.closest('.web')) { blocked++; if (!by) by = el ? el.className : 'null'; }
  }
  return { tried, blocked, by };
});
ok('27n. tiap butir bisa disentuh di titik tengahnya',
   touchable.tried > 0 && touchable.blocked === 0, JSON.stringify(touchable));

// 27o — planet yang menyingkir dan inti yang terlipat tak menangkap sentuhan
const inert = await op.evaluate(() => {
  const panel = document.querySelector('.panel:not([hidden])');
  const dim = panel.querySelector('.card.dim');
  return { dim: dim ? getComputedStyle(dim).pointerEvents : 'x',
           hub: getComputedStyle(panel.querySelector('.hub')).pointerEvents };
});
ok('27o. planet redup dan inti terlipat tak menangkap sentuhan',
   inert.dim === 'none' && inert.hub === 'none', JSON.stringify(inert));

// 27p — jurm tak pernah lagi berlabuh di tengah bingkai: selalu di salah satu tepi
const rails = await op.evaluate(() => {
  const panel = document.querySelector('.panel:not([hidden])');
  const f = panel.querySelector('.treewrap').getBoundingClientRect();
  const ORB_PAD = 8;
  return [...panel.querySelectorAll('.orb.on')].map(o => {
    const r = o.getBoundingClientRect();
    const cx = (r.left + r.right) / 2, cy = (r.top + r.bottom) / 2;
    const slack = Math.max(r.width, r.height) / 2 + ORB_PAD + 1.5;
    return +Math.min(cx - f.left, f.right - cx, cy - f.top, f.bottom - cy).toFixed(1)
           - +slack.toFixed(1);
  });
});
ok('27p. kedua jurm berlabuh di tepi bingkai, bukan di tengah',
   rails.length === 2 && rails.every(d => d <= 0), JSON.stringify(rails));

await op.keyboard.press('Escape'); await op.waitForTimeout(900);

// 28 — SUMBER TAK TERSENTUH: inilah bukti bahwa penyalinan tidak merusak apa pun
const intact = await op.evaluate(() => ({
  r: document.querySelectorAll('.r').length,
  chip: document.querySelectorAll('.chip').length,
  rows: document.querySelectorAll('.rows').length,
  bad: [...document.querySelectorAll('.rows')].filter(x =>
    x.closest('.card')?.querySelector('.chead')?.getAttribute('aria-controls') !== x.id).length
}));
ok('28. 162 baris + 363 butir asli utuh di kartunya',
   intact.r === 162 && intact.chip === 363 && intact.rows === 34 && !intact.bad, JSON.stringify(intact));

// 29 — jurm tampak di orbit saat terbuka, tersembunyi di pohon / 390px
const hid = {};
await op.click(`${P}.card:nth-of-type(3) .chead`); await op.waitForTimeout(1400);
hid.orbit = await op.$eval('.orb', e => e.offsetParent !== null);
await op.click('.js-view'); await op.waitForTimeout(1100);
hid.tree = await op.$eval('.orb', e => e.offsetParent === null);
await op.click('.js-view'); await op.waitForTimeout(1100);
hid.shut = await op.$eval('.orb', e => e.offsetParent === null);   // tiada yang terbuka
await op.click(`${P}.card:nth-of-type(3) .chead`); await op.waitForTimeout(1400);
await op.setViewportSize({ width: 390, height: 800 }); await op.waitForTimeout(1000);
hid.narrow = await op.$eval('.orb', e => e.offsetParent === null);
hid.flat = await op.$eval(P + '.card', e => getComputedStyle(e).position) === 'relative';
await op.setViewportSize({ width: 1440, height: 940 }); await op.waitForTimeout(1000);
ok('29. jurm: tampak saat terbuka, hilang di pohon, saat tertutup, dan di 390px',
   hid.orbit && hid.tree && hid.shut && hid.narrow, JSON.stringify(hid));
ok('30. 390px dipaksa pohon', hid.flat);

// 31 — cetak sesudah memakai jaring, tanpa hook pemulihan apa pun
await op.click(`${P}.card:nth-of-type(9) .chead`); await op.waitForTimeout(1200);
await op.emulateMedia({ media: 'print' }); await op.waitForTimeout(700);
const pr = await op.evaluate(() => ({
  vis: [...document.querySelectorAll('.r')].filter(e =>
    e.getBoundingClientRect().height > 0.5 && parseFloat(getComputedStyle(e).opacity) > 0.9).length,
  hub: getComputedStyle(document.querySelector('.hub')).display,
  web: getComputedStyle(document.querySelector('.web')).display,
  orb: getComputedStyle(document.querySelector('.orb')).display,
  card: getComputedStyle(document.querySelector('.card')).position
}));
ok('31a. cetak sesudah jaring: 162 baris terlihat', pr.vis === 162, `dapat ${pr.vis}`);
ok('31b. cetak: inti, jaring, dan jurm disembunyikan, kartu mengalir',
   pr.hub === 'none' && pr.web === 'none' && pr.orb === 'none' &&
   pr.card === 'relative', JSON.stringify(pr));
await op.emulateMedia({ media: 'screen' });
await octx.close();

console.log(`\n${pass} lulus, ${fail} gagal`);
if (errs.length) console.log('galat:', errs.slice(0, 5).join('\n'));
await browser.close();
process.exit(fail ? 1 : 0);
