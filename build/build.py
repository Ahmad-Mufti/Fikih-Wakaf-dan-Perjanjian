#!/usr/bin/env python3
"""Rakit index.html dari naskah Markdown di sumber/.

    python3 build/build.py

Naskah dan tampilan terpisah:

    sumber/*.md          ← naskahnya. Di sinilah revisi dilakukan.
    sumber/kerangka.html ← sampul, peringatan, level, tabel kunci, panji, kaki.
    build/app.css, app.js ← tampilan dan perilaku.
    build/vendor/        ← GSAP, ditanam agar berkas jalan tanpa internet.

Tiga tanda Markdown = tiga tingkat peta:

    ## 1. عنوان   → kartu        <article class="card">
    ### فرع        → cabang       <div class="r"><div class="k">
    - بند          → butir        <span class="chip">

Dua penanda dalam teks, tak ada yang lain:

    **غامق**  → <b>            `Latin`  → <span class='id'>

Skrip ini tidak pernah mengubah satu huruf pun dari naskah; yang ditulisnya
hanyalah kerangka HTML di sekelilingnya.
"""
import html
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
SUM = ROOT / "sumber"
HERE = ROOT / "build"
OUT = ROOT / "index.html"

TABS = [("s1", "s1-waqf-hanbali.md", "الوقف · حنبلي", 13),
        ("s2", "s2-waqf-syafii.md", "الوقف · شافعي", 11),
        ("s3", "s3-ayman.md", "الأيمان", 6),
        ("s4", "s4-nudzur.md", "النذور", 4)]
LONG = 40   # أطولُ من هذا يُعرَض سطرًا كاملًا لا كِسرةً

# ── الكرنكا: تُقرَأ بالعلامات لا بأرقام الأسطر ────────────────────────
raw = (SUM / "kerangka.html").read_text(encoding="utf-8")
PART = {}
for m in re.finditer(r"<!-- part:([\w:]+) -->\n(.*?)(?=\n<!-- part:|\Z)", raw, re.S):
    PART[m.group(1)] = m.group(2).rstrip()
for need in ("fonts", "cover", "warn", "levels", "key", "footer",
             "banner:s1", "banner:s2", "banner:s3", "banner:s4"):
    assert need in PART, "الكرنكا ينقصها الجزء «%s»" % need
assert PART["fonts"].count("@font-face") == 2, "بلوكُ الخطّ مخبولٌ"


# ── نصٌّ داخليّ: علامتان اثنتان لا ثالثَ لهما ───────────────────────
def inline(md):
    s = html.escape(md, quote=False)
    assert "`" not in s or s.count("`") % 2 == 0, "علامةُ ` غيرُ مزدوجة: %s" % md
    s = re.sub(r"`([^`]+)`", lambda m: "<span class='id'>%s</span>" % m.group(1), s)
    s = re.sub(r"\*\*(.+?)\*\*", lambda m: "<b>%s</b>" % m.group(1), s, flags=re.S)
    assert "**" not in s, "نجمتان بلا إغلاق: %s" % md
    return s


def txt(s):
    return html.unescape(re.sub(r"<[^>]+>", "", s)).strip()


# ── قراءةُ ملفِّ قسمٍ واحد ──────────────────────────────────────────
def read_md(path, key, n_exp):
    cards, card, branch = [], None, None
    for ln, line in enumerate(path.read_text(encoding="utf-8").split("\n"), 1):
        s = line.rstrip()
        if not s or s.startswith("<!--") or s.startswith("     ") or s == "-->":
            continue
        if s.startswith("# "):
            continue                       # عنوانُ الملفّ، للقارئ لا للبناء
        where = "%s:%d" % (path.name, ln)
        if s.startswith("## "):
            m = re.match(r"##\s*(\d+)\.\s*(.+)$", s)
            assert m, "%s: رأسُ موضوعٍ بلا رقمٍ متسلسل: %s" % (where, s)
            assert int(m.group(1)) == len(cards) + 1, \
                "%s: ترقيمٌ منقطعٌ — وُجد %s وكان المنتظَر %d" % (
                    where, m.group(1), len(cards) + 1)
            card = {"num": m.group(1), "title": m.group(2).strip(), "rows": []}
            cards.append(card); branch = None
        elif s.startswith("### "):
            assert card, "%s: فرعٌ قبل أيِّ موضوع" % where
            branch = {"k": s[4:].strip(), "chips": []}
            card["rows"].append(branch)
        elif s.startswith("- "):
            assert branch, "%s: بندٌ قبل أيِّ فرع" % where
            branch["chips"].append(s[2:].strip())
        else:
            raise SystemExit("%s: سطرٌ لا يُفهَم — %s" % (where, s))
    assert len(cards) == n_exp, "%s: %d موضوعًا لا %d" % (path.name, len(cards), n_exp)
    for c in cards:
        assert c["rows"], "%s/%s: موضوعٌ بلا فروع" % (key, c["num"])
        for b in c["rows"]:
            assert b["chips"], "%s/%s: فرعُ «%s» بلا بنود" % (key, c["num"], b["k"])
    return cards


# ── بناءُ قسمٍ واحد ─────────────────────────────────────────────────
stat = {"cards": 0, "rows": 0, "chips": 0, "long": 0}


def build_section(key, cards):
    arts = []
    for c in cards:
        rid = "rows-%s-%s" % (key, c["num"])
        rows = []
        for b in c["rows"]:
            chips = []
            for ch in b["chips"]:
                h = inline(ch)
                cls = "chip long" if len(txt(h)) > LONG else "chip"
                stat["chips"] += 1
                stat["long"] += cls.endswith("long")
                chips.append('<span class="%s">%s</span>' % (cls, h))
            stat["rows"] += 1
            rows.append('<div class="r"><div class="k">%s</div>'
                        '<div class="v">%s</div></div>'
                        % (inline(b["k"]), "".join(chips)))
        stat["cards"] += 1
        arts.append('<article class="card %s">'
                    '<button class="chead" type="button" aria-expanded="false"'
                    ' aria-controls="%s"><span class="num">%s</span><h3>%s</h3>'
                    '<span class="chev" aria-hidden="true"><i></i></span></button>'
                    '<div class="rows" id="%s">%s</div></article>'
                    % (key, rid, c["num"], inline(c["title"]), rid, "".join(rows)))

    banner = PART["banner:" + key]
    h2 = re.search(r"<h2>(.*?)</h2>", banner, re.S).group(1)
    tags = re.search(r'<div class="tags">.*?</div>\s*$', banner, re.S | re.M)
    tags = re.search(r'<div class="tags">.*?</div>', banner, re.S).group(0)
    # ‏.stage هو الكاميرا: كلُّ ما في العالَم بداخله، والإطارُ يقصُّ ما خرج.
    # والجُرمان خارجَه لأنهما واجهةٌ على الشاشة لا جزءٌ من العالَم المتحرّك.
    return (
        '<section class="sec %s">\n%s\n'
        '  <div class="treewrap">\n'
        '  <div class="stage">\n'
        '    <div class="hub">\n'
        '      <div class="sun"><h2>%s</h2>%s</div>\n'
        '    </div>\n'
        '    <div class="web" aria-live="polite"></div>\n'
        '  <div class="grid">%s</div>\n'
        '  </div>\n'
        '  <button class="orb prev" type="button">'
        '<span class="onum"></span><span class="otitle"></span></button>\n'
        '  <button class="orb next" type="button">'
        '<span class="onum"></span><span class="otitle"></span></button>\n'
        '  </div>\n</section>' % (key, banner, h2, tags, "".join(arts)))


SEC = {}
for key, fname, _, n_exp in TABS:
    SEC[key] = build_section(key, read_md(SUM / fname, key, n_exp))

assert stat["cards"] == 34, "عددُ البطاقات %d" % stat["cards"]
assert stat["rows"] == 162, "عددُ الفروع %d" % stat["rows"]
assert stat["chips"] == 363, "عددُ البنود %d" % stat["chips"]

# ── إشارةُ التفاعل داخل مفتاح المستويات ──────────────────────────────
LEVELS = PART["levels"].rstrip()
assert LEVELS.endswith("</div>")
LEVELS = LEVELS[:-len("</div>")] + (
    '  <div><span class="lv">تفاعل</span> انقُرِ العنوانَ الملوَّنَ ليتفرَّعَ ما تحتَه ·'
    ' والمفتوحُ يبقى مفتوحًا حتى تُغلِقَه</div>\n</div>')

# مَتْنُ الغلاف وحدَه — بلا عنوانٍ ضخمٍ، يسكن لوحةَ «؟» حفظًا للنسبة إلى الأستاذ
cover_meta = re.search(r'<div class="meta">(.*?)</div>\s*</div>',
                       PART["cover"], re.S).group(1)

tabhtml = "\n".join(
    '      <button class="tab %s" id="tab-%s" type="button" role="tab"'
    ' aria-controls="%s" aria-selected="false" tabindex="-1">'
    '<span class="sw"></span>%s</button>' % (k, k, k, label)
    for k, _, label, _ in TABS)

panels = "\n".join(
    '<div class="panel" id="%s" role="tabpanel" aria-labelledby="tab-%s" tabindex="0">\n'
    '%s\n</div>' % (k, k, SEC[k]) for k, _, _, _ in TABS)

FONTS = PART["fonts"]
WARN = PART["warn"]
KEY = PART["key"]
FOOTER = PART["footer"]
css = (HERE / "app.css").read_text(encoding="utf-8")
appjs = (HERE / "app.js").read_text(encoding="utf-8")
gsapjs = (HERE / "vendor" / "gsap.min.js").read_text(encoding="utf-8")
drawjs = (HERE / "vendor" / "DrawSVGPlugin.min.js").read_text(encoding="utf-8")

doc = f"""<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>خريطة ذهنية تفاعلية — فقه الوقف والأيمان والنذور</title>
<meta name="description" content="خريطةٌ ذهنيةٌ تفاعليةٌ لمادة فقه الوقف والأيمان والنذور، مفصولةٌ على أربعة أقسامٍ من الكتب الثلاثة المقرَّرة.">
<script>
/* قبل أوّل رسم: علِّمِ الصفحةَ أنّ JS يعمل، وطبِّقِ السِّمةَ المحفوظة،
   واضبطِ القسمَ الجاريَ من العنوان — كلُّ ذلك بلا وميض */
(function(){{var d=document.documentElement;d.classList.add('js');
try{{var t=localStorage.getItem('mm-theme');if(t)d.setAttribute('data-theme',t);}}catch(e){{}}
var h=(location.hash||'').replace('#','');
d.setAttribute('data-tab',/^s[1-4]$/.test(h)?h:'s1');
var v='tree';try{{v=localStorage.getItem('mm-view')||'orbit';}}catch(e){{v='orbit';}}
if(innerWidth<760)v='tree';
d.setAttribute('data-view',v);}})();
</script>
<style>
{FONTS}
{css}</style>
</head>
<body>

<div class="topbar">
  <div class="topbar-in">
    <div class="tabs" role="tablist" aria-label="الأقسامُ الأربعة">
{tabhtml}
      <span class="tabind" aria-hidden="true"></span>
    </div>
    <div class="tools">
      <button class="tool js-all" type="button"><span class="ic">⊕</span><span class="tx">افتحِ الكلَّ</span></button>
      <button class="tool js-view" type="button" aria-label="تبديل العرض"><span class="ic">⊙</span><span class="tx">مدار</span></button>
      <button class="tool js-theme" type="button" aria-label="الوضع الليلي"><span class="ic">☾</span></button>
      <button class="tool js-about" type="button" aria-label="عن الخريطة"><span class="ic">؟</span></button>
    </div>
  </div>
</div>

<div class="wrap">
{panels}
</div>

<dialog class="about" aria-label="عن الخريطة">
  <button class="x js-close" type="button" aria-label="إغلاق">✕</button>
  <div class="about-in">
    <h2>عن هذه الخريطة</h2>
    <div class="meta">{cover_meta}</div>

{WARN}

{LEVELS}

<div class="keywrap">
{KEY}
</div>

{FOOTER}
  </div>
</dialog>

<script>
/*! GSAP 3.15.0 — https://gsap.com — Copyright 2026, GreenSock.
    Standard "no charge" license: https://gsap.com/standard-license
    مضمَّنٌ هنا ليعمل الملفُّ كاملًا بلا اتّصالٍ بالشبكة. */
{gsapjs}
{drawjs}
</script>
<script>
{appjs}</script>
</body>
</html>
"""

OUT.write_text(doc, encoding="utf-8")
print("موضوعًا     : %d" % stat["cards"])
print("فرعًا       : %d" % stat["rows"])
print("بندًا       : %d (كِسرة %d + سطرٌ كامل %d)"
      % (stat["chips"], stat["chips"] - stat["long"], stat["long"]))
print("index.html : %.1f KB" % (len(doc.encode()) / 1024))
