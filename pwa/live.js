"use strict";
/* Live parts from the free Cloudflare cron (wallets, reminders, Today digest) + sleep log + optional device pairing/sync + Web Push.
   Uses app.js globals (D, ST, card, esc, money, render, todayET, weekSpend) and Coach at call time. Never moves funds or signs anything. */
let LIVE = JSON.parse(localStorage.getItem("mc-live") || "null");
const LK = "mc-devkey", SK = "mc-sleep", DK = "mc-dismiss";
const tEt = (t) => new Date(t).toLocaleString("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) + " ET";
const devKey = () => localStorage.getItem(LK) || "";
const sleepSt = () => JSON.parse(localStorage.getItem(SK) || '{"open":null,"nights":[]}');
const sleepSave = (s) => localStorage.setItem(SK, JSON.stringify(s));
let liveMsg = "";
function applyLive() {
  if (!D || !LIVE || !LIVE.wallets) return; const W = LIVE.wallets;
  D.wallets.forEach((w) => { const x = W.wallets[w.key]; if (x) { w.now = x.usd; w.hold = `${x.sol.toFixed(4)} SOL` + (Object.keys(x.toks).length ? ` + ${Object.keys(x.toks).length} token(s)` : ""); } });
  D.total = W.total; D.sol_price = W.sol_price; D.wallet_note = `Wallets updated ${tEt(W.ts)} by the free server cron (every 30 min). "vs" shows the last morning refresh.`;
}
function fetchLive() {
  return fetch("api/state", { cache: "no-store" }).then((r) => r.json()).then((j) => { LIVE = j; localStorage.setItem("mc-live", JSON.stringify(j)); applyLive(); if (D) render(); }).catch(() => {});
}
function liveBanner() {
  if (!LIVE || !LIVE.reminders) return ""; const dis = JSON.parse(localStorage.getItem(DK) || "{}"), today = todayET();
  if (LIVE.reminders.date !== today) return "";
  return LIVE.reminders.items.filter((r) => !dis[r.id]).map((r) => `<div class="cban mono"><span>🔔 ${esc(r.title)} · ${esc(r.body)}</span><button class="btn" data-l="dismiss" data-id="${esc(r.id)}">OK</button></div>`).join("");
}
function todayCard() {
  const L = LIVE || {}, d = L.digest, c = L.cron, w = L.wallets;
  const lines = d ? d.lines.map((l) => `<li>${esc(l)}</li>`).join("") : '<li>No data yet. The server builds this at about 7 AM ET.</li>';
  return card("Today", `<ul class="brief">${lines}</ul><p class="note mono">${w ? "Wallets updated " + esc(tEt(w.ts)) : "Wallets: no data yet"}${d ? " · digest built " + esc(tEt(d.ts)) : ""}<br>${c ? "Cron last ran " + esc(tEt(c.ts)) + " (" + esc(c.cron) + "): " + esc(c.steps.join("; ")) : "Cron has not run yet"}</p><p class="note">Templated from server data, no AI. ${liveMsg ? esc(liveMsg) : ""}</p>`);
}
/* ---- sleep log ---- */
const hm = (t) => new Date(t).toLocaleTimeString("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" });
function minsOfDay(t, shift) { const p = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "numeric", hour12: false }).formatToParts(new Date(t)); let m = (+p.find((x) => x.type === "hour").value % 24) * 60 + +p.find((x) => x.type === "minute").value; if (shift && m < 720) m += 1440; return m; }
const fmtM = (m) => { m = Math.round(m) % 1440; const h = Math.floor(m / 60), mi = m % 60; return (h % 12 || 12) + ":" + String(mi).padStart(2, "0") + (h < 12 ? " AM" : " PM"); };
function sleepStats() { const N = sleepSt().nights.slice(-14); if (!N.length) return null; const hrs = N.map((n) => (n.wake - n.bed) / 36e5);
  return { n: N.length, avg_h: hrs.reduce((a, b) => a + b, 0) / N.length, bed: N.reduce((a, n) => a + minsOfDay(n.bed, true), 0) / N.length, wake: N.reduce((a, n) => a + minsOfDay(n.wake, false), 0) / N.length, N, hrs }; }
function sleepCard() {
  const s = sleepSt(), st = sleepStats();
  let chart = '<p class="note">No data yet. Tap Bed when you lie down and Awake when you get up.</p>';
  if (st) { const W = 300, H = 90, bw = W / 14; chart = `<svg viewBox="0 0 ${W} ${H + 16}" width="100%" height="${H + 16}">${st.hrs.map((h, i) => { const bh = Math.min(1, h / 10) * H, c = h >= 7 ? "var(--gr)" : h >= 6 ? "var(--am)" : "var(--rd)"; return `<rect x="${i * bw + 3}" y="${H - bh}" width="${bw - 6}" height="${bh}" rx="3" fill="${c}" opacity=".85"><title>${h.toFixed(1)} h</title></rect><text x="${i * bw + bw / 2}" y="${H + 12}" font-size="8" text-anchor="middle" fill="var(--dim)">${h.toFixed(1)}</text>`; }).join("")}<line x1="0" x2="${W}" y1="${H - 0.7 * H}" y2="${H - 0.7 * H}" stroke="var(--dim)" stroke-dasharray="3 3"/></svg>
    <div class="stats"><div class="stat glass"><div class="v">${st.avg_h.toFixed(1)} h</div><div class="l">Avg sleep</div><div class="d">${st.n} night(s)</div></div><div class="stat glass"><div class="v">${fmtM(st.bed)}</div><div class="l">Avg bedtime</div><div class="d">ET</div></div><div class="stat glass"><div class="v">${fmtM(st.wake)}</div><div class="l">Avg wake</div><div class="d">ET</div></div></div>`; }
  return card("Sleep log", `<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center"><button class="btn pri" data-l="bed" ${s.open ? "disabled" : ""}>🛏 Bed</button><button class="btn pri" data-l="awake" ${s.open ? "" : "disabled"}>☀️ Awake</button>${s.nights.length || s.open ? '<button class="btn" data-l="sleepundo">Undo last</button>' : ""}<span class="note mono">${s.open ? "In bed since " + esc(hm(s.open)) + " ET" : ""}</span></div>${chart}<p class="note">Saved on this device${devKey() ? " and synced to your private server" : ""}. Dashed line = 7 h. Last 14 nights.</p>`);
}
/* ---- pairing, sync, push ---- */
async function post(path, body) { const r = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }); const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || "HTTP " + r.status); return j; }
function syncPayload() { const c = { D, ST, now: Date.now(), today: todayET(), week: weekSpend(), hoursOld: 0 }; let bills = []; try { bills = Coach.bills(c).map((b) => ({ name: b.name, amount: b.amount, due: b.due, paid: !!b.paid })); } catch (_) {}
  const st = sleepStats(); return { key: devKey(), bills, spend: { caps: D.caps_weekly, week: weekSpend() }, sleep: st ? { avg_h: st.avg_h, n: st.n, nights: sleepSt().nights.slice(-30) } : null }; }
async function syncNow(quiet) { if (!devKey()) return; try { const j = await post("api/sync", syncPayload()); localStorage.setItem("mc-synced", j.ts); if (!quiet) liveMsg = "Synced " + tEt(j.ts) + "."; } catch (e) { liveMsg = "Sync failed: " + e.message; } }
const pushOK = () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
function syncCard() {
  const k = devKey(), syn = localStorage.getItem("mc-synced"), perm = pushOK() ? Notification.permission : "unsupported";
  return card("Private server sync", k ? `<p><span class="pill ok"><span class="dot ok"></span>Paired</span> ${syn ? "Last synced " + esc(tEt(syn)) : "Not synced yet"}</p><div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn pri" data-l="sync">Sync now</button><button class="btn" data-l="refresh">Refresh wallets now</button>${pushOK() ? `<button class="btn" data-l="push">${perm === "granted" ? "Re-enable push" : "Turn on push alerts"}</button>${perm === "granted" ? '<button class="btn" data-l="pushtest">Test push</button>' : ""}` : ""}<button class="btn" data-l="showkey">Show key</button></div><p class="note">${pushOK() ? "Push: " + esc(perm) + "." : "Push isn't available in this browser. On iPhone, add Mission Control to the Home Screen first (iOS 16.4+)."} Syncs bills you added in Coach, this week's spend vs caps, and your sleep log so the server's reminders and 7 AM digest can use them. The key is stored only as a hash on the server.</p><p class="note mono" id="lkey"></p>`
    : `<p>Optional. Pair this phone so bill reminders, spend vs caps and sleep reach the free server, and so it can send push alerts.</p><div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn pri" data-l="pair">Pair this device</button></div><form class="frm" data-lform="usekey" style="margin-top:8px"><input name="k" placeholder="Or paste the key from your other device" minlength="32" maxlength="128"><button class="btn">Use key</button></form><p class="note">The first device to pair owns the server. Only a SHA-256 hash of the key is stored.</p>`);
}
async function pair(key) { try { const j = await post("api/pair", { key }); localStorage.setItem(LK, key); liveMsg = j.paired === "new" ? "Paired. This device owns the server." : "Paired with your existing key."; await syncNow(true); } catch (e) { liveMsg = "Pairing failed: " + e.message; } render(); }
async function enablePush() {
  try { if ((await Notification.requestPermission()) !== "granted") throw new Error("permission " + Notification.permission);
    const { key } = await (await fetch("api/push/key")).json(), raw = Uint8Array.from(atob(key.replace(/-/g, "+").replace(/_/g, "/") + "==".slice(0, (4 - (key.length % 4)) % 4)), (c) => c.charCodeAt(0));
    const reg = await navigator.serviceWorker.ready; let sub = await reg.pushManager.getSubscription(); if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: raw });
    await post("api/push/sub", { key: devKey(), sub: sub.toJSON() }); liveMsg = "Push alerts on.";
  } catch (e) { liveMsg = "Push failed: " + e.message; } render(); }
document.addEventListener("click", async (e) => {
  const b = e.target.closest("[data-l]"); if (!b) return; const a = b.dataset.l, s = sleepSt();
  if (a === "dismiss") { const d = JSON.parse(localStorage.getItem(DK) || "{}"); d[b.dataset.id] = todayET(); localStorage.setItem(DK, JSON.stringify(d)); render(); }
  if (a === "bed") { s.open = Date.now(); sleepSave(s); render(); }
  if (a === "awake" && s.open) { const n = { bed: s.open, wake: Date.now() }; if (n.wake - n.bed >= 6e4) s.nights.push(n); s.open = null; s.nights = s.nights.slice(-120); sleepSave(s); render(); syncNow(true); }
  if (a === "sleepundo") { if (s.open) s.open = null; else s.nights.pop(); sleepSave(s); render(); }
  if (a === "pair") { const r = crypto.getRandomValues(new Uint8Array(24)); pair([...r].map((x) => x.toString(16).padStart(2, "0")).join("")); }
  if (a === "sync") { await syncNow(false); render(); }
  if (a === "refresh") { b.disabled = true; try { const j = await post("api/refresh", { key: devKey() }); liveMsg = j.cached ? "Refreshed less than 5 min ago." : "Refreshed."; } catch (er) { liveMsg = "Refresh failed: " + er.message; } await fetchLive(); render(); }
  if (a === "push") enablePush();
  if (a === "pushtest") { try { const j = await post("api/push/test", { key: devKey() }); liveMsg = "Test push sent to " + j.sent + " device(s)."; } catch (er) { liveMsg = "Test failed: " + er.message; } render(); }
  if (a === "showkey") { const el = document.getElementById("lkey"); if (el) el.textContent = "Key (keep private, paste on your other device): " + devKey(); }
});
document.addEventListener("submit", (e) => { const f = e.target.closest("[data-lform]"); if (!f) return; e.preventDefault(); e.stopImmediatePropagation(); const k = new FormData(f).get("k").trim(); if (k.length >= 32) pair(k); }, true);
fetchLive(); setInterval(fetchLive, 5 * 60e3);
setTimeout(() => syncNow(true), 4000);
