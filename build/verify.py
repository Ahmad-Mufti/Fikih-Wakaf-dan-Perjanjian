#!/usr/bin/env python3
"""Buktikan index.html masih cocok dengan naskah di sumber/.

    python3 build/verify.py

Membaca .md dan index.html masing-masing sendiri — tanpa lewat build.py —
lalu membandingkan naskahnya huruf demi huruf. Lulusnya berarti dua hal:
index.html memang hasil bangun dari sumber yang ada sekarang, dan tidak ada
satu huruf pun yang hilang dalam perjalanannya.
"""
import html
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
SUM = ROOT / "sumber"
FILES = [("s1", "s1-waqf-hanbali.md"), ("s2", "s2-waqf-syafii.md"),
         ("s3", "s3-ayman.md"), ("s4", "s4-nudzur.md")]


def norm(x):
    """نصٌّ مجرَّد: كلُّ وسمٍ فاصلٌ لا حذفٌ، وإلّا التصقت المتجاوراتُ فبدا
    الفرقُ ضياعًا وليس بضياع."""
    x = re.sub(r"<[^>]+>", " ", x)
    return re.sub(r"\s+", " ", html.unescape(x)).strip()


def md_plain(s):
    """العلامةُ تُبدَّل فراغًا كما يُبدَّل الوسمُ في norm — وإلّا اختلف الجانبان
    عند حدود الوسم وحدَها فبدا فرقًا وليس بفرق."""
    return norm(re.sub(r"`|\*\*", " ", s))


# ── المنتظَر: من الـMarkdown ─────────────────────────────────────────
want_cards, want_k, want_chip = [], [], []
for key, fname in FILES:
    for line in (SUM / fname).read_text(encoding="utf-8").split("\n"):
        s = line.rstrip()
        if s.startswith("## "):
            want_cards.append(md_plain(re.sub(r"^##\s*\d+\.\s*", "", s)))
        elif s.startswith("### "):
            want_k.append(md_plain(s[4:]))
        elif s.startswith("- ") and not s.startswith("- ", 5):
            want_chip.append(md_plain(s[2:]))

# ── الواقع: من index.html ────────────────────────────────────────────
doc = (ROOT / "index.html").read_text(encoding="utf-8")
arts = re.findall(r'<article class="card s\d">(.*?)</article>', doc, re.S)
assert len(arts) == 34, "عددُ البطاقات في الصفحة %d" % len(arts)
grid = "".join(arts)


def spans(h, cls):
    """الكِسَرُ لا تُلتقَط بالتعبير النمطي: بعضُها يحوي <span class='id'>…</span>
    متداخلًا، فيقف اللاقطُ غيرُ الجَشِعِ عند أوّل </span> فيبتُر النصّ."""
    out, i, open_tag = [], 0, '<span class="%s' % cls
    while True:
        a = h.find(open_tag, i)
        if a < 0:
            return out
        a = h.index(">", a) + 1
        depth, j = 1, a
        while depth:
            nxt = min(x for x in (h.find("<span", j), h.find("</span>", j)) if x >= 0)
            if h.startswith("</span>", nxt):
                depth -= 1; j = nxt + 7
            else:
                depth += 1; j = nxt + 5
        out.append(h[a:j - 7]); i = j


got_cards = [norm(x) for x in re.findall(r"<h3>(.*?)</h3>", grid)]
got_k = [norm(x) for x in re.findall(r'<div class="k">(.*?)</div>', grid)]
got_chip = [norm(x) for x in spans(grid, "chip")]

bad = 0
for name, want, got, n in (("موضوع", want_cards, got_cards, 34),
                           ("فرع", want_k, got_k, 162),
                           ("بند", want_chip, got_chip, 363)):
    if len(want) != n or len(got) != n:
        print("✘ %s: المنتظَر %d، من الـmd %d، من الصفحة %d" % (name, n, len(want), len(got)))
        bad += 1
        continue
    diff = [(a, b) for a, b in zip(want, got) if a != b]
    if diff:
        print("✘ %s: %d موضعًا مختلفًا" % (name, len(diff)))
        for a, b in diff[:3]:
            print("   md   : %s\n   html : %s" % (a[:110], b[:110]))
        bad += 1
    else:
        print("✔ %s: %d، مطابقٌ حرفًا بحرف" % (name, n))

# الوسمان الداخليّان: عددُهما وترتيبُهما لا يتغيّران
for tag, rx_md, rx_html in (("غامق", r"\*\*(.+?)\*\*", r"<b>(.*?)</b>"),
                            ("مرجع", r"`([^`]+)`", r"<span class='id'>(.*?)</span>")):
    a = []
    for _, fname in FILES:
        for line in (SUM / fname).read_text(encoding="utf-8").split("\n"):
            if line.startswith(("## ", "### ", "- ")):
                a += [norm(m) for m in re.findall(rx_md, line)]
    b = [norm(m) for m in re.findall(rx_html, grid)]
    if a == b:
        print("✔ %s: %d، مطابق" % (tag, len(a)))
    else:
        print("✘ %s: md %d ≠ html %d" % (tag, len(a), len(b)))
        bad += 1

sys.exit(1 if bad else 0)
