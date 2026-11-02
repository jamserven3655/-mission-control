// Unit tests for the free cron rules (gym time, payday rule, usage alerts, market refresh). node test/cron.unit.test.mjs
import fs from "node:fs";
let NOW = Date.parse("2026-11-02T20:30:00Z");
class FD extends Date { constructor(...a) { super(...(a.length ? a : [NOW])); } static now() { return NOW; } }
const mem = new Map(), KV = { get: async (k, t) => (mem.has(k) ? (t === "json" ? JSON.parse(mem.get(k)) : mem.get(k)) : null), put: async (k, v) => void mem.set(k, v) };
let pushes = 0, fetchLog = [];
const FIX = { "solana/So11111111111111111111111111111111111111112": [{ baseToken: { address: "So11111111111111111111111111111111111111112" }, quoteToken: { symbol: "USDC" }, liquidity: { usd: 9e6 }, priceUsd: "95.5" }], "token-boosts/top": [{ chainId: "solana", tokenAddress: "AAA" }, { chainId: "base", tokenAddress: "X" }], "token-boosts/latest": [{ chainId: "solana", tokenAddress: "BBB" }],
  "tokens/v1/solana": [{ baseToken: { address: "AAA", symbol: "AA", name: "Aa" }, liquidity: { usd: 80000 }, volume: { h24: 900000 }, priceChange: { h24: 12 }, pairCreatedAt: NOW - 5 * 36e5, url: "u1" },
    { baseToken: { address: "BBB", symbol: "BB", name: "Bb" }, liquidity: { usd: 9000 }, volume: { h24: 50000 }, priceChange: { h24: -70 }, pairCreatedAt: NOW - 100 * 36e5, url: "u2" }],
  "currently-live": [{ symbol: "PP", name: "Pp", mint: "MMM", created_timestamp: NOW - 2 * 36e5, usd_market_cap: 12000, complete: false }] };
globalThis.fetch = async (u, o = {}) => { u = String(u); fetchLog.push(u);
  if (u.startsWith("https://push.example")) { pushes++; return new Response(null, { status: 201 }); }
  for (const k in FIX) if (u.includes(k)) return new Response(JSON.stringify(FIX[k]), { status: 200 });
  if (u.includes("solana") && (o.method === "POST")) throw new Error("blocked"); return new Response("[]", { status: 200 }); };
const src = fs.readFileSync(new URL("../cf/api.js", import.meta.url), "utf8");
const M = new Function("Date", src + "\nreturn { paydays, buildReminders, cron, api, refreshMarket, cleanCfg, cfg };")(FD);
const env = { MC: KV }, D = { usage: { pct: 1, as_of: "x" } };
let pass = 0, fail = 0; const ok = (c, m) => (c ? (pass++, console.log("PASS", m)) : (fail++, console.log("FAIL", m)));
const at = (iso) => (NOW = Date.parse(iso));
const post = async (p, b) => { const r = await M.api(new Request("https://x" + p, { method: "POST", body: JSON.stringify(b) }), env, D, p); return [r.status, await r.json()]; };
const gym = async () => (await M.buildReminders(env, new FD())).items.filter((r) => r.kind === "gym");
// payday rule
ok(JSON.stringify(M.paydays(2026, 10)) === '["2026-11-12","2026-11-26"]', "Nov 2026 paydays = 12th and 26th");
ok(JSON.stringify(M.paydays(2026, 11)) === '["2026-12-10","2026-12-24"]', "Dec 2026 paydays = 10th and 24th (day 8-14 / 22-28)");
ok(M.paydays(2026, 0).every((d) => { const x = new Date(d + "T12:00:00Z"); return x.getUTCDay() === 4 && ((x.getUTCDate() >= 8 && x.getUTCDate() <= 14) || (x.getUTCDate() >= 22 && x.getUTCDate() <= 28)); }), "Jan 2027-style check: always Thursday in 8-14/22-28");
at("2026-11-02T13:00:00Z"); ok((await M.buildReminders(env, new FD())).next_payday === "2026-11-12", "next payday from Nov 2 is Nov 12");
at("2026-11-11T14:00:00Z"); ok((await M.buildReminders(env, new FD())).items.some((r) => r.id === "payday-eve:2026-11-11"), "Wed Nov 11: payday tomorrow");
at("2026-11-12T14:00:00Z"); ok((await M.buildReminders(env, new FD())).items.some((r) => r.id === "payday:2026-11-12"), "Thu Nov 12: payday today");
at("2026-11-05T14:00:00Z"); ok(!(await M.buildReminders(env, new FD())).items.some((r) => r.kind === "payday"), "Thu Nov 5 (1st Thursday): no payday");
// gym default 5:30, DST-safe
at("2026-11-02T10:29:00Z"); ok(!(await gym()).length, "5:29 AM EST: no gym yet");
at("2026-11-02T10:30:00Z"); ok((await gym())[0]?.id === "gym:2026-11-02@05:30", "5:30 AM EST: gym fires");
at("2026-07-01T09:30:00Z"); ok((await gym()).length === 1, "5:30 AM EDT (summer, UTC-4): gym fires");
at("2026-07-01T09:00:00Z"); ok(!(await gym()).length, "5:00 AM EDT: not yet");
// settings: today-only 3:30 PM and daily time
at("2026-11-02T11:00:00Z");
let [s, j] = await post("/api/settings", { gym_once: { date: "2026-11-02", time: "15:30" } }); ok(s === 200 && j.cfg.gym_once.time === "15:30", "save today-only gym 15:30");
ok(!(await gym()).length, "6 AM with 3:30 PM override: no gym");
at("2026-11-02T20:00:00Z"); ok(!(await gym()).length, "3:00 PM: not yet");
at("2026-11-02T20:30:00Z"); const g = await gym(); ok(g[0]?.id === "gym:2026-11-02@15:30" && /3:30 PM/.test(g[0].title), "3:30 PM ET: gym fires, title " + g[0]?.title);
at("2026-11-03T10:30:00Z"); ok((await gym())[0]?.id === "gym:2026-11-03@05:30", "next day back to daily 5:30");
[s] = await post("/api/settings", { gym: { time: "25:00" } }); ok(s === 400, "bad time rejected");
[s] = await post("/api/settings", { payday: { weekday: 4, weeks: [] } }); ok(s === 400, "empty payday weeks rejected");
[s, j] = await post("/api/settings", { gym: { time: "15:30" } }); ok(j.cfg.gym.time === "15:30", "daily gym time editable");
await post("/api/settings", { gym: { time: "05:30" } });
// cron dedupe: one push per date+time
mem.set("pushsubs", JSON.stringify([{ endpoint: "https://push.example/abc" }])); mem.delete("pushed"); pushes = 0;
at("2026-11-02T20:30:00Z"); await M.cron(env, D, "*/30"); at("2026-11-02T21:00:00Z"); await M.cron(env, D, "*/30"); at("2026-11-02T21:30:00Z"); const l = await M.cron(env, D, "*/30");
ok(pushes === 1, "gym pushed once across 3 ticks (pushes=" + pushes + ")"); ok(/market dex 2 SOL \$95.5/.test(JSON.stringify(JSON.parse(mem.get("cronlog")))) || /reminders/.test(l.steps.join()), "cron ran: " + l.steps.join(" | "));
// market
const m = JSON.parse(mem.get("market")); ok(m.dex.length === 2 && m.dex[0].sym === "AA" && m.dex[0].scout === "WATCH" && m.dex[1].scout === "SKIP" && m.sol_price === 95.5 && !m.errors.length, "market: dex WATCH/SKIP rule + SOL price stored in KV");
ok(fetchLog.filter((u) => u.includes("token-boosts")).length === 4, "market hourly: 2 refreshes over 3 ticks in 60 min, not 3");
// SOL price fallback when DexScreener is rate-limited
FIX["solana/So11111111111111111111111111111111111111112"] = { status: 429 }; FIX["coinbase.com"] = { data: { amount: "93.8" } };
mem.delete("market"); const m2 = await M.refreshMarket(env); ok(m2.sol_price === 93.8 && m2.sol_src === "coinbase", "SOL price falls back to Coinbase when DexScreener fails: " + m2.sol_price + " " + m2.errors.join(";"));
// usage alerts
pushes = 0; [s, j] = await post("/api/usage", { pct: 32 }); ok(s === 200 && !j.alert, "32%: no alert");
[s, j] = await post("/api/usage", { pct: 36.3 }); ok(j.alert === "Usage 36.3% (cap 33%)" && pushes === 1, "36.3%: 33% alert + push");
[s, j] = await post("/api/usage", { pct: 37 }); ok(!j.alert && pushes === 1, "37%: 33% alert not repeated");
[s, j] = await post("/api/usage", { pct: 40.2 }); ok(/cap 40%/.test(j.alert) && pushes === 2, "40.2%: 40% alert + push");
[s] = await post("/api/usage", { pct: 140 }); ok(s === 400, "bad % rejected");
const st = await (await M.api(new Request("https://x/api/state"), env, D, "/api/state")).json();
ok(st.usage_hist.length === 4 && st.reminders.items.some((r) => r.kind === "usage") && /Helius/.test(st.wallet_note) && st.market.dex.length === 2 && /Helius/.test(JSON.stringify((await M.cron(env, D, "x"), JSON.parse(mem.get("digest"))).lines)), "state serves usage history, banner, market, Helius note");
[s, j] = await post("/api/settings", { usage_alerts: [45, 50] }); ok(j.cfg.usage_alerts.join() === "45,50", "alert levels configurable");
console.log(fail ? fail + " FAIL" : "ALL PASS", pass + "/" + (pass + fail)); process.exit(fail ? 1 : 0);
