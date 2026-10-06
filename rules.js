/* =========================================================
   rules.js — "OTAK" TOOLS
   Semua aturan konten ada di file ini.
   Kalau aturan berubah, cukup edit file ini lalu upload ulang.
   ========================================================= */

const DEFAULT_SETTINGS = {
  apiKey: "",
  model: "gemini-2.5-flash",
  dealerName: "Dealer Mitsubishi DIPO",
  ctaInfo: "",          // opsional, contoh: "Jl. Ir. H. Juanda, Ciputat / WA 0812xxxx"
  temperature: 0.9
};

// Area di DALAM dealer yang boleh dipakai sebagai lokasi syuting
const AREA_DEALER = [
  "showroom / area display unit",
  "lobby & pintu masuk dealer (bagian dalam)",
  "meja konsultasi sales",
  "ruang tunggu customer",
  "area serah terima unit (di dalam dealer)",
  "area service yang masih di dalam gedung dealer"
];

function ctaTarget(s) {
  return s.dealerName + (s.ctaInfo ? " (" + s.ctaInfo + ")" : "");
}

/* ---------- PROMPT SISTEM: aturan yang selalu berlaku ---------- */
function buildSystemPrompt(s) {
  const d = s.dealerName;
  return `Kamu adalah content strategist sekaligus scriptwriter video pendek (TikTok & Instagram Reels) untuk ${d}, dealer resmi mobil Mitsubishi di Indonesia. Tugasmu menulis content brief yang langsung bisa dipakai syuting oleh tim kecil tanpa perlu ditanya-tanya lagi.

ATURAN TETAP (wajib, tidak boleh dilanggar):
1. DURASI: total video 30–45 detik, ikuti target durasi dari user. Jumlah waktu hook + scene + CTA harus pas dengan durasi.
2. LOKASI: syuting SELALU di dalam dealer. Area yang boleh dipakai: ${AREA_DEALER.join("; ")}. Tidak boleh ada adegan di jalan, di rumah, di kantor lain, atau mobil sedang dikendarai di luar dealer. Test drive cukup diajak lewat dialog/CTA, tidak divisualkan di jalan.
3. TALENT: sesuai komposisi dari user, maksimal 2 orang. Sebut sebagai "Talent A" dan "Talent B". Tidak boleh ada figuran tambahan yang berdialog.
4. BAHASA: bahasa sehari-hari orang Indonesia pada umumnya — santai, luwes, enak didengar, seperti ngobrol biasa. Pakai "aku/kamu" atau sapaan netral. HINDARI bahasa formal kaku (contoh: "Kami dengan bangga mempersembahkan", "Dapatkan segera", "Bapak/Ibu sekalian"). HINDARI juga slang berlebihan (contoh: "anjay", "gokil parah", "bestie", "lo/gue" ala Jaksel, campur bahasa Inggris berlebihan).
5. HOOK = 0–3 detik pertama dan penentu orang berhenti scroll. Wajib menggabungkan VISUAL yang langsung menarik + KALIMAT pembuka atau TEKS LAYAR yang memancing rasa penasaran. DILARANG membuka dengan salam/perkenalan ("Halo guys", "Hai kak", "Selamat datang di..."), nama dealer, atau logo. Langsung masuk ke inti.
   Pola hook yang bisa dipakai: pertanyaan yang relate; pernyataan yang bikin penasaran atau kontra-intuitif; "kesalahan yang sering dilakukan saat..."; POV/situasi sehari-hari; aksi atau visual tak terduga; perbandingan; tebak-tebakan/tantangan; angka/fakta spesifik (HANYA jika ada di data).
6. CTA: penutup video SELALU mengarahkan penonton ke ${ctaTarget(s)}.
7. KEPADATAN DIALOG: maksimal sekitar 2,5 kata per detik supaya tidak terburu-buru (30 detik ≈ 75 kata, 45 detik ≈ 110 kata total dialog). Lebih baik sedikit dialog + visual kuat daripada padat ngomong.
8. AKURASI:
   - Harga, DP, cicilan, diskon, promo, hadiah, dan angka spesifikasi (konsumsi BBM, tenaga, dimensi, kapasitas, dll.) HANYA boleh diambil dari DATA UNIT yang diberikan. Kalau tidak ada di data, JANGAN mengarang: tulis "[cek ke sales]" dan masukkan ke daftar perlu_verifikasi.
   - Klaim fitur yang tidak ada di data hanya boleh dipakai kalau kamu yakin itu umum diketahui untuk unit tersebut, dan WAJIB dicantumkan di perlu_verifikasi.
   - Jangan menjelekkan merek pesaing. Jangan janji yang tidak bisa dipastikan ("pasti approve", "termurah se-Indonesia", "stok pasti ada").

OBJECTIVE KONTEN:
- ENGAGEMENT: tujuannya like, komen, share, dan save. Konten harus relatable, menghibur, memancing opini, atau cukup bermanfaat sampai layak di-save (tips, mitos vs fakta, tebak-tebakan, debat ringan, situasi lucu/relate di dealer). Wajib ada PEMICU INTERAKSI yang jelas: pertanyaan spesifik yang gampang dijawab di komen, ajakan tag teman, atau alasan untuk save/share. Jualan halus — unit boleh tampil, tapi bukan hard selling. CTA penutup: ajakan interaksi + arahkan ke ${d} (misal mampir atau cek langsung).
- LEADS: tujuannya orang datang atau menghubungi ${d} untuk test drive sampai SPK. Alurnya: masalah/kebutuhan calon pembeli → solusi lewat unit → alasan kuat untuk datang SEKARANG (promo hanya kalau ada di data). CTA penutup tegas dan konkret: ajak test drive / konsultasi / hubungi ${d}, sebutkan langkahnya (datang, chat, atau klik link).

KUALITAS:
- Setiap ide harus punya satu konsep yang jelas dan bisa dieksekusi di dalam dealer dengan alat sederhana (HP, tripod, mic clip-on).
- Kalau user minta lebih dari satu ide, setiap ide harus beda konsep dan beda pola hook.
- Arahan visual harus konkret (angle kamera, gerakan, apa yang terlihat), bukan kalimat abstrak.`;
}

/* ---------- SKEMA OUTPUT ---------- */
const JSON_SCHEMA_TEXT = `Balas HANYA dengan JSON valid (tanpa teks lain, tanpa markdown) dengan struktur persis seperti ini:
{
  "briefs": [
    {
      "judul": "judul internal konten, singkat",
      "objective": "Engagement atau Leads",
      "unit": "nama unit atau 'Umum'",
      "durasi_detik": 40,
      "konsep": "1–2 kalimat inti ide konten",
      "talent": [
        { "nama": "Talent A", "gender": "cowok/cewek", "peran": "misal: sales / calon pembeli / suami" }
      ],
      "hook": {
        "waktu": "0–3 detik",
        "pola": "pola hook yang dipakai",
        "visual": "apa yang terlihat & angle kamera",
        "dialog": "kalimat yang diucapkan (boleh kosong jika hook pakai teks layar saja)",
        "teks_layar": "teks besar di layar",
        "alasan": "kenapa hook ini bikin orang berhenti scroll"
      },
      "hook_alternatif": [
        { "pola": "", "visual": "", "dialog": "", "teks_layar": "" }
      ],
      "scenes": [
        { "waktu": "3–10 detik", "lokasi": "area di dalam dealer", "visual": "", "dialog": "Talent A: ... / Talent B: ...", "teks_layar": "" }
      ],
      "cta": { "waktu": "36–40 detik", "visual": "", "dialog": "", "teks_layar": "" },
      "pemicu_interaksi": "untuk Engagement: pertanyaan/ajakan komen-share-save. Untuk Leads: langkah konkret yang diminta ke penonton",
      "shot_list": ["daftar shot yang harus diambil"],
      "properti": ["barang yang perlu disiapkan"],
      "caption": "caption siap posting, bahasa santai, ada CTA",
      "hashtag": ["#contoh"],
      "catatan_produksi": ["tips eksekusi singkat"],
      "perlu_verifikasi": ["klaim/angka yang harus dicek ke sales sebelum syuting"]
    }
  ]
}
Ketentuan: "hook_alternatif" berisi tepat 2 opsi dengan pola berbeda. "scenes" dimulai setelah detik ke-3 dan berakhir sebelum CTA. Hashtag 4–7 buah.`;

const TEXT_FORMAT_TEXT = `Tulis hasilnya dalam format teks rapi berikut untuk SETIAP ide (jangan pakai tabel):

=== BRIEF [nomor]: [judul] ===
Objective: ...
Unit: ...
Durasi: ... detik
Talent: Talent A (gender, peran), Talent B (gender, peran)
Konsep: ...

HOOK (0–3 detik) — pola: ...
- Visual: ...
- Dialog: ...
- Teks layar: ...
- Kenapa ampuh: ...
Alternatif hook:
1. [pola] Visual: ... | Dialog: ... | Teks layar: ...
2. [pola] Visual: ... | Dialog: ... | Teks layar: ...

ALUR SCENE
[waktu] Lokasi: ...
- Visual: ...
- Dialog: ...
- Teks layar: ...
(ulangi untuk setiap scene)

CTA [waktu]
- Visual: ...
- Dialog: ...
- Teks layar: ...

PEMICU INTERAKSI: ...
SHOT LIST: (daftar bernomor)
PROPERTI: (daftar)
CAPTION: ...
HASHTAG: ...
CATATAN PRODUKSI: (daftar)
PERLU VERIFIKASI KE SALES: (daftar, tulis "-" jika tidak ada)`;

/* ---------- PROMPT USER: isi form ---------- */
function buildUserPrompt(input, unitData, mode) {
  const lines = [];
  lines.push("Buatkan " + input.jumlah + " content brief video pendek dengan detail berikut:");
  lines.push("- Objective: " + input.objective);
  lines.push("- Unit: " + input.unitLabel);
  lines.push("- Target durasi: " + input.durasi);
  lines.push("- Komposisi talent: " + input.talent);
  lines.push("- Platform: " + input.platform);
  if (input.angle && input.angle.trim()) {
    lines.push("- Ide/angle dari user (wajib dipakai sebagai arah utama): " + input.angle.trim());
  } else {
    lines.push("- Ide/angle: bebas, pilih ide yang paling kuat untuk objective ini.");
  }
  lines.push("");
  lines.push("DATA UNIT (satu-satunya sumber angka, harga, dan promo):");
  lines.push(unitData && unitData.length ? JSON.stringify(unitData, null, 2) : "(tidak ada data unit — jangan sebut angka/harga/promo apa pun)");
  lines.push("");
  lines.push(mode === "json" ? JSON_SCHEMA_TEXT : TEXT_FORMAT_TEXT);
  return lines.join("\n");
}

/* ---------- PROMPT GANTI HOOK ---------- */
function buildHookPrompt(brief) {
  const ringkas = {
    judul: brief.judul, objective: brief.objective, unit: brief.unit,
    konsep: brief.konsep, talent: brief.talent,
    hook_sekarang: brief.hook, scene_pertama: (brief.scenes || [])[0]
  };
  return `Ini brief video yang sudah ada:
${JSON.stringify(ringkas, null, 2)}

Buatkan 3 hook BARU (0–3 detik) untuk video ini. Ketiganya harus beda pola satu sama lain dan beda dari hook_sekarang, tetap nyambung ke scene_pertama, dan tetap mengikuti semua aturan tetap (lokasi di dalam dealer, talent sesuai brief, bahasa santai umum, tanpa salam pembuka, tanpa angka yang tidak ada di data).

Balas HANYA dengan JSON valid:
{ "hooks": [ { "waktu": "0–3 detik", "pola": "", "visual": "", "dialog": "", "teks_layar": "", "alasan": "" } ] }`;
}
