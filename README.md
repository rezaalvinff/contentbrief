# Brief Generator — Dealer Mitsubishi DIPO

Tools gratis untuk bikin content brief video 30–45 detik (Engagement / Leads) otomatis pakai Gemini API (free tier), di-hosting di GitHub Pages.

## Isi file
| File | Fungsi |
|---|---|
| `index.html` | Halaman utama |
| `style.css` | Tampilan |
| `app.js` | Logika (panggil Gemini, tampilkan brief, riwayat) |
| `rules.js` | **Aturan konten** — ubah di sini kalau format/aturan berubah |
| `units.json` | **Data unit & promo** — satu-satunya sumber harga/angka untuk AI |

## Pasang (sekali saja)
1. GitHub → **New repository** → nama `content-brief` → **Public** → Create.
2. Klik **uploading an existing file** → drag kelima file di atas → **Commit changes**.
3. **Settings → Pages** → Source: *Deploy from a branch* → Branch: `main` / `(root)` → **Save**.
4. Tunggu 1–2 menit, buka `https://USERNAME.github.io/content-brief/`.

## API key Gemini (gratis)
1. Buka https://aistudio.google.com/apikey → login Google → **Create API key** → salin.
2. Di tools: **⚙️ Pengaturan** → tempel key → **🔄 Cek model** → **Simpan**.

Key cuma tersimpan di browser yang lo pakai, tidak masuk ke GitHub. Ganti HP/laptop = paste ulang sekali.

## Update data unit / aturan
Di GitHub buka file `units.json` (atau `rules.js`) → ikon ✏️ → edit → **Commit changes**. Web otomatis ter-update dalam 1–2 menit.

## Kalau error
- **Limit penuh (429):** tunggu 1 menit; kalau masih, limit harian habis → pakai **📋 Copy Prompt** lalu tempel ke Gemini/ChatGPT/Claude.
- **Model tidak ditemukan (404):** Pengaturan → Cek model → Simpan.
- Jangan masukkan data pelanggan/leads ke tools ini (free tier Gemini boleh dipakai Google untuk training). 
