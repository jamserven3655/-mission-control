/* Mission Control free server parts (Cloudflare Worker + KV, free tier). Read-only on-chain reads, no keys, no paid APIs.
   Never moves funds or signs transactions. Web Push is payload-less (VAPID only): the phone's service worker fetches /api/state. */
const WALLETS = { main: ["Main", "BZD82QWFzFpfKgAbm46GRr1GR76pZq6AmktLnjCZB2NA"], j1df: ["Phantom J1df", "J1dfibagGeMAbWpUMAjWeJ1oLEQ7uLysqSjqw6xcDto5"], "81ns": ["Phantom 81Ns", "81NsSsVMAC1Fo8daTvohCq2bnE5syiMRMHtg2hp8Ye5D"], fomo: ["FOMO app", "DsV7L4LnsekSsfV3FFqgnpvNApBKipq7hbtEGzoyYYcb"] };
const RPCS = ["https://api.mainnet-beta.solana.com", "https://solana-rpc.publicnode.com"];
const SOL = "So11111111111111111111111111111111111111112", STABLE = { EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v: 1, CASHx9KJUStyftLFWGvEVf59SGeG9sh5FfcnZMVPCASH: 1 };
const TP = ["TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA", "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"];
const SITE = "https://jellis-mission-control.jamesellis703.workers.dev";
const J = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" } });
const kget = async (env, k, d = null) => { const v = await env.MC.get(k, "json"); return v == null ? d : v; };
const kput = (env, k, v) => env.MC.put(k, JSON.stringify(v));
/* ---- time in ET ---- */
function et(d = new Date()) { const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false, weekday: "short" }).formatToParts(d).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, h: +p.hour % 24, m: +p.minute, wd: p.weekday, y: +p.year, mo: +p.month - 1, d: +p.day }; }
const etLabel = (iso) => new Date(iso).toLocaleString("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) + " ET";
function paydays(y, m) { const d = new Date(Date.UTC(y, m, 1)), off = (4 - d.getUTCDay() + 7) % 7; return [1 + off + 7, 1 + off + 21].map((x) => `${y}-${String(m + 1).padStart(2, "0")}-${String(x).padStart(2, "0")}`); }
const addDays = (s, n) => new Date(Date.parse(s + "T12:00:00Z") + n * 864e5).toISOString().slice(0, 10);
const dayDiff = (a, b) => Math.round((Date.parse(b + "T12:00:00Z") - Date.parse(a + "T12:00:00Z")) / 864e5);
/* ---- wallets (read-only) ---- */
async function rpc(method, params) { let last; for (const u of RPCS) for (let i = 0; i < 2; i++) { try { const r = await fetch(u, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) }); const j = await r.json(); if (j.error) throw new Error(JSON.stringify(j.error)); return j.result; } catch (e) { last = e; } } throw last; }
async function refreshWallets(env) {
  const out = {}, mints = new Set();
  for (const [k, [name, a]] of Object.entries(WALLETS)) {
    const sol = (await rpc("getBalance", [a])).value / 1e9, toks = {};
    for (const p of TP) for (const t of (await rpc("getTokenAccountsByOwner", [a, { programId: p }, { encoding: "jsonParsed" }])).value) { const i = t.account.data.parsed.info, amt = +(i.tokenAmount.uiAmount || 0); if (amt > 0) { toks[i.mint] = (toks[i.mint] || 0) + amt; mints.add(i.mint); } }
    out[k] = { name, addr: a, sol, toks };
  }
  const px = { ...STABLE }, ml = [...new Set([...mints, SOL])].filter((m) => !(m in STABLE));
  for (let i = 0; i < ml.length; i += 30) { try { const r = await fetch("https://api.dexscreener.com/tokens/v1/solana/" + ml.slice(i, i + 30).join(","), { headers: { "user-agent": "MissionControl/1.0" } }); const arr = await r.json(), best = {};
    for (const p of arr || []) { const m = p.baseToken && p.baseToken.address; if (!ml.includes(m) || !p.priceUsd) continue; if (m === SOL && !/USD/.test(p.quoteToken.symbol)) continue; const l = (p.liquidity && p.liquidity.usd) || 0; if (!best[m] || l > best[m][0]) best[m] = [l, +p.priceUsd]; }
    for (const m in best) px[m] = best[m][1]; } catch (e) {} }
  if (!px[SOL]) throw new Error("no SOL price");
  let total = 0; for (const v of Object.values(out)) { v.usd = Math.round((v.sol * px[SOL] + Object.entries(v.toks).reduce((s, [m, a]) => s + a * (px[m] || 0), 0)) * 100) / 100; total += v.usd; }
  const now = new Date().toISOString(), t = et(), hist = await kget(env, "wallets:hist", []);
  total = Math.round(total * 100) / 100;
  if (!hist.length || hist[hist.length - 1][0] !== t.date) hist.push([t.date, total]); else hist[hist.length - 1][1] = total;
  const prevDay = hist.length > 1 ? hist[hist.length - 2] : null;
  const w = { ts: now, sol_price: px[SOL], total, prev_day: prevDay, wallets: out, unpriced: [...mints].filter((m) => px[m] == null).length, source: "public Solana RPC + DexScreener" };
  await kput(env, "wallets", w); await kput(env, "wallets:hist", hist.slice(-45));
  return w;
}
/* ---- reminders ---- */
async function buildReminders(env, now = new Date()) {
  const t = et(now), R = [], sync = await kget(env, "sync", null);
  const pd = [...paydays(t.y, t.mo), ...paydays(t.mo === 11 ? t.y + 1 : t.y, (t.mo + 1) % 12)], next = pd.find((d) => d >= t.date);
  if (next === t.date) R.push({ id: "payday:" + t.date, kind: "payday", title: "Payday today", body: "2nd/4th Thursday payday. Pay bills first, then the $5K goal." });
  else if (next === addDays(t.date, 1)) R.push({ id: "payday-eve:" + t.date, kind: "payday", title: "Payday tomorrow", body: "Payday is " + next + " (2nd/4th Thursday)." });
  if ((t.h > 5 || (t.h === 5 && t.m >= 30)) && t.h < 12) R.push({ id: "gym:" + t.date, kind: "gym", title: "Gym at 5:30 AM", body: "Daily gym reminder." });
  if (sync && Array.isArray(sync.bills)) for (const b of sync.bills) { if (b.paid || !b.due) continue; const left = dayDiff(t.date, b.due); if (left <= 3) R.push({ id: "bill:" + b.name + ":" + b.due + ":" + t.date, kind: "bill", title: left < 0 ? `${b.name} overdue` : left === 0 ? `${b.name} due today` : `${b.name} due in ${left} day${left === 1 ? "" : "s"}`, body: `$${(+b.amount || 0).toFixed(2)} due ${b.due}`, due: b.due }); }
  return { date: t.date, items: R, bills_synced: !!(sync && sync.bills), next_payday: next };
}
/* ---- digest (templated, no AI) ---- */
function usageFromData(D) { return D && D.usage ? { pct: D.usage.pct, as_of: D.usage.as_of } : null; }
async function buildDigest(env, D) {
  const w = await kget(env, "wallets"), rem = await buildReminders(env), sync = await kget(env, "sync"), u = usageFromData(D), L = [];
  if (w) { const ch = w.prev_day ? w.total - w.prev_day[1] : null; L.push(`Wallets $${w.total.toFixed(2)}` + (ch == null ? " (no earlier day stored yet)" : ` (${ch >= 0 ? "+" : "-"}$${Math.abs(ch).toFixed(2)} vs ${w.prev_day[0]})`) + `, SOL $${w.sol_price.toFixed(2)}, as of ${etLabel(w.ts)}.`); } else L.push("Wallets: no data yet.");
  L.push(rem.items.length ? "Due: " + rem.items.map((r) => r.title).join("; ") + "." : "Nothing due today." + (rem.bills_synced ? "" : " Bills not synced yet."));
  L.push("Next payday " + rem.next_payday + ".");
  if (sync && sync.spend && sync.spend.caps) { const c = sync.spend.caps, s = sync.spend.week || {}, over = Object.keys(c).filter((k) => (s[k] || 0) > c[k]); const tot = Object.values(s).reduce((a, b) => a + (+b || 0), 0), cap = Object.values(c).reduce((a, b) => a + (+b || 0), 0);
    L.push(`Spending this week $${tot.toFixed(2)} of $${cap} caps` + (over.length ? `, over on ${over.join(", ")}` : ", no cap over") + ` (synced ${etLabel(sync.ts)}).`); } else L.push("Spending vs caps: not synced yet.");
  if (sync && sync.sleep && sync.sleep.avg_h) L.push(`Sleep avg ${sync.sleep.avg_h.toFixed(1)} h over ${sync.sleep.n} night(s).`);
  L.push(u ? `Usage ${u.pct}% as of ${u.as_of}.` : "Usage: no data yet.");
  const d = { ts: new Date().toISOString(), date: et().date, lines: L };
  await kput(env, "digest", d); return d;
}
/* ---- device key (same pattern as Coin Radar: only a SHA-256 hash in KV) ---- */
async function sha(s) { return [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)))].map((b) => b.toString(16).padStart(2, "0")).join(""); }
async function authed(env, key) { if (!key || key.length < 32 || key.length > 128) return false; const h = await kget(env, "devicehash"); return !!h && h === (await sha(key)); }
/* ---- Web Push (VAPID, no payload) ---- */
const b64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
async function vapid(env) {
  let v = await kget(env, "vapid");
  if (!v) { const kp = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]); v = { priv: await crypto.subtle.exportKey("jwk", kp.privateKey), pub: b64u(await crypto.subtle.exportKey("raw", kp.publicKey)) }; await kput(env, "vapid", v); }
  return v;
}
async function sendPush(env, sub, v) {
  const aud = new URL(sub.endpoint).origin, enc = (o) => b64u(new TextEncoder().encode(JSON.stringify(o)));
  const unsigned = enc({ typ: "JWT", alg: "ES256" }) + "." + enc({ aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: SITE });
  const key = await crypto.subtle.importKey("jwk", v.priv, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, new TextEncoder().encode(unsigned));
  const r = await fetch(sub.endpoint, { method: "POST", headers: { Authorization: `vapid t=${unsigned}.${b64u(sig)}, k=${v.pub}`, TTL: "43200", Urgency: "high", "Content-Length": "0" } });
  return r.status;
}
async function notify(env, msg) {
  const subs = await kget(env, "pushsubs", []); if (!subs.length) return { sent: 0 };
  await kput(env, "lastpush", { ...msg, ts: new Date().toISOString() });
  const v = await vapid(env), keep = [], res = [];
  for (const s of subs) { try { const st = await sendPush(env, s, v); res.push(st); if (st !== 404 && st !== 410) keep.push(s); } catch (e) { keep.push(s); res.push("err"); } }
  if (keep.length !== subs.length) await kput(env, "pushsubs", keep);
  return { sent: subs.length, status: res };
}
/* ---- cron: every 30 min ---- */
async function cron(env, D, sched) {
  const log = { ts: new Date().toISOString(), cron: sched || "manual", steps: [] }, t = et();
  try { const w = await refreshWallets(env); log.steps.push("wallets $" + w.total); } catch (e) { log.steps.push("wallets error: " + String(e.message || e).slice(0, 120)); }
  const rem = await buildReminders(env), sent = await kget(env, "pushed", {}), fresh = rem.items.filter((r) => !sent[r.id] && (r.kind === "gym" || t.h >= 7));
  if (t.h === 7 && t.m < 30 && !sent["digest:" + t.date]) { const d = await buildDigest(env, D); log.steps.push("digest " + d.lines.length + " lines"); fresh.unshift({ id: "digest:" + t.date, kind: "digest", title: "Today", body: d.lines.slice(0, 2).join(" ") }); }
  else if (!(await kget(env, "digest"))) await buildDigest(env, D);
  if (fresh.length) { const n = await notify(env, { title: fresh.length === 1 ? fresh[0].title : fresh.map((r) => r.title).join(" · "), body: fresh[0].body });
    fresh.forEach((r) => (sent[r.id] = t.date)); for (const k in sent) if (dayDiff(sent[k], t.date) > 7) delete sent[k]; await kput(env, "pushed", sent); log.steps.push("reminders " + fresh.length + ", push " + JSON.stringify(n)); }
  else log.steps.push("reminders: none new");
  await kput(env, "cronlog", log); return log;
}
/* ---- HTTP API ---- */
async function api(req, env, D, p) {
  if (p === "/api/state" && req.method === "GET") { const [w, d, l, lp, sync] = await Promise.all([kget(env, "wallets"), kget(env, "digest"), kget(env, "cronlog"), kget(env, "lastpush"), kget(env, "sync")]);
    return J({ wallets: w, digest: d, cron: l, lastpush: lp, reminders: await buildReminders(env), synced: sync ? { ts: sync.ts, bills: (sync.bills || []).length, sleep: !!sync.sleep, spend: !!sync.spend } : null, paired: !!(await kget(env, "devicehash")) }); }
  if (p === "/api/push/key" && req.method === "GET") return J({ key: (await vapid(env)).pub });
  if (req.method !== "POST") return J({ error: "not found" }, 404);
  let b; try { b = await req.json(); } catch (e) { return J({ error: "bad json" }, 400); }
  if (JSON.stringify(b).length > 60000) return J({ error: "too big" }, 413);
  if (p === "/api/pair") { const key = String(b.key || ""); if (key.length < 32 || key.length > 128) return J({ error: "bad key" }, 400); const h = await kget(env, "devicehash");
    if (!h) { await kput(env, "devicehash", await sha(key)); return J({ paired: "new" }); } return (await authed(env, key)) ? J({ paired: "ok" }) : J({ error: "this app is already paired to another key; paste that key on this device" }, 403); }
  if (!(await authed(env, String(b.key || "")))) return J({ error: "not paired" }, 401);
  if (p === "/api/sync") { const clean = (a, n) => (Array.isArray(a) ? a.slice(0, n) : []);
    const s = { ts: new Date().toISOString(), bills: clean(b.bills, 60).map((x) => ({ name: String(x.name || "").slice(0, 60), amount: +x.amount || 0, due: /^\d{4}-\d\d-\d\d$/.test(x.due) ? x.due : null, paid: !!x.paid })),
      spend: b.spend && b.spend.caps ? { caps: b.spend.caps, week: b.spend.week || {} } : null, sleep: b.sleep ? { avg_h: +b.sleep.avg_h || 0, n: +b.sleep.n || 0, nights: clean(b.sleep.nights, 60) } : null };
    await kput(env, "sync", s); return J({ ok: true, ts: s.ts }); }
  if (p === "/api/push/sub") { const sub = b.sub; if (!sub || !/^https:\/\//.test(sub.endpoint || "")) return J({ error: "bad sub" }, 400); const subs = (await kget(env, "pushsubs", [])).filter((x) => x.endpoint !== sub.endpoint); subs.push({ endpoint: sub.endpoint }); await kput(env, "pushsubs", subs.slice(-5)); return J({ ok: true, subs: subs.length }); }
  if (p === "/api/refresh") { const l = await kget(env, "cronlog"); if (l && Date.now() - Date.parse(l.ts) < 5 * 60e3) return J({ ok: true, cached: true, cron: l }); return J({ ok: true, cron: await cron(env, D, "manual") }); }
  if (p === "/api/push/test") return J(await notify(env, { title: "Mission Control test", body: "Push works. Reminders will arrive like this." }));
  return J({ error: "not found" }, 404);
}
