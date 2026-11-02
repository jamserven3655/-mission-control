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
/* ---- editable settings (KV "cfg") ---- */
const DEF = { gym: { time: "05:30", on: true }, gym_once: null, payday: { weekday: 4, weeks: [2, 4] }, usage_alerts: [33, 40] };
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
async function cfg(env) { const c = await kget(env, "cfg", {}); return { ...DEF, ...c, gym: { ...DEF.gym, ...(c.gym || {}) }, payday: { ...DEF.payday, ...(c.payday || {}) } }; }
function cleanCfg(b, cur) { const c = { ...cur };
  if (b.gym) { if (b.gym.time != null) { if (!HHMM.test(b.gym.time)) throw new Error("gym time must be HH:MM"); c.gym = { ...c.gym, time: b.gym.time }; } if (b.gym.on != null) c.gym = { ...c.gym, on: !!b.gym.on }; }
  if ("gym_once" in b) { const o = b.gym_once; if (o == null) c.gym_once = null; else { if (!/^\d{4}-\d\d-\d\d$/.test(o.date) || !HHMM.test(o.time)) throw new Error("one-day gym time needs date + HH:MM"); c.gym_once = { date: o.date, time: o.time }; } }
  if (b.payday) { const wd = +b.payday.weekday, wk = [...new Set((b.payday.weeks || []).map(Number))].filter((x) => x >= 1 && x <= 5).sort(); if (!(wd >= 0 && wd <= 6) || !wk.length) throw new Error("payday needs weekday 0-6 and weeks 1-5"); c.payday = { weekday: wd, weeks: wk }; }
  if (b.usage_alerts) { const a = [...new Set(b.usage_alerts.map(Number))].filter((x) => x > 0 && x <= 100).sort((x, y) => x - y).slice(0, 5); if (!a.length) throw new Error("alerts need 1-100"); c.usage_alerts = a; }
  return c; }
const hm12 = (t) => { const [h, m] = t.split(":").map(Number); return (h % 12 || 12) + ":" + String(m).padStart(2, "0") + (h < 12 ? " AM" : " PM"); };
/* ---- time in ET ---- */
function et(d = new Date()) { const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false, weekday: "short" }).formatToParts(d).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, h: +p.hour % 24, m: +p.minute, wd: p.weekday, y: +p.year, mo: +p.month - 1, d: +p.day }; }
const etLabel = (iso) => new Date(iso).toLocaleString("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) + " ET";
// nth weekday of the month: the 2nd Thursday is the Thursday on day 8-14, the 4th on day 22-28
function paydays(y, m, rule = DEF.payday) { const d = new Date(Date.UTC(y, m, 1)), off = (rule.weekday - d.getUTCDay() + 7) % 7, last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return rule.weeks.map((n) => 1 + off + 7 * (n - 1)).filter((x) => x <= last).map((x) => `${y}-${String(m + 1).padStart(2, "0")}-${String(x).padStart(2, "0")}`); }
const WD = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"], ORD = ["", "1st", "2nd", "3rd", "4th", "5th"];
const ruleLabel = (r) => r.weeks.map((n) => ORD[n]).join("/") + " " + WD[r.weekday];
const addDays = (s, n) => new Date(Date.parse(s + "T12:00:00Z") + n * 864e5).toISOString().slice(0, 10);
const weekStart = (s) => addDays(s, -new Date(s + "T12:00:00Z").getUTCDay()); // Sunday-based week (the plan resets Sundays)
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
/* ---- public market data (what the 8 AM bot refresh pulled): DexScreener boosted tokens + SOL price, no keys ---- */
const money = (x) => (x >= 1e6 ? "$" + (x / 1e6).toFixed(1) + "M" : x >= 1e3 ? "$" + (x / 1e3).toFixed(1) + "k" : "$" + Math.round(x));
const ageL = (h) => (h < 48 ? Math.round(h) + " h" : Math.round(h / 24) + " d");
async function refreshMarket(env) {
  const H = { "user-agent": "MissionControl/1.0", accept: "application/json" }, m = { ts: new Date().toISOString(), dex: [], errors: [] };
  try { const ids = [];
    for (const u of ["https://api.dexscreener.com/token-boosts/top/v1", "https://api.dexscreener.com/token-boosts/latest/v1"]) { const r = await fetch(u, { headers: H }); if (!r.ok) throw new Error(u.split("/")[4] + " HTTP " + r.status); for (const b of await r.json()) if (b.chainId === "solana" && !ids.includes(b.tokenAddress)) ids.push(b.tokenAddress); }
    const r = await fetch("https://api.dexscreener.com/tokens/v1/solana/" + ids.slice(0, 30).join(","), { headers: H }), best = {};
    for (const p of await r.json()) { const a = p.baseToken && p.baseToken.address, l = (p.liquidity && p.liquidity.usd) || 0; if (ids.includes(a) && (!best[a] || l > ((best[a].liquidity && best[a].liquidity.usd) || 0))) best[a] = p; }
    m.dex = Object.values(best).sort((a, b) => ((b.volume && b.volume.h24) || 0) - ((a.volume && a.volume.h24) || 0)).slice(0, 10).map((p) => { const liq = (p.liquidity && p.liquidity.usd) || 0, vol = (p.volume && p.volume.h24) || 0, chg = (p.priceChange && p.priceChange.h24) || 0, ok = liq >= 50000 && chg > -50;
      return { sym: p.baseToken.symbol, name: p.baseToken.name, ca: p.baseToken.address, age: p.pairCreatedAt ? ageL((Date.now() - p.pairCreatedAt) / 36e5) : "?", liq: money(liq), vol: money(vol), chg: (chg >= 0 ? "+" : "") + Math.round(chg) + "%", scout: ok ? "WATCH" : "SKIP",
        why: chg <= -50 ? `Down ${Math.abs(Math.round(chg))}%, liquidity ${money(liq)}` : liq < 50000 ? "Liquidity under $50k" : vol > 20 * liq ? `Volume ${Math.round(vol / liq)}x liquidity` : "Liquidity ok", url: p.url, liqn: liq, voln: vol }; });
  } catch (e) { m.errors.push("dexscreener: " + String(e.message || e).slice(0, 80)); }
  // pump.fun's API answers 403 to server requests (tested from the box), so it is not fetched; Coin Radar covers new coins.
  try { const r = await fetch("https://api.dexscreener.com/tokens/v1/solana/" + SOL, { headers: H }); let b = [0, 0]; for (const p of await r.json()) if (/USD/.test(p.quoteToken.symbol) && ((p.liquidity && p.liquidity.usd) || 0) > b[0]) b = [p.liquidity.usd, +p.priceUsd]; if (b[1]) m.sol_price = b[1]; else throw new Error("no USD pair"); } catch (e) { m.errors.push("sol price dexscreener: " + String(e.message || e).slice(0, 60)); }
  // DexScreener rate-limits Cloudflare egress (429/1015 seen Nov 2), so fall back to other free no-key SOL/USD quotes
  const FB = [["coinbase", "https://api.coinbase.com/v2/prices/SOL-USD/spot", (j) => +j.data.amount], ["kraken", "https://api.kraken.com/0/public/Ticker?pair=SOLUSD", (j) => +Object.values(j.result)[0].c[0]], ["coingecko", "https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd", (j) => +j.solana.usd]];
  for (const [n, u, f] of FB) { if (m.sol_price) break; try { const r = await fetch(u, { headers: H }); const v = f(await r.json()); if (v > 0) { m.sol_price = v; m.sol_src = n; } } catch (e) { m.errors.push(n + ": " + String(e.message || e).slice(0, 40)); } }
  if (m.sol_price) m.errors = m.errors.filter((x) => !x.startsWith("sol price")); if (!m.sol_src && m.sol_price) m.sol_src = "dexscreener";
  const old = await kget(env, "market"); if (old) { if (!m.dex.length) m.dex = old.dex, m.dex_ts = old.dex_ts || old.ts; if (!m.sol_price && old.sol_price) m.sol_price = old.sol_price; }
  await kput(env, "market", m); return m;
}
/* ---- reminders ---- */
async function buildReminders(env, now = new Date()) {
  const t = et(now), R = [], sync = await kget(env, "sync", null), C = await cfg(env), rl = ruleLabel(C.payday);
  const pd = [...paydays(t.y, t.mo, C.payday), ...paydays(t.mo === 11 ? t.y + 1 : t.y, (t.mo + 1) % 12, C.payday), ...paydays(t.mo >= 10 ? t.y + 1 : t.y, (t.mo + 2) % 12, C.payday)], next = pd.find((d) => d >= t.date);
  if (next === t.date) R.push({ id: "payday:" + t.date, kind: "payday", title: "Payday today", body: rl + " payday. Pay bills first, then the $5K goal." });
  else if (next === addDays(t.date, 1)) R.push({ id: "payday-eve:" + t.date, kind: "payday", title: "Payday tomorrow", body: "Payday is " + next + " (" + rl + ")." });
  // gym: first cron tick at/after the set ET time; a one-day time (gym_once) overrides today only. Shown until 8 h after.
  const gt = C.gym_once && C.gym_once.date === t.date ? C.gym_once.time : C.gym.time, [gh, gm] = gt.split(":").map(Number), nowM = t.h * 60 + t.m;
  if (C.gym.on && nowM >= gh * 60 + gm && nowM < gh * 60 + gm + 480) R.push({ id: "gym:" + t.date + "@" + gt, kind: "gym", title: "Gym at " + hm12(gt), body: gt === C.gym.time ? "Daily gym reminder." : "Today's gym time (just today)." });
  const U = await kget(env, "usage:hist", []), lu = U[U.length - 1];
  if (lu) { const hit = C.usage_alerts.filter((a) => lu[1] >= a).pop(); if (hit != null) R.push({ id: "usage:" + hit + ":" + weekStart(t.date), kind: "usage", title: `Usage ${lu[1]}% (cap ${hit}%)`, body: `Weekly usage reached your ${hit}% alert. Set ${etLabel(lu[0])}.` }); }
  if (sync && Array.isArray(sync.bills)) for (const b of sync.bills) { if (b.paid || !b.due) continue; const left = dayDiff(t.date, b.due); if (left <= 3) R.push({ id: "bill:" + b.name + ":" + b.due + ":" + t.date, kind: "bill", title: left < 0 ? `${b.name} overdue` : left === 0 ? `${b.name} due today` : `${b.name} due in ${left} day${left === 1 ? "" : "s"}`, body: `$${(+b.amount || 0).toFixed(2)} due ${b.due}`, due: b.due }); }
  return { date: t.date, items: R, bills_synced: !!(sync && sync.bills), next_payday: next, payday_rule: rl, gym_time: gt, cfg: C, usage: lu ? { pct: lu[1], ts: lu[0] } : null };
}
/* ---- digest (templated, no AI) ---- */
function usageFromData(D) { return D && D.usage ? { pct: D.usage.pct, as_of: D.usage.as_of } : null; }
async function buildDigest(env, D) {
  const w = await kget(env, "wallets"), rem = await buildReminders(env), sync = await kget(env, "sync"), u = usageFromData(D), L = [];
  if (w) { const ch = w.prev_day ? w.total - w.prev_day[1] : null; L.push(`Wallets $${w.total.toFixed(2)}` + (ch == null ? " (no earlier day stored yet)" : ` (${ch >= 0 ? "+" : "-"}$${Math.abs(ch).toFixed(2)} vs ${w.prev_day[0]})`) + `, SOL $${w.sol_price.toFixed(2)}, as of ${etLabel(w.ts)}.`); } else { const mk = await kget(env, "market"); L.push("Wallets: server refresh blocked until a free Helius key is added" + (mk && mk.sol_price ? `. SOL $${mk.sol_price.toFixed(2)} (${etLabel(mk.ts)})` : "") + "."); }
  L.push(rem.items.length ? "Due: " + rem.items.map((r) => r.title).join("; ") + "." : "Nothing due today." + (rem.bills_synced ? "" : " Bills not synced yet."));
  L.push("Next payday " + rem.next_payday + ".");
  if (sync && sync.spend && sync.spend.caps) { const c = sync.spend.caps, s = sync.spend.week || {}, over = Object.keys(c).filter((k) => (s[k] || 0) > c[k]); const tot = Object.values(s).reduce((a, b) => a + (+b || 0), 0), cap = Object.values(c).reduce((a, b) => a + (+b || 0), 0);
    L.push(`Spending this week $${tot.toFixed(2)} of $${cap} caps` + (over.length ? `, over on ${over.join(", ")}` : ", no cap over") + ` (synced ${etLabel(sync.ts)}).`); } else L.push("Spending vs caps: not synced yet.");
  if (sync && sync.sleep && sync.sleep.avg_h) L.push(`Sleep avg ${sync.sleep.avg_h.toFixed(1)} h over ${sync.sleep.n} night(s).`);
  L.push(rem.usage ? `Usage ${rem.usage.pct}% (typed in ${etLabel(rem.usage.ts)}).` : u ? `Usage ${u.pct}% as of ${u.as_of}.` : "Usage: no data yet.");
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
  const mk = await kget(env, "market"); if (!mk || Date.now() - Date.parse(mk.ts) > 55 * 60e3) { const m = await refreshMarket(env); log.steps.push(`market dex ${m.dex.length} SOL $${m.sol_price || "?"}` + (m.errors.length ? " (" + m.errors.join("; ") + ")" : "")); }
  const rem = await buildReminders(env), sent = await kget(env, "pushed", {}), fresh = rem.items.filter((r) => !sent[r.id] && (r.kind === "gym" || r.kind === "usage" || t.h >= 7));
  if (t.h === 7 && t.m < 30 && !sent["digest:" + t.date]) { const d = await buildDigest(env, D); log.steps.push("digest " + d.lines.length + " lines"); fresh.unshift({ id: "digest:" + t.date, kind: "digest", title: "Today", body: d.lines.slice(0, 2).join(" ") }); }
  else if (!(await kget(env, "digest"))) await buildDigest(env, D);
  if (fresh.length) { const n = await notify(env, { title: fresh.length === 1 ? fresh[0].title : fresh.map((r) => r.title).join(" · "), body: fresh[0].body });
    fresh.forEach((r) => (sent[r.id] = t.date)); for (const k in sent) if (dayDiff(sent[k], t.date) > 7) delete sent[k]; await kput(env, "pushed", sent); log.steps.push("reminders " + fresh.length + ", push " + JSON.stringify(n)); }
  else log.steps.push("reminders: none new");
  await kput(env, "cronlog", log); return log;
}
/* ---- HTTP API ---- */
async function api(req, env, D, p) {
  if (p === "/api/state" && req.method === "GET") { const [w, d, l, lp, sync, mk, uh] = await Promise.all([kget(env, "wallets"), kget(env, "digest"), kget(env, "cronlog"), kget(env, "lastpush"), kget(env, "sync"), kget(env, "market"), kget(env, "usage:hist", [])]);
    return J({ wallets: w, digest: d, market: mk, usage_hist: uh.slice(-20), wallet_note: "Server wallet refresh is blocked: free keyless Solana RPCs refuse Cloudflare. Needs a free Helius key saved as a Worker secret.", cron: l, lastpush: lp, reminders: await buildReminders(env), synced: sync ? { ts: sync.ts, bills: (sync.bills || []).length, sleep: !!sync.sleep, spend: !!sync.spend } : null, paired: !!(await kget(env, "devicehash")) }); }
  if (p === "/api/push/key" && req.method === "GET") return J({ key: (await vapid(env)).pub });
  if (req.method !== "POST") return J({ error: "not found" }, 404);
  let b; try { b = await req.json(); } catch (e) { return J({ error: "bad json" }, 400); }
  if (JSON.stringify(b).length > 60000) return J({ error: "too big" }, 413);
  if (p === "/api/pair") { const key = String(b.key || ""); if (key.length < 32 || key.length > 128) return J({ error: "bad key" }, 400); const h = await kget(env, "devicehash");
    if (!h) { await kput(env, "devicehash", await sha(key)); return J({ paired: "new" }); } return (await authed(env, key)) ? J({ paired: "ok" }) : J({ error: "this app is already paired to another key; paste that key on this device" }, 403); }
  // settings + usage: the whole site is behind the password lock (cf/lock.js), so no device pairing needed
  if (p === "/api/settings") { let c; try { c = cleanCfg(b, await cfg(env)); } catch (e) { return J({ error: e.message }, 400); } await kput(env, "cfg", c); return J({ ok: true, cfg: c, reminders: await buildReminders(env) }); }
  if (p === "/api/usage") { const pct = Math.round(+b.pct * 10) / 10; if (!(pct >= 0 && pct <= 100)) return J({ error: "pct must be 0-100" }, 400);
    const h = await kget(env, "usage:hist", []); h.push([new Date().toISOString(), pct]); await kput(env, "usage:hist", h.slice(-100));
    const rem = await buildReminders(env), sent = await kget(env, "pushed", {}), u = rem.items.find((r) => r.kind === "usage" && !sent[r.id]); let push = null;
    if (u) { push = await notify(env, { title: u.title, body: u.body }); sent[u.id] = et().date; await kput(env, "pushed", sent); }
    return J({ ok: true, pct, alert: u ? u.title : null, push, hist: h.slice(-20) }); }
  if (p === "/api/market/refresh") { const m = await kget(env, "market"); if (m && Date.now() - Date.parse(m.ts) < 5 * 60e3) return J({ ok: true, cached: true, market: m }); return J({ ok: true, market: await refreshMarket(env) }); }
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
