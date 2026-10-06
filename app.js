/* =========================================================
   app.js — logika tools (form, panggil Gemini, tampilkan brief)
   Aturan konten ada di rules.js, bukan di sini.
   ========================================================= */
"use strict";

const LS_SETTINGS = "dipoBrief.settings";
const LS_HISTORY = "dipoBrief.history";
const API_BASE = "https://generativelanguage.googleapis.com/v1beta";
const MAX_HISTORY = 50;

// Dipakai kalau units.json gagal dibaca
const FALLBACK_UNITS = [
  { nama: "Xpander" }, { nama: "Xpander Cross" }, { nama: "Xforce HEV" },
  { nama: "Destinator" }, { nama: "Pajero Sport" }, { nama: "Triton" }, { nama: "L300" }
];

/* ---------- Penyimpanan browser (aman kalau diblokir) ---------- */
const store = {
  get(k, fb) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : fb; } catch (e) { return fb; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } }
};

let settings = Object.assign({}, DEFAULT_SETTINGS, store.get(LS_SETTINGS, {}));
// Kalau browser belum punya key, pakai key bawaan dari rules.js
if (!settings.apiKey && DEFAULT_SETTINGS.apiKey) settings.apiKey = DEFAULT_SETTINGS.apiKey;
let units = [];
let history = store.get(LS_HISTORY, []);
let shown = []; // brief yang sedang tampil: [{id, brief, meta}]

/* ---------- Util ---------- */
const $ = (s, r) => (r || document).querySelector(s);
function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
function arr(x) { return Array.isArray(x) ? x.filter(v => v != null && v !== "") : (x ? [x] : []); }
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
function toast(msg) {
  const t = $("#toast"); t.textContent = msg; t.classList.add("show");
  clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove("show"), 2200);
}
function slug(s) {
  return String(s || "brief").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 50) || "brief";
}

async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; }
  catch (e) {
    try {
      const ta = document.createElement("textarea");
      ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
      document.body.appendChild(ta); ta.select();
      const ok = document.execCommand("copy"); ta.remove(); return ok;
    } catch (e2) { return false; }
  }
}
function download(filename, text) {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/* ---------- Brief → teks (untuk copy / download) ---------- */
function briefToText(b, meta, no) {
  const L = [];
  const line = (k, v) => { if (v) L.push(k + v); };
  L.push("=== BRIEF" + (no ? " " + no : "") + ": " + (b.judul || "-") + " ===");
  line("Objective: ", b.objective);
  line("Unit: ", b.unit);
  line("Durasi: ", b.durasi_detik ? b.durasi_detik + " detik" : "");
  if (meta && meta.platform) line("Platform: ", meta.platform);
  const tal = arr(b.talent).map(t => typeof t === "string" ? t : [t.nama, "(" + [t.gender, t.peran].filter(Boolean).join(", ") + ")"].join(" "));
  line("Talent: ", tal.join("; "));
  line("Konsep: ", b.konsep);
  L.push("");
  const h = b.hook || {};
  L.push("HOOK (" + (h.waktu || "0–3 detik") + ")" + (h.pola ? " — pola: " + h.pola : ""));
  line("- Visual: ", h.visual);
  line("- Dialog: ", h.dialog);
  line("- Teks layar: ", h.teks_layar);
  line("- Kenapa ampuh: ", h.alasan);
  const alts = arr(b.hook_alternatif);
  if (alts.length) {
    L.push("Alternatif hook:");
    alts.forEach((a, i) => L.push((i + 1) + ". [" + (a.pola || "-") + "] Visual: " + (a.visual || "-") + " | Dialog: " + (a.dialog || "-") + " | Teks layar: " + (a.teks_layar || "-")));
  }
  L.push("");
  L.push("ALUR SCENE");
  arr(b.scenes).forEach(s => {
    L.push("[" + (s.waktu || "-") + "] Lokasi: " + (s.lokasi || "-"));
    line("- Visual: ", s.visual);
    line("- Dialog: ", s.dialog);
    line("- Teks layar: ", s.teks_layar);
  });
  const c = b.cta || {};
  L.push("");
  L.push("CTA [" + (c.waktu || "akhir") + "]");
  line("- Visual: ", c.visual);
  line("- Dialog: ", c.dialog);
  line("- Teks layar: ", c.teks_layar);
  L.push("");
  line("PEMICU INTERAKSI: ", b.pemicu_interaksi);
  const list = (title, xs, numbered) => {
    xs = arr(xs); if (!xs.length) return;
    L.push(""); L.push(title);
    xs.forEach((x, i) => L.push((numbered ? (i + 1) + ". " : "- ") + x));
  };
  list("SHOT LIST", b.shot_list, true);
  list("PROPERTI", b.properti);
  if (b.caption) { L.push(""); L.push("CAPTION"); L.push(b.caption); }
  if (arr(b.hashtag).length) { L.push(""); L.push("HASHTAG: " + arr(b.hashtag).join(" ")); }
  list("CATATAN PRODUKSI", b.catatan_produksi);
  list("PERLU VERIFIKASI KE SALES", b.perlu_verifikasi);
  return L.join("\n");
}

/* ---------- Parsing JSON dari AI ---------- */
function parseAIJson(text) {
  let t = String(text || "").trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
  try { return JSON.parse(t); } catch (e) { /* lanjut */ }
  const a = t.indexOf("{"), z = t.lastIndexOf("}");
  if (a >= 0 && z > a) { try { return JSON.parse(t.slice(a, z + 1)); } catch (e) { /* gagal */ } }
  return null;
}

/* ---------- Gemini API ---------- */
function cleanModel(m) { return String(m || "").replace(/^models\//, "").trim(); }

const sleep = ms => new Promise(r => setTimeout(r, ms));

// Urutan model yang dicoba: model pilihan dulu, lalu model flash lain sebagai cadangan
function modelQueue() {
  const saved = store.get(LS_SETTINGS + ".models", []);
  const backups = saved.filter(m => /flash/i.test(m) && !/pro/i.test(m));
  const q = [cleanModel(settings.model)].concat(backups, ["gemini-2.5-flash", "gemini-2.5-flash-lite"]);
  return [...new Set(q.filter(Boolean))].slice(0, 4);
}

// Panggil Gemini dengan retry otomatis + pindah model kalau server penuh / limit habis
async function callGemini(system, user, opts) {
  opts = opts || {};
  if (!settings.apiKey) throw new Error("API key belum diisi. Buka ⚙️ Pengaturan dulu, atau pakai tombol Copy Prompt.");
  const onProgress = opts.onProgress || function () {};
  const models = modelQueue();
  let lastErr = null;
  for (let mi = 0; mi < models.length; mi++) {
    const model = models[mi];
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const text = await callGeminiOnce(model, system, user, opts);
        if (model !== cleanModel(settings.model)) {
          toast("Model " + settings.model + " lagi penuh, otomatis pakai " + model);
        }
        return text;
      } catch (err) {
        lastErr = err;
        const st = err.status || 0;
        const busy = st === 503 || st === 500 || st === 502 || st === 504 || st === 0;
        if (st === 400 || st === 401 || st === 403) throw err;         // masalah key: berhenti
        if (busy && attempt === 1) {                                     // server penuh: coba sekali lagi
          onProgress("Server " + model + " lagi penuh, mencoba ulang…");
          await sleep(2500);
          continue;
        }
        break;                                                           // 404 / 429 / masih penuh: ganti model
      }
    }
    if (mi < models.length - 1) onProgress("Pindah ke model cadangan: " + models[mi + 1] + "…");
  }
  throw lastErr || new Error("Gagal menghubungi Gemini.");
}

async function callGeminiOnce(model, system, user, opts) {
  const body = {
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: "user", parts: [{ text: user }] }],
    generationConfig: { temperature: opts.temperature != null ? opts.temperature : Number(settings.temperature) }
  };
  if (opts.json !== false) body.generationConfig.responseMimeType = "application/json";

  let res;
  try {
    res = await fetch(API_BASE + "/models/" + encodeURIComponent(model) + ":generateContent", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": settings.apiKey },
      body: JSON.stringify(body)
    });
  } catch (e) {
    const ne = new Error("Gagal terhubung ke Gemini. Cek koneksi internet lalu coba lagi.");
    ne.status = 0; throw ne;
  }
  let data = null;
  try { data = await res.json(); } catch (e) { /* kosong */ }
  if (!res.ok) {
    const he = new Error(friendlyError(res.status, data, model));
    he.status = res.status; throw he;
  }

  const cand = data && data.candidates && data.candidates[0];
  const parts = (cand && cand.content && cand.content.parts) || [];
  const text = parts.filter(p => !p.thought && p.text).map(p => p.text).join("");
  if (!text) {
    const reason = (cand && cand.finishReason) || (data && data.promptFeedback && data.promptFeedback.blockReason) || "tidak diketahui";
    throw new Error("Gemini tidak mengembalikan jawaban (alasan: " + reason + "). Coba Generate lagi atau ubah ide/angle.");
  }
  return text;
}

function friendlyError(status, data, model) {
  const msg = (data && data.error && data.error.message) || "";
  model = model || settings.model;
  if (status === 503) return "Semua model Gemini yang dicoba lagi penuh (503). Ini gangguan sementara dari server Google — coba lagi 1–2 menit lagi, atau pakai Copy Prompt.";
  if (status === 429) return "Limit gratis sedang penuh (terlalu banyak request). Tunggu ±1 menit lalu coba lagi. Kalau masih gagal, limit harian habis — coba besok, ganti model di Pengaturan, atau pakai Copy Prompt.";
  if (status === 400 && /api key/i.test(msg)) return "API key tidak valid. Cek lagi di ⚙️ Pengaturan (pastikan tidak ada spasi terbawa).";
  if (status === 403) return "API key ditolak (403). Pastikan key dibuat di aistudio.google.com/apikey dan Gemini API aktif.";
  if (status === 404) return "Model \"" + model + "\" tidak ditemukan atau sudah pensiun. Buka ⚙️ Pengaturan → klik \"Cek model\" → Simpan.";
  if (status >= 500) return "Server Gemini sedang bermasalah (" + status + "). Coba lagi sebentar.";
  return "Error " + status + (msg ? ": " + msg : "");
}

async function fetchModels(key) {
  const res = await fetch(API_BASE + "/models?pageSize=200", { headers: { "x-goog-api-key": key } });
  let data = null;
  try { data = await res.json(); } catch (e) { /* kosong */ }
  if (!res.ok) throw new Error(friendlyError(res.status, data, "-"));
  const bad = /(image|tts|audio|live|embedding|vision|learnlm|robotics|computer-use|aqa|veo|imagen|native)/i;
  const names = ((data && data.models) || [])
    .filter(m => (m.supportedGenerationMethods || []).includes("generateContent"))
    .map(m => cleanModel(m.name))
    .filter(n => /^gemini/i.test(n) && !bad.test(n));
  const score = n => (/flash/i.test(n) ? 10 : 0) - (/lite/i.test(n) ? 2 : 0) - (/pro/i.test(n) ? 20 : 0)
    - (/(preview|exp)/i.test(n) ? 3 : 0) - (/latest/i.test(n) ? 1 : 0);
  const ver = n => { const m = n.match(/gemini-(\d+(?:\.\d+)?)/i); return m ? parseFloat(m[1]) : 0; };
  return [...new Set(names)].sort((a, b) => score(b) - score(a) || ver(b) - ver(a) || a.localeCompare(b));
}

/* ---------- Form → input ---------- */
function readForm() {
  const unitVal = $("#unit").value;
  let unitLabel, unitData;
  if (unitVal === "__bebas") {
    unitLabel = "bebas — pilih unit yang paling cocok dari DATA UNIT";
    unitData = units;
  } else if (unitVal === "__umum") {
    unitLabel = "tidak fokus ke satu unit (konten umum tentang dealer/beli mobil Mitsubishi)";
    unitData = units;
  } else {
    unitLabel = unitVal;
    unitData = units.filter(u => u.nama === unitVal);
  }
  return {
    objective: document.querySelector('input[name="objective"]:checked').value,
    unitLabel, unitData,
    talent: $("#talent").value,
    durasi: $("#durasi").value,
    platform: $("#platform").value,
    angle: $("#angle").value,
    jumlah: Number($("#jumlah").value) || 1
  };
}

/* ---------- Render ---------- */
function kvRow(label, val) { return val ? "<dt>" + esc(label) + "</dt><dd>" + esc(val) + "</dd>" : ""; }
function listHtml(xs, ordered) {
  xs = arr(xs); if (!xs.length) return "";
  const tag = ordered ? "ol" : "ul";
  return "<" + tag + ' class="clean">' + xs.map(x => "<li>" + esc(x) + "</li>").join("") + "</" + tag + ">";
}
function sceneHtml(s, isCta) {
  return '<div class="scene' + (isCta ? " cta" : "") + '">' +
    '<div><div class="time">' + esc(s.waktu || "") + "</div>" +
    '<div class="loc">' + esc(isCta ? "CTA" : (s.lokasi || "")) + "</div></div>" +
    "<div>" +
    (s.visual ? '<p><span class="lbl">Visual:</span> ' + esc(s.visual) + "</p>" : "") +
    (s.dialog ? '<p><span class="lbl">Dialog:</span> ' + esc(s.dialog) + "</p>" : "") +
    (s.teks_layar ? '<p><span class="lbl">Teks layar:</span> ' + esc(s.teks_layar) + "</p>" : "") +
    "</div></div>";
}

function briefHtml(item, no) {
  const b = item.brief, m = item.meta || {};
  const h = b.hook || {};
  const talent = arr(b.talent).map(t => typeof t === "string" ? t : t.nama + " — " + [t.gender, t.peran].filter(Boolean).join(", "));
  const altHooks = arr(b.hook_alternatif).map((a, i) =>
    '<div class="alt"><div class="alt-top"><b>Alternatif ' + (i + 1) + (a.pola ? " · " + esc(a.pola) : "") + "</b>" +
    '<button class="btn ghost small" data-act="usehook" data-id="' + item.id + '" data-i="' + i + '" type="button">Pakai ini</button></div>' +
    '<dl class="kv">' + kvRow("Visual", a.visual) + kvRow("Dialog", a.dialog) + kvRow("Teks layar", a.teks_layar) + "</dl></div>"
  ).join("");

  return '<article class="card brief" id="b-' + item.id + '">' +
    '<div class="brief-head"><div class="chips">' +
      '<span class="chip obj">' + esc(b.objective || m.objective || "") + "</span>" +
      (b.unit ? '<span class="chip">🚗 ' + esc(b.unit) + "</span>" : "") +
      (b.durasi_detik ? '<span class="chip">⏱ ' + esc(b.durasi_detik) + " detik</span>" : "") +
      (m.platform ? '<span class="chip">📱 ' + esc(m.platform) + "</span>" : "") +
    "</div>" +
    "<h3>" + (no ? no + ". " : "") + esc(b.judul || "Tanpa judul") + "</h3>" +
    (b.konsep ? '<p class="konsep">' + esc(b.konsep) + "</p>" : "") +
    "</div>" +

    '<div class="brief-body">' +
      (talent.length ? '<div class="sec"><h4>Talent</h4>' + listHtml(talent) + "</div>" : "") +

      '<div class="sec"><h4>Hook · 3 detik pertama</h4><div class="hook-box">' +
        '<div class="tag">' + esc(h.waktu || "0–3 detik") + (h.pola ? " · " + esc(h.pola) : "") + "</div>" +
        '<dl class="kv">' + kvRow("Visual", h.visual) + kvRow("Dialog", h.dialog) + kvRow("Teks layar", h.teks_layar) + kvRow("Kenapa ampuh", h.alasan) + "</dl>" +
      "</div>" +
      '<div class="alt-hooks" id="alts-' + item.id + '">' + altHooks + "</div></div>" +

      '<div class="sec"><h4>Alur scene</h4><div class="timeline">' +
        arr(b.scenes).map(s => sceneHtml(s, false)).join("") +
        (b.cta ? sceneHtml(b.cta, true) : "") +
      "</div></div>" +

      (b.pemicu_interaksi ? '<div class="sec"><h4>Pemicu interaksi</h4><p style="margin:0">' + esc(b.pemicu_interaksi) + "</p></div>" : "") +
      (arr(b.shot_list).length ? '<div class="sec"><h4>Shot list</h4>' + listHtml(b.shot_list, true) + "</div>" : "") +
      (arr(b.properti).length ? '<div class="sec"><h4>Properti</h4>' + listHtml(b.properti) + "</div>" : "") +
      (b.caption ? '<div class="sec"><h4>Caption</h4><div class="caption">' + esc(b.caption) +
        (arr(b.hashtag).length ? "\n\n" + esc(arr(b.hashtag).join(" ")) : "") + "</div></div>" : "") +
      (arr(b.catatan_produksi).length ? '<div class="sec"><h4>Catatan produksi</h4>' + listHtml(b.catatan_produksi) + "</div>" : "") +
      (arr(b.perlu_verifikasi).length ? '<div class="sec verify"><h4>⚠️ Cek ke sales sebelum syuting</h4>' + listHtml(b.perlu_verifikasi) + "</div>" : "") +
    "</div>" +

    '<div class="brief-foot">' +
      '<button class="btn primary small" data-act="copy" data-id="' + item.id + '" type="button">📋 Salin brief</button>' +
      '<button class="btn secondary small" data-act="copycap" data-id="' + item.id + '" type="button">Salin caption</button>' +
      '<button class="btn secondary small" data-act="download" data-id="' + item.id + '" type="button">⬇️ Download .txt</button>' +
      '<button class="btn secondary small" data-act="newhooks" data-id="' + item.id + '" type="button">🔁 3 hook baru</button>' +
    "</div></article>";
}

function renderResults() {
  const box = $("#results");
  box.innerHTML = shown.map((it, i) => it.raw
    ? '<article class="card brief"><div class="brief-head"><h3>Hasil (format tidak terbaca otomatis)</h3><p class="konsep">Isinya tetap bisa dipakai — salin manual di bawah.</p></div><div class="raw">' + esc(it.raw) + "</div></article>"
    : briefHtml(it, shown.length > 1 ? i + 1 : 0)
  ).join("");
}

function setStatus(msg, type) {
  const s = $("#status");
  if (!msg) { s.classList.add("hidden"); return; }
  s.className = "status" + (type === "error" ? " error" : "");
  s.innerHTML = (type === "loading" ? '<div class="spinner"></div>' : "") + "<div>" + esc(msg) + "</div>";
}

/* ---------- Riwayat ---------- */
function saveHistory() {
  history = history.slice(0, MAX_HISTORY);
  store.set(LS_HISTORY, history);
}
function upsertHistory(item) {
  const i = history.findIndex(h => h.id === item.id);
  const rec = { id: item.id, brief: item.brief, meta: item.meta, at: item.at || Date.now() };
  if (i >= 0) history[i] = rec; else history.unshift(rec);
  saveHistory();
}
function renderHistory() {
  const box = $("#historyList");
  if (!history.length) { box.innerHTML = '<p class="muted small-text">Belum ada riwayat.</p>'; return; }
  box.innerHTML = history.map(h => {
    const d = new Date(h.at);
    const tgl = d.toLocaleDateString("id-ID", { day: "numeric", month: "short" }) + " " + d.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
    return '<div class="h-item" data-hid="' + h.id + '"><div class="h-row"><div><b>' + esc(h.brief.judul || "Tanpa judul") + "</b>" +
      "<span>" + esc([h.brief.objective, h.brief.unit, tgl].filter(Boolean).join(" · ")) + "</span></div>" +
      '<button class="btn ghost small" data-hdel="' + h.id + '" type="button" title="Hapus">🗑</button></div></div>';
  }).join("");
}
function openDrawer(open) {
  $("#historyPanel").classList.toggle("open", open);
  $("#historyPanel").setAttribute("aria-hidden", String(!open));
  $("#backdrop").classList.toggle("hidden", !open);
  if (open) renderHistory();
}

/* ---------- Aksi utama ---------- */
async function onGenerate(e) {
  e.preventDefault();
  const input = readForm();
  const btn = $("#btnGenerate");
  btn.disabled = true;
  setStatus("Lagi bikin " + input.jumlah + " brief… biasanya 10–40 detik.", "loading");
  try {
    const text = await callGemini(buildSystemPrompt(settings), buildUserPrompt(input, input.unitData, "json"),
      { onProgress: m => setStatus(m, "loading") });
    const data = parseAIJson(text);
    const briefs = data && (Array.isArray(data.briefs) ? data.briefs : (Array.isArray(data) ? data : (data.judul ? [data] : null)));
    const meta = { objective: input.objective, platform: input.platform };
    if (!briefs || !briefs.length) {
      shown = [{ id: uid(), raw: text }];
    } else {
      shown = briefs.map(b => ({ id: uid(), brief: b, meta, at: Date.now() }));
      shown.slice().reverse().forEach(upsertHistory);
    }
    renderResults();
    setStatus("");
    $("#results").scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (err) {
    setStatus(err.message, "error");
  } finally {
    btn.disabled = false;
  }
}

async function onCopyPrompt() {
  const input = readForm();
  const full = "=== INSTRUKSI (ikuti semua aturan ini) ===\n" + buildSystemPrompt(settings) +
    "\n\n=== PERMINTAAN ===\n" + buildUserPrompt(input, input.unitData, "text");
  const ok = await copyText(full);
  if (ok) toast("Prompt tersalin — tempel di Gemini / ChatGPT / Claude");
  else { $("#promptText").value = full; $("#promptDialog").showModal(); }
}

function findShown(id) { return shown.find(s => s.id === id) || history.find(h => h.id === id); }

async function onResultClick(e) {
  const btn = e.target.closest("button[data-act]");
  if (!btn) return;
  const id = btn.dataset.id;
  const item = shown.find(s => s.id === id);
  if (!item) return;
  const no = shown.length > 1 ? shown.indexOf(item) + 1 : 0;
  const act = btn.dataset.act;

  if (act === "copy") {
    toast((await copyText(briefToText(item.brief, item.meta, no))) ? "Brief tersalin" : "Gagal menyalin");
  } else if (act === "copycap") {
    const b = item.brief;
    const cap = (b.caption || "") + (arr(b.hashtag).length ? "\n\n" + arr(b.hashtag).join(" ") : "");
    toast((await copyText(cap)) ? "Caption tersalin" : "Gagal menyalin");
  } else if (act === "download") {
    download("brief-" + slug(item.brief.judul) + ".txt", briefToText(item.brief, item.meta, no));
  } else if (act === "usehook") {
    const i = Number(btn.dataset.i);
    const alts = arr(item.brief.hook_alternatif);
    const pick = alts[i]; if (!pick) return;
    alts[i] = item.brief.hook;          // hook lama pindah ke alternatif
    item.brief.hook = Object.assign({ waktu: "0–3 detik" }, pick);
    item.brief.hook_alternatif = alts;
    upsertHistory(item); renderResults();
    toast("Hook diganti — cek lagi nyambung atau nggak ke scene pertama");
  } else if (act === "newhooks") {
    btn.disabled = true; const old = btn.textContent; btn.textContent = "⏳ Bikin hook…";
    try {
      const text = await callGemini(buildSystemPrompt(settings), buildHookPrompt(item.brief));
      const data = parseAIJson(text);
      const hooks = data && arr(data.hooks);
      if (!hooks || !hooks.length) throw new Error("Format hook tidak terbaca, coba lagi.");
      item.brief.hook_alternatif = hooks.concat(arr(item.brief.hook_alternatif)).slice(0, 5);
      upsertHistory(item); renderResults();
      toast(hooks.length + " hook baru ditambahkan di bawah hook utama");
    } catch (err) {
      toast(err.message);
      btn.disabled = false; btn.textContent = old;
    }
  }
}

/* ---------- Pengaturan ---------- */
function fillModelSelect(list, selected) {
  const sel = $("#model");
  const items = list && list.length ? list.slice() : [];
  if (selected && !items.includes(selected)) items.unshift(selected);
  sel.innerHTML = items.map(m => '<option value="' + esc(m) + '"' + (m === selected ? " selected" : "") + ">" + esc(m) + "</option>").join("");
}
function openSettings() {
  $("#apiKey").value = settings.apiKey || "";
  fillModelSelect(store.get(LS_SETTINGS + ".models", []), settings.model);
  $("#dealerName").value = settings.dealerName;
  $("#ctaInfo").value = settings.ctaInfo || "";
  $("#temperature").value = settings.temperature;
  $("#tempVal").textContent = settings.temperature;
  $("#settingsDialog").showModal();
}
async function onCheckModels() {
  const key = $("#apiKey").value.trim();
  const hint = $("#modelHint");
  if (!key) { hint.textContent = "Isi API key dulu."; return; }
  hint.textContent = "Mengecek model yang tersedia…";
  try {
    const list = await fetchModels(key);
    if (!list.length) { hint.textContent = "Tidak ada model yang cocok ditemukan. Biarkan model default."; return; }
    store.set(LS_SETTINGS + ".models", list);
    fillModelSelect(list, list[0]);
    hint.textContent = "✅ API key valid. Model terpilih otomatis: " + list[0] + " (Flash = gratis & cepat). Klik Simpan.";
  } catch (err) {
    hint.textContent = "❌ " + err.message;
  }
}
function onSaveSettings() {
  settings.apiKey = $("#apiKey").value.trim() || DEFAULT_SETTINGS.apiKey || "";
  settings.model = cleanModel($("#model").value) || DEFAULT_SETTINGS.model;
  settings.dealerName = $("#dealerName").value.trim() || DEFAULT_SETTINGS.dealerName;
  settings.ctaInfo = $("#ctaInfo").value.trim();
  settings.temperature = Number($("#temperature").value) || DEFAULT_SETTINGS.temperature;
  const ok = store.set(LS_SETTINGS, settings);
  $("#settingsDialog").close();
  updateKeyWarning();
  toast(ok ? "Pengaturan disimpan" : "Tersimpan sementara (browser memblokir penyimpanan — isi ulang kalau halaman dibuka lagi)");
}
function updateKeyWarning() { $("#keyWarning").classList.toggle("hidden", !!settings.apiKey); }

/* ---------- Data unit ---------- */
async function loadUnits() {
  try {
    const r = await fetch("units.json", { cache: "no-store" });
    if (!r.ok) throw new Error("http " + r.status);
    const d = await r.json();
    units = arr(d.units).filter(u => u && u.nama);
    if (!units.length) throw new Error("kosong");
  } catch (e) {
    units = FALLBACK_UNITS;
  }
  $("#unit").innerHTML =
    '<option value="__bebas">Bebas (AI pilih unit paling cocok)</option>' +
    '<option value="__umum">Tanpa unit spesifik (konten umum dealer)</option>' +
    units.map(u => '<option value="' + esc(u.nama) + '">' + esc(u.nama) + "</option>").join("");
}

/* ---------- Init ---------- */
function init() {
  loadUnits();
  updateKeyWarning();

  $("#briefForm").addEventListener("submit", onGenerate);
  $("#btnCopyPrompt").addEventListener("click", onCopyPrompt);
  $("#results").addEventListener("click", onResultClick);

  $("#btnSettings").addEventListener("click", openSettings);
  $("#btnSaveSettings").addEventListener("click", onSaveSettings);
  $("#btnCancelSettings").addEventListener("click", () => $("#settingsDialog").close());
  $("#btnCheckModels").addEventListener("click", onCheckModels);
  $("#btnToggleKey").addEventListener("click", () => {
    const k = $("#apiKey"); k.type = k.type === "password" ? "text" : "password";
  });
  $("#temperature").addEventListener("input", e => { $("#tempVal").textContent = e.target.value; });

  $("#btnClosePrompt").addEventListener("click", () => $("#promptDialog").close());
  $("#btnCopyPromptAgain").addEventListener("click", async () => {
    const ta = $("#promptText"); ta.select();
    toast((await copyText(ta.value)) ? "Prompt tersalin" : "Blok teksnya lalu salin manual");
  });

  $("#btnHistory").addEventListener("click", () => openDrawer(true));
  $("#btnCloseHistory").addEventListener("click", () => openDrawer(false));
  $("#backdrop").addEventListener("click", () => openDrawer(false));
  $("#historyList").addEventListener("click", e => {
    const del = e.target.closest("[data-hdel]");
    if (del) {
      e.stopPropagation();
      history = history.filter(h => h.id !== del.dataset.hdel); saveHistory(); renderHistory(); return;
    }
    const it = e.target.closest("[data-hid]");
    if (!it) return;
    const h = history.find(x => x.id === it.dataset.hid);
    if (!h) return;
    shown = [{ id: h.id, brief: h.brief, meta: h.meta, at: h.at }];
    renderResults(); setStatus(""); openDrawer(false);
  });
  $("#btnClearHistory").addEventListener("click", () => {
    if (!history.length) return;
    if (confirm("Hapus semua riwayat brief?")) { history = []; saveHistory(); renderHistory(); }
  });
}

if (typeof document !== "undefined") document.addEventListener("DOMContentLoaded", init);
