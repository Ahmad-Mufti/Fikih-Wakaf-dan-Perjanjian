# Cara merevisi teks dan membangun ulang

Naskah dan tampilan terpisah. Yang direvisi hanya berkas Markdown di
`sumber/`; `index.html` **selalu** hasil bangun — jangan pernah disunting
langsung, karena tiap pembangunan berikutnya akan menimpanya.

## 1. Revisi naskahnya

Buka salah satu dari empat berkas ini dengan editor teks apa pun:

| Berkas | Kitab | Topik |
|---|---|---|
| `sumber/s1-waqf-hanbali.md` | الشرح الممتع — Hanbali | 13 |
| `sumber/s2-waqf-syafii.md` | المعتمد — Syafi'i | 11 |
| `sumber/s3-ayman.md` | صحيح فقه السنة — Aiman | 6 |
| `sumber/s4-nudzur.md` | صحيح فقه السنة — Nudzur | 4 |

Tiga tanda saja, sesuai tiga tingkat peta:

```markdown
## 1. التصوُّر الإجمالي      ← topik    (planet / kartu)

### التعريف لغةً             ← cabang   (simpul lapis pertama)

- الحبس                      ← butir    (simpul lapis kedua)
- «وقف يقف وُقوفًا» لازم
```

Dan dua penanda di dalam teks, tidak ada yang lain:

| Ditulis | Jadinya |
|---|---|
| `**نصّ**` | **tebal** — yang dihafal atau pilihan Ustadz |
| `` `UU 41/2004` `` | rujukan Latin, ditampilkan dari kiri |

Aturan yang dijaga skrip — melanggarnya menghentikan pembangunan disertai
nomor barisnya:

- Nomor `##` harus berurutan dari 1, tanpa lompat.
- Tiap `##` punya sekurangnya satu `###`; tiap `###` sekurangnya satu `-`.
- Jangan menulis tag HTML.
- Jangan menggabung dua butir dalam satu baris dengan «·» — satu baris satu
  butir. Tanda «·» di dalam `**…**` tidak apa-apa, itu satu kesatuan.

Menambah atau membuang topik boleh; jumlahnya diperiksa terhadap angka yang
tercatat di `build/build.py` (`TABS`), jadi ubah angka di sana bila memang
disengaja.

## 2. Bangun ulang

```sh
python3 build/build.py
```

Keluarannya menyebut jumlah topik, cabang, dan butir. `index.html` di akar
repositori tertimpa dengan yang baru — satu berkas, tanpa pemasangan apa pun,
tetap jalan tanpa internet.

## 3. Periksa

```sh
python3 build/verify.py
```

Membaca `sumber/*.md` dan `index.html` masing-masing sendiri, lalu
membandingkan naskahnya huruf demi huruf. Lulusnya berarti `index.html` memang
lahir dari sumber yang ada sekarang dan tidak ada satu huruf pun yang hilang di
jalan.

Uji tampilan (perlu Node dan Playwright, di luar repositori ini):

```sh
node build/test.mjs index.html
```

## Isi map ini

| | |
|---|---|
| `build.py` | perakit: Markdown + kerangka → `index.html` |
| `verify.py` | pembuktian naskah tak berubah |
| `test.mjs` | 98 pemeriksaan tampilan, cetak, dan interaksi |
| `app.css`, `app.js` | tampilan dan perilaku peta |
| `vendor/` | GSAP 3.15 + DrawSVGPlugin, ditanam agar jalan tanpa internet |
| `../sumber/kerangka.html` | sampul, peringatan, level, tabel kunci, panji tiap kitab, kaki halaman — dan font Amiri. Disalin verbatim dari peta cetak aslinya; jarang perlu disentuh. |

Berkas di `arsip/` bukan hasil bangun: keduanya naskah tersendiri yang
dikeluarkan dari peta dan disimpan apa adanya.
