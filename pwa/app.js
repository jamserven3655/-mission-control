"use strict";
const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const link = (id) => "grokbot://app/v1/agent?id=" + id;
const money = (n) => "$" + Number(n).toFixed(2);
let D, ci = 0;
const card = (title, body, cls = "") => `<section class="card glass ${cls}" style="--i:${ci++}"><h2><span class="glow"></span>${esc(title)}</h2>${body}</section>`;

function clock() {
  $("#clock").textContent = new Date().toLocaleString("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", second: "2-digit" }) + " ET";
}
function countUp(root) {
  const rm = matchMedia("(prefers-reduced-motion: reduce)").matches;
  root.querySelectorAll("[data-count]").forEach((el) => {
    const to = parseFloat(el.dataset.count), pre = el.dataset.pre || "", suf = el.dataset.suf || "", dec = +(el.dataset.dec || 0), t0 = performance.now();
    const step = (t) => { const k = rm ? 1 : Math.min(1, (t - t0) / 1100), e = 1 - Math.pow(1 - k, 3); el.textContent = pre + (to * e).toFixed(dec) + suf; if (k < 1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  });
  requestAnimationFrame(() => setTimeout(() => {
    root.querySelectorAll(".bar i[data-w]").forEach((b) => (b.style.width = b.dataset.w + "%"));
    root.querySelectorAll(".ring .fg[data-p]").forEach((c) => { const L = 2 * Math.PI * 40; c.style.strokeDashoffset = L * (1 - Math.min(1, c.dataset.p / 100)); });
  }, 60));
}
const tone = (p) => (p >= 90 ? "bad" : p >= 75 ? "warn" : "ok");
const ring = (pct, val, label, color) => { const L = 2 * Math.PI * 40; const c = color || (pct >= 90 ? "var(--rd)" : pct >= 75 ? "var(--am)" : "var(--cy)");
  return `<div class="ring"><svg viewBox="0 0 96 96"><circle class="bg" cx="48" cy="48" r="40"/><circle class="fg" cx="48" cy="48" r="40" stroke="${c}" stroke-dasharray="${L}" stroke-dashoffset="${L}" data-p="${pct}" style="filter:drop-shadow(0 0 6px ${c})"/></svg><div class="rv mono" style="display:grid;place-items:center">${esc(val)}</div><div class="rl">${esc(label)}</div></div>`; };
function spark(pts, w = 280, h = 56) {
  const v = pts.map((p) => p[1]), mx = Math.max(...v), mn = Math.min(...v), r = mx - mn || 1;
  const xy = v.map((y, i) => [(i / Math.max(1, v.length - 1)) * (w - 8) + 4, h - 6 - ((y - mn) / r) * (h - 14)]);
  const d = xy.map((p, i) => (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" ");
  const up = v[v.length - 1] >= v[0], c = up ? "var(--gr)" : "var(--rd)";
  return `<svg viewBox="0 0 ${w} ${h}" width="100%" height="${h}" preserveAspectRatio="none"><defs><linearGradient id="sg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${up ? "#3dffa2" : "#ff4d6d"}" stop-opacity=".35"/><stop offset="1" stop-opacity="0"/></linearGradient></defs><path d="${d} L${w - 4} ${h} L4 ${h} Z" fill="url(#sg)"/><path d="${d}" fill="none" stroke="${c}" stroke-width="2" style="filter:drop-shadow(0 0 4px ${c})"/>${xy.map((p) => `<circle cx="${p[0]}" cy="${p[1]}" r="2.5" fill="${c}"/>`).join("")}</svg><div class="legend mono" style="justify-content:space-between">${pts.map((p) => `<span>${esc(p[0])}</span>`).join("")}</div>`;
}
const bars = (rows, maxv) => rows.map((r) => `<div class="blabel"><span>${esc(r[0])}${r[2] ? ` <span style="color:var(--dim);font-size:12px">· ${esc(r[2])}</span>` : ""}</span><b class="mono">${esc(r[3] ?? r[1] + "%")}</b></div><div class="bar"><i data-w="${(r[1] / maxv) * 100}"></i></div>`).join("");

function heat() {
  const H = D.heat, m = {}; let mx = 1; H.cells.forEach(([d, h, v]) => { m[d + h] = v; mx = Math.max(mx, v); });
  const hl = (h) => (h === 0 ? "12a" : h < 12 ? h + "a" : h === 12 ? "12p" : h - 12 + "p");
  let s = `<div class="heat"><span></span>${Array.from({ length: 24 }, (_, h) => `<span style="text-align:center">${h % 6 === 0 ? hl(h) : ""}</span>`).join("")}`;
  H.days.forEach((d) => { s += `<span class="mono">${esc(d.replace(/^\w+ /, ""))}</span>`; for (let h = 0; h < 24; h++) { const v = m[d + h] || 0; s += `<i title="${esc(d)} ${hl(h)}: ${v}" style="${v ? `background:rgba(34,228,255,${0.25 + 0.75 * v / mx});box-shadow:0 0 8px rgba(34,228,255,${0.6 * v / mx})` : ""}"></i>`; } });
  return s + `</div><p class="note">${esc(H.note)}</p>`;
}
const pillFor = (s) => (s === "Scheduled" ? "ok" : s === "Paused" ? "mut" : "warn");
function viewWallets() {
  const s = D.stats, bucketPct = (D.total / 88) * 100, capPct = (s.grok_extra / s.grok_cap) * 100;
  const tbl = D.wallets.map((w) => { const c = w.now - w.prev; return `<div class="tok"><div><b>${esc(w.name)}</b> <span style="color:var(--mut)">${esc(w.hold)}</span></div><div class="mono" style="text-align:right"><b>${money(w.now)}</b></div><div class="addr">${esc(w.addr)}</div><div class="mono" style="text-align:right;font-size:12px;color:${Math.abs(c) >= 5 ? "var(--rd)" : "var(--dim)"}">${c >= 0 ? "+" : "-"}${money(Math.abs(c))} vs ${money(w.prev)}</div></div>`; }).join("") +
  `<div class="tok"><b>Total</b><div class="mono" style="text-align:right"><b>${money(D.total)}</b></div><div></div><div class="mono" style="text-align:right;font-size:12px;color:var(--rd)">-${money(D.oct27_total - D.total)} vs Oct 27</div></div>`;
  const P=D.pnl; const pnlCard = P ? card("Profit & loss", P.rows.map(r=>`<div class="tok"><b>${esc(r[0])}</b><div class="mono" style="text-align:right;color:${r[1].startsWith('-')?'var(--rd)':'var(--fg)'}"><b>${esc(r[1])}</b></div><div></div><div style="font-size:12px;opacity:.75">${esc(r[2])}</div></div>`).join("")+`<p class="note">As of ${esc(P.as_of)}. Real-wallet numbers are read-only estimates from on-chain history.</p>`) : "";
  const SP=D.spending; const spendCard = SP ? card("Spending", `<div style="display:flex;gap:18px;flex-wrap:wrap"><div><div class="mono" style="font-size:22px;font-weight:700">${money(SP.week_total||0)}</div><div style="font-size:12px;opacity:.75">This week</div></div><div><div class="mono" style="font-size:22px;font-weight:700">${money(SP.month_total||0)}</div><div style="font-size:12px;opacity:.75">This month</div></div></div>` + ((SP.rows||[]).length ? SP.rows.slice(0,15).map(r=>`<div class="tok"><b>${esc(r.store)}</b><div class="mono" style="text-align:right"><b>${money(r.amount)}</b></div><div style="font-size:12px;opacity:.75">${esc(r.date)} · ${esc(r.category)}</div><div style="font-size:12px;opacity:.75;text-align:right">${esc(r.source)}</div></div>`).join("") : `<p class="note">No entries yet</p>`) + `<p class="note">${esc(SP.hint||"")} Source: ${esc(SP.source||"")}.</p>`) : "";
  return pnlCard + spendCard + card("Wallets", `<div style="display:flex;justify-content:space-between;align-items:baseline"><div class="mono" style="font-size:30px;font-weight:700;color:var(--fg)"><span data-count="${D.total}" data-pre="$" data-dec="2">$0</span></div><span class="pill bad"><span class="dot bad"></span>-${money(D.oct27_total - D.total)} since Oct 27</span></div>${spark(D.history)}` + tbl + `<p class="note">Read from the public Solana RPC with Jupiter prices; SOL at ${money(D.sol_price)}. ${esc(D.wallet_note)}</p>`) +
  card("Risk Keeper", `<div class="rings">${ring(bucketPct, money(D.total), "of $88 bucket", "var(--cy)")}${ring(((D.paper.summary.open || 0) / 2) * 100, (D.paper.summary.open || 0) + " / 2", "Open paper positions", "var(--gr)")}${ring(capPct, "$" + s.grok_extra, "of $" + s.grok_cap + " Grok cap")}</div>` +
  D.risk.map(([k, v]) => `<div class="row"><div class="t" style="color:var(--mut);flex:0 0 120px">${esc(k)}</div><div class="t">${esc(v)}</div></div>`).join("") +
  `<div class="row"><div class="t" style="color:var(--mut);flex:0 0 120px">Grok cap</div><div class="t"><span class="pill bad"><span class="dot bad"></span>Over: $${s.grok_extra} of $${s.grok_cap}</span><div class="s">LLM memecoin work stays paused until Nov 1. The paper engine is plain Python and uses no Grok credits.</div></div></div>`);
}
let src = "dex";
function viewTokens() {
  const T = src === "dex" ? D.dex : D.pump;
  const list = T.map((t) => `<div class="tok"><div><b>${esc(t.sym)}</b> <span style="color:var(--mut)">${esc(t.name)}</span><div class="addr">${esc(t.ca)}</div></div><div style="text-align:right"><span class="pill ${t.scout === "SKIP" ? "bad" : "warn"}">${esc(t.scout)}</span></div>
  <div class="k">age ${esc(t.age)} · liq ${esc(t.liq)} · vol ${esc(t.vol)} · <span style="color:${/^-/.test(t.chg) ? "var(--rd)" : /^\+/.test(t.chg) ? "var(--gr)" : "var(--mut)"}">${esc(t.chg)}</span></div><div><a href="${esc(t.url)}" target="_blank" rel="noopener">Open ↗</a></div>
  <div class="s" style="grid-column:1/-1;font-size:12.5px;color:var(--mut)">${esc(t.why)}</div>${t.liqn ? `<div style="grid-column:1/-1"><div class="bar" style="height:5px"><i data-w="${Math.min(100, (t.liqn / 250000) * 100)}"></i></div></div>` : ""}</div>`).join("");
  return card("Trending (from tok.py)", `<div class="seg"><button data-src="dex" class="${src === "dex" ? "on" : ""}">DexScreener</button><button data-src="pump" class="${src === "pump" ? "on" : ""}">pump.fun live</button></div>${list}<p class="note">Scout pre-screen is WATCH or SKIP only; WATCH needs liquidity of $50k or more and a 24h change above -50%. BUY needs RugCheck and DexScreener data you paste. Mint/freeze, top-10 and dev history are unverified for all. Bars show liquidity against $250k.</p>`);
}
function viewUsage() {
  const U = D.usage, days = Math.max(0, Math.ceil((new Date(U.reset) - Date.now()) / 864e5)), t = tone(U.pct), mx = Math.max(...U.days.map((d) => d[1] + d[2]));
  const stack = U.days.map(([d, a, b]) => `<div class="blabel"><span class="mono">${esc(d)}</span><b class="mono">${a + b}%</b></div><div class="bar" style="display:flex"><i data-w="${(a / mx) * 100}" style="background:var(--mg);box-shadow:0 0 10px rgba(255,61,242,.5);border-radius:6px 0 0 6px"></i><i data-w="${(b / mx) * 100}" style="border-radius:0 6px 6px 0"></i></div>`).join("");
  return card("Usage", `<div style="display:flex;gap:18px;align-items:center;flex-wrap:wrap">${ring(U.pct, U.pct + "%", "Plan used")}<div style="flex:1;min-width:200px"><div style="margin-bottom:8px"><span class="pill ${t}"><span class="dot ${t}"></span>${U.pct}% used · resets in ${days} day${days === 1 ? "" : "s"}</span></div><div class="mono" style="font-size:13px">${esc(U.plan)} plan · resets ${esc(U.reset_label)}</div><p class="note">${esc(U.note)} Pill turns amber at 75% and red at 90%. As of ${esc(U.as_of)}.</p></div></div>`) +
  `<div class="grid">` + card("By bot and routine, highest first", bars(U.by.slice().sort((a, b) => b[1] - a[1]), U.by.reduce((m, r) => Math.max(m, r[1]), 1)) + `<p class="note">${esc(U.routine_note)}</p>`) +
  card("By day, Oct 25 to 29", stack + `<div class="legend"><span><b style="background:var(--mg)"></b>Deleted bots and others</span><span><b style="background:var(--cy)"></b>Chief Bot</span></div><p class="note">Grok Bot's 1% isn't split by day.</p>`) + `</div>` +
  card("Ways to save", `<ol>${U.save.map((s) => `<li>${esc(s)}</li>`).join("")}</ol>`);
}
const hidden = JSON.parse(localStorage.getItem("mc-hidden") || "{}");
function viewWaiting() {
  return card("Waiting on me", D.waiting.map(([t, b], i) => `<div class="row"><span class="dot warn" style="margin-top:7px"></span><div class="t"><div class="${hidden[i] ? "blur" : ""}" id="w${i}">${esc(t)}</div><div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap"><a class="btn pri" href="${link(D.bots[b].id)}">Open ${esc(D.bots[b].name)}</a><button class="btn" data-hide="${i}">${hidden[i] ? "Show" : "Hide"}</button></div></div></div>`).join("") + `<p class="note">Hide blurs an item on this device only.</p>`);
}
/* ---------- Mission Control 2.0: local state (this device only) ---------- */
const KEY = "mc2";
const ST = Object.assign({ v: 2, tasks: [], income: [], expenses: [], levels: {}, custom: [], autoSeen: {} }, JSON.parse(localStorage.getItem(KEY) || "{}"));
let saveT; const save = () => { clearTimeout(saveT); saveT = setTimeout(() => { ST.saved = new Date().toISOString(); localStorage.setItem(KEY, JSON.stringify(ST)); const s = $("#saved"); if (s) s.textContent = "Saved " + new Date().toLocaleTimeString("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" }) + " ET"; }, 250); };
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const todayET = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
const ROOMS = [["cmd", "Command Center"], ["trade", "Trading Floor"], ["research", "Research"], ["finance", "Finance"], ["income", "Income Lab"]];
const PROPOSALS = { chief: ["Usage Guard", "Warns before the Grok cap is hit"], scout: ["Holder Checker", "Re-checks top holders on WATCH tokens"], paper: ["Journal Keeper", "Writes a lesson for every closed paper trade"],
  risk: ["Bill Watcher", "Flags bills due in the next 7 days"], analyst: ["Weekly Reviewer", "Sunday summary of the week"], finance: ["Subscription Trimmer", "Lists subscriptions worth cancelling"], income: ["Gig Finder", "Collects local gig leads"] };
const hoursOld = () => (Date.now() - new Date(D.updated_iso)) / 36e5;
const stale = () => hoursOld() > 30;
const ps = () => D.paper.summary || {};
const paperPnl = () => (ps().net || 0) + (ps().unrealized || 0);
function money5k() { let rev = 0, exp = 0, sav = 0; ST.income.forEach((e) => { if (e.kind === "revenue") rev += +e.amt; else if (e.kind === "expense") exp += +e.amt; else sav += +e.amt; }); return { rev, exp, profit: rev - exp, sav, total: Math.max(0, rev - exp) + sav }; }
function allExpenses() { return D.expenses.map((x) => ({ ...x, src: "Notion" })).concat(ST.expenses.map((x) => ({ ...x, src: "This device" }))); }
const CATMAP = { Alcohol: "Alcohol", Food: "Restaurants", Restaurants: "Restaurants", Tobacco: "Tobacco", Crypto: "Crypto" };
function weekSpend() {
  const d = new Date(todayET() + "T12:00:00"), wk0 = new Date(d - ((d.getDay() + 6) % 7) * 864e5).toISOString().slice(0, 10), w = {};
  Object.keys(D.caps_weekly).forEach((k) => (w[k] = 0));
  allExpenses().forEach((x) => { const c = CATMAP[x.category]; if (c && (x.date || "") >= wk0) w[c] += +x.amount || 0; });
  return w;
}
function wasteFlags() {
  const f = [], w = weekSpend();
  Object.entries(D.caps_weekly).forEach(([k, cap]) => { if (w[k] > cap) f.push([k, `$${w[k].toFixed(2)} this week, cap $${cap}`]); });
  const subs = {}; allExpenses().forEach((x) => { if (x.category === "Subscriptions") { const m = (x.merchant || "").toLowerCase(); subs[m] = (subs[m] || 0) + 1; } });
  Object.entries(subs).forEach(([m, n]) => n > 1 && f.push([m, `Subscription charged ${n} times: possible duplicate`]));
  D.subscriptions.forEach(([n, a, s]) => /unconfirmed|paused|check/i.test(s) && f.push([n, "May be unnecessary: " + s]));
  if (D.stats.grok_extra > D.stats.grok_cap) f.push(["Grok extra usage", `$${D.stats.grok_extra} vs $${D.stats.grok_cap} cap`]);
  return f;
}
const grokPct = () => (D.stats.grok_extra / D.stats.grok_cap) * 100;
function agents() { return D.agents.concat(ST.custom); }
/* rule-based tasks agents hand each other (deterministic, from data.json) */
function autoTasks() {
  const A = [], s = ps();
  if (s.open) A.push(["risk", "paper", `Re-check ${s.open} open paper position(s) at the next run`]);
  if (D.scan.pick) A.push(["scout", "risk", `Confirm ${D.scan.pick.sym} still passes filters tomorrow`]);
  if (!D.expenses.length) A.push(["finance", "chief", "Ask James to log this week's spending in the Notion Inbox"]);
  if (grokPct() >= 80) A.push(["analyst", "chief", "Keep refreshes to once a weekday: Grok extra spend is at " + Math.round(grokPct()) + "% of the cap"]);
  if (stale()) A.push(["analyst", "chief", "Data is stale: rerun the morning refresh"]);
  A.forEach(([from, to, text]) => { const k = D.updated_iso + "|" + text; if (!ST.autoSeen[k]) { ST.autoSeen[k] = 1; ST.tasks.unshift({ id: uid(), from, to, text, done: false, ts: Date.now(), auto: true }); } });
  save();
}
const nameOf = (id) => (id === "you" ? "You" : (agents().find((a) => a.id === id) || {}).name || id);
function report(a) {
  const s = ps(), m = money5k();
  return ({ chief: `Last refresh ${D.updated}. ${D.briefing.length} briefing lines. Usage ${D.usage.pct}% (resets ${D.usage.reset_label}).`,
    scout: `${D.scan.decision}. ${D.scan.reason}. Scanned ${D.scan.candidates.length} shown of the pairs checked at ${D.scan.run || "n/a"}.`,
    paper: `${s.open || 0} open, ${s.closed || 0} closed. Net ${money(s.net || 0)} realized, ${money(s.unrealized || 0)} open, after fees ${money(s.fees || 0)} and slippage ${money(s.slippage || 0)}.`,
    risk: `Bucket left ${money(s.bucket_left ?? 88)} of $88. Max 2 open (now ${s.open || 0}). Daily stop after 3 losses.`,
    analyst: D.briefing.join(" "), finance: `This device: ${money(m.total)} toward $5,000. ${wasteFlags().length} spending flag(s). ${D.expenses.length} Notion expenses synced.`,
    income: `${D.income_ideas.length} ideas on the board. Revenue logged ${money(m.rev)}, profit ${money(m.profit)}.` })[a.id] || `Custom agent (this device only): ${a.role || ""}`;
}
/* ---------- HQ ---------- */
function mood() { if (stale()) return "amber"; const p = paperPnl(); if (p > 0 || money5k().total >= 5000) return "green"; if (p < 0) return "red"; return ""; }
function viewHQ() {
  const md = mood(), A = agents(), waste = D.stats.grok_extra > D.stats.grok_cap;
  const rooms = ROOMS.map(([id, nm]) => { const lv = ST.levels[id] || 1, here = A.filter((a) => a.room === id);
    const glow = id === "trade" ? (paperPnl() > 0 ? "green" : paperPnl() < 0 ? "red" : "") : id === "finance" && money5k().total >= 5000 ? "green" : "";
    return `<div class="room lv${lv} ${stale() ? "amber" : glow}"><div class="rh"><b>${esc(nm)}</b><span class="mono lvl">L${lv}</span></div><div class="decor">${"<i></i>".repeat(lv)}</div>
    <div class="desks">${here.map((a, i) => `<button class="agent" data-agent="${esc(a.id)}" style="--h:${a.hue || 200};--d:${i * 0.4}s"><span class="avatar"><span class="eye"></span><span class="eye"></span></span><span class="desk"></span><b>${esc(a.name)}</b><small>${esc(a.activity || a.role || "")}</small></button>`).join("") || '<p class="note">Empty room</p>'}</div>
    <button class="btn up" data-up="${id}" ${lv >= 5 ? "disabled" : ""}>${lv >= 5 ? "Max level" : "Upgrade room"}</button></div>`; }).join("");
  return card("HQ", `<div class="moodbar">${md === "green" ? '<span class="pill ok"><span class="dot ok"></span>In profit</span>' : md === "red" ? '<span class="pill bad"><span class="dot bad"></span>Paper loss</span>' : md === "amber" ? '<span class="pill warn"><span class="dot warn"></span>Stale data</span>' : '<span class="pill mut">Flat</span>'}${waste ? '<span class="pill warn">⚠ Waste: Grok extra over cap</span>' : ""}<button class="btn" data-addagent>+ Add agent</button></div><div class="hq ${md}">${rooms}</div><p class="note">Tap an agent for its report and to give it a task. Room levels are cosmetic and only saved on this device.</p>`) +
  card("Top stats", topStats()) + card("Daily briefing", `<ul class="brief">${D.briefing.map((l) => `<li>${esc(l.replace(/^- /, ""))}</li>`).join("")}</ul>`) + `<div class="grid">` + card("Tasks", tasksCard()) +
  card("Activity timeline", D.timeline.map(([b, w, t]) => `<div class="row"><div class="av ${b}">${esc(D.bots[b].short)}</div><div class="t">${esc(t)}<div class="s">${esc(D.bots[b].name)}, ${esc(w)} ET</div></div></div>`).join("")) +
  card("Activity heatmap", heat()) +
  card("Upcoming routines", D.routines.map(([t, d, m, s]) => `<div class="row"><span class="dot ${s === "Scheduled" ? "ok" : ""}" style="margin-top:6px"></span><div class="t">${esc(t)}<div class="s">${esc(d)}${m ? " · " + esc(m) : ""}</div></div><span class="pill ${pillFor(s)}">${esc(s)}</span></div>`).join("")) +
  card("Bots", ["chief", "grok"].map((k) => { const B = D.bots[k]; return `<div class="row"><div class="av ${k}">${esc(B.short)}</div><div class="t">${esc(B.name)}<div class="s">${esc(B.detail)}${B.last ? " · Last active " + esc(B.last) : ""}</div></div><span class="pill ${B.state === "working" ? "ok" : "mut"}"><span class="dot ${B.state === "working" ? "ok" : ""}"></span>${B.state === "working" ? "Working" : "Idle"}</span><a class="btn" href="${link(B.id)}">Open</a></div>`; }).join("") + `<p class="note">The roles in HQ (Scout, Paper Trader, Risk Keeper and the rest) are Chief Bot's scripts, not separate bots.</p>`) +
  card("Rules", D.rules.map((r, i) => `<div class="rule"><span class="dot ${i ? "" : "bad"}" style="margin-top:6px"></span><span${i ? "" : ' style="font-weight:600"'}>${esc(r)}</span></div>`).join("")) +
  card("Backup & sync", `<div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn pri" data-export>Export backup</button><label class="btn">Import backup<input type="file" accept="application/json" id="imp" hidden></label></div><p class="note mono" id="saved">${ST.saved ? "Saved " + new Date(ST.saved).toLocaleString("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) + " ET" : "Nothing saved yet"}</p><p class="note">Your tasks, income, expenses, room levels and custom agents autosave on this device only. No cloud sync: another phone won't see them. Export a backup before clearing Safari data. Agents read your tasks only if you send Chief Bot the exported file.</p>`) + `</div>`;
}
function topStats() {
  const s = ps(), m = money5k(), w = weekSpend(), capT = Object.values(D.caps_weekly).reduce((a, b) => a + b, 0), spT = Object.values(w).reduce((a, b) => a + b, 0), gp = grokPct();
  const st = (cls, v, l, d) => `<div class="stat glass ${cls}"><div class="v">${v}</div><div class="l">${esc(l)}</div><div class="d">${esc(d)}</div></div>`;
  const pn = paperPnl();
  return `<div class="stats">${st("", s.win_rate == null ? "n/a" : `<span data-count="${s.win_rate}" data-suf="%">0%</span>`, "Paper win rate", `${s.closed || 0} closed, ${s.open || 0} open`)}
  ${st(pn > 0 ? "good" : pn < 0 ? "bad" : "", (pn < 0 ? "-$" : "$") + Math.abs(pn).toFixed(2), "Paper net", `${money(s.net || 0)} realized + ${money(s.unrealized || 0)} open, after fees`)}
  ${st("cy", `<span data-count="${D.total}" data-pre="$" data-dec="2">$0</span>`, "Wallet total", "Down " + money(D.oct27_total - D.total) + " vs Oct 27")}
  ${st("cy", `<span data-count="${m.total}" data-pre="$" data-dec="0">$0</span>`, "$5K progress", (m.total / 50).toFixed(1) + "% of $5,000 by Dec 31")}
  ${st(spT > capT ? "bad" : "good", "$" + spT.toFixed(0) + " / $" + capT, "Weekly spend vs caps", D.expenses.length || ST.expenses.length ? "From Notion + this device" : "No spend logged yet")}
  ${st(gp >= 80 ? "bad" : "", "$" + D.stats.grok_month.toFixed(2), "Grok cost this month", `Extra $${D.stats.grok_extra} = ${Math.round(gp)}% of $${D.stats.grok_cap} cap${gp >= 100 ? " (over)" : gp >= 80 ? " (80% alert)" : ""}`)}
  ${st(stale() ? "bad" : "", esc(D.updated.replace(/, 20\d\d/, "")), "Last update", stale() ? `STALE: ${Math.round(hoursOld())} h old` : `${Math.round(hoursOld())} h ago`)}</div>`;
}
function tasksCard() {
  const opts = (sel) => ["you"].concat(agents().map((a) => a.id)).map((id) => `<option value="${esc(id)}" ${id === sel ? "selected" : ""}>${esc(nameOf(id))}</option>`).join("");
  return `<form class="frm" data-form="task"><input name="text" placeholder="New task" required maxlength="140"><select name="from" aria-label="From">${opts("you")}</select><select name="to" aria-label="For">${opts("chief")}</select><button class="btn pri">Add</button></form>` +
  (ST.tasks.map((t) => `<div class="row"><input type="checkbox" data-done="${t.id}" ${t.done ? "checked" : ""} aria-label="Done"><div class="t ${t.done ? "done" : ""}">${esc(t.text)}<div class="s">${esc(nameOf(t.from))} → ${esc(nameOf(t.to))}${t.auto ? " · auto" : ""}</div></div><button class="btn x" data-del="tasks:${t.id}" aria-label="Delete">✕</button></div>`).join("") || '<p class="note">No tasks yet.</p>') +
  `<p class="note">"auto" tasks come from simple rules on today's data, for example Risk Keeper to Paper Trader when a position is open.</p>`;
}
/* ---------- Trade ---------- */
const fmtUsd = (n) => (n == null ? "?" : n >= 1e6 ? "$" + (n / 1e6).toFixed(1) + "M" : n >= 1e3 ? "$" + (n / 1e3).toFixed(1) + "k" : "$" + Math.round(n));
function viewTrade() {
  const S = D.scan, P = D.paper, s = P.summary || {}, pk = S.pick;
  const pickCard = card("Paper pick of the day", pk ? `<div class="pick"><div><div class="mono big">${esc(pk.sym)}</div><div class="s">${esc(pk.name)} · score ${pk.score}</div><div class="addr">${esc(pk.ca)}</div></div><span class="pill ok"><span class="dot ok"></span>PAPER PICK</span></div><p class="note">${esc(S.reason)}. Entry $${pk.price} with 1% fee and 2% slippage each side. Paper only: nothing is bought.</p><a class="btn" href="${esc(pk.url)}" target="_blank" rel="noopener">DexScreener ↗</a>`
    : `<div class="pick"><div class="mono big" style="color:var(--am)">NO TRADE today</div></div><p class="note">${esc(S.reason)}.</p>`) ;
  const tr = P.trades.map((t) => `<div class="tok"><div><b>${esc(t.sym)}</b> <span class="pill ${t.status === "open" ? "warn" : t.net > 0 ? "ok" : "bad"}">${t.status}</span><div class="k">opened ${esc(t.opened)}${t.closed ? " · closed " + esc(t.closed) : ""} · ${esc(t.last_event)}${t.half ? " · half sold" : ""}</div></div><div class="mono" style="text-align:right">${t.status === "open" ? "x" + t.x : (t.net >= 0 ? "+" : "") + money(t.net)}<div class="k">fees ${money(t.fees)}</div></div></div>`).join("") || '<p class="note">No paper trades yet.</p>';
  const cand = S.candidates.map((c) => { const r = c.rug || {}; return `<div class="tok"><div><b>${esc(c.sym)}</b> <span style="color:var(--mut)">${esc(c.name)}</span><div class="addr">${esc(c.ca)}</div></div><div style="text-align:right"><span class="pill ${c.scout === "WATCH" ? "ok" : "bad"}">${c.scout}</span><div class="k">score ${c.score}</div></div>
  <div class="k" style="grid-column:1/-1">liq ${fmtUsd(c.liq)} · vol ${fmtUsd(c.vol24)} (${c.vol_liq}x) · age ${c.age_h < 48 ? Math.round(c.age_h) + " h" : Math.round(c.age_h / 24) + " d"} · 1h ${c.chg1 ?? "?"}% · 24h ${c.chg24 ?? "?"}% · buys/sells ${c.bs1}</div>
  <div class="k" style="grid-column:1/-1">RugCheck: ${r.ok ? `mint ${r.mint_auth ? "ON" : "off"}, freeze ${r.freeze_auth ? "ON" : "off"}, top-10 ${r.top10}%, ${r.holders} holders` : r.err ? "UNVERIFIED" : "not run"}</div>
  ${c.flags.length ? `<div class="flags" style="grid-column:1/-1">${c.flags.map((f) => `<span class="pill bad">${esc(f)}</span>`).join("")}</div>` : ""}<div style="grid-column:1/-1"><a href="${esc(c.url)}" target="_blank" rel="noopener">Open ↗</a></div></div>`; }).join("");
  const R = P.rules || {};
  const openT=((D.paper&&D.paper.trades)||[]).filter(t=>t.status==="open");
  const liveCard = card("Open paper positions (live)", openT.length ? openT.map(t=>`<div class="tok"><b>${esc(t.sym)}</b><div class="mono" style="text-align:right;color:${t.x>=1?'var(--gr)':'var(--rd)'}"><b>${t.x>=1?'+':''}${Math.round((t.x-1)*100)}%</b></div><div></div><div style="font-size:12px;opacity:.75">Entry $${t.entry} on ${esc(t.opened)} · last checked $${t.last}</div></div><iframe src="${esc(t.url)}?embed=1&loadChartSettings=0&trades=0&info=0&chartTheme=dark&theme=dark&chartStyle=1&chartType=usd&interval=15" style="width:100%;height:340px;border:0;border-radius:12px;margin:8px 0" loading="lazy" title="${esc(t.sym)} live chart"></iframe><a class="btn" href="${esc(t.url)}" target="_blank" rel="noopener">Open ${esc(t.sym)} live ↗</a>`).join("")+`<p class="note">The chart is live from DexScreener. The % is from the last refresh. Paper only.</p>` : `<p class="note">No open paper positions.</p>`);
  return liveCard + pickCard + card("Paper results", `<div class="rings">${ring(s.win_rate || 0, s.win_rate == null ? "n/a" : s.win_rate + "%", "Win rate", "var(--gr)")}${ring(((s.open || 0) / 2) * 100, (s.open || 0) + " / 2", "Open positions", "var(--am)")}${ring(((s.bucket_left ?? 88) / 88) * 100, money(s.bucket_left ?? 88), "Bucket left", "var(--cy)")}</div>
  <div class="stats" style="margin-top:12px"><div class="stat glass ${(s.net || 0) < 0 ? "bad" : ""}"><div class="v">${money(s.net || 0)}</div><div class="l">Net realized</div></div><div class="stat glass ${(s.unrealized || 0) < 0 ? "bad" : "good"}"><div class="v">${money(s.unrealized || 0)}</div><div class="l">Open, marked to market</div></div><div class="stat glass"><div class="v">${s.avg_hold_h == null ? "n/a" : s.avg_hold_h + " h"}</div><div class="l">Avg hold</div></div></div>${tr}
  <p class="note">Rules: $${R.stake} per trade, ${R.fee * 100}% fee and ${R.slip * 100}% slippage each side; sell half at 2x, trail the rest 30% from peak, hard stop -50%, max hold 3 days. Prices are checked once each weekday at the morning run, so exits are approximate.</p>`) +
  card("Scout candidates", cand + `<p class="note">WATCH only if every filter passes: liquidity $${(S.filters || {}).min_liq / 1000}k+, volume under ${(S.filters || {}).max_vol_liq}x liquidity, older than 24 h, more 1h buys than sells, not dumping, has socials, RugCheck mint and freeze off, top-10 holders ${(S.filters || {}).max_top10}% or less, 500+ holders. Scan ${esc(S.run || "n/a")}.</p>`) + viewTokens();
}
/* ---------- Money ---------- */
function viewMoney() {
  const m = money5k(), pct = Math.min(100, (m.total / 5000) * 100), days = Math.max(0, Math.ceil((new Date("2026-12-31T23:59:00-05:00") - Date.now()) / 864e5)), w = weekSpend(), fl = wasteFlags(), gp = grokPct();
  const need = Math.max(0, 5000 - m.total) / Math.max(1, days / 7);
  const ent = ST.income.map((e) => `<div class="row"><span class="pill ${e.kind === "expense" ? "bad" : e.kind === "saving" ? "ok" : "warn"}">${e.kind}</span><div class="t">${esc(e.note || "")}<div class="s">${esc(e.date)}</div></div><b class="mono">${e.kind === "expense" ? "-" : "+"}${money(e.amt)}</b><button class="btn x" data-del="income:${e.id}" aria-label="Delete">✕</button></div>`).join("") || '<p class="note">No entries yet.</p>';
  const ex = allExpenses().slice().sort((a, b) => (b.date || "").localeCompare(a.date || "")).slice(0, 30).map((x) => `<div class="row"><div class="t">${esc(x.merchant)} <span class="s">· ${esc(x.category)}${x.card ? " · " + esc(x.card) : ""}</span><div class="s">${esc(x.date)} · ${esc(x.src)}</div></div><b class="mono">${money(x.amount)}</b>${x.id ? `<button class="btn x" data-del="expenses:${x.id}" aria-label="Delete">✕</button>` : ""}</div>`).join("") || '<p class="note">No expenses yet. Jot them in the Notion Inbox (synced each weekday morning) or add them here.</p>';
  const capsRows = Object.entries(D.caps_weekly).map(([k, c]) => [k, c ? Math.min(100, (w[k] / c) * 100) : w[k] > 0 ? 100 : 0, "", `$${w[k].toFixed(2)} / $${c}`]);
  return card("$5,000 mission", `<div style="display:flex;gap:18px;align-items:center;flex-wrap:wrap">${ring(pct, money(m.total), "of $5,000", pct >= 100 ? "var(--gr)" : "var(--cy)")}<div style="flex:1;min-width:200px"><div class="mono">${days} days left · need about ${money(need)}/week</div><p class="note">Profit ${money(m.profit)} (revenue ${money(m.rev)} minus costs ${money(m.exp)}) plus savings ${money(m.sav)}. Entered on this device. Server-confirmed savings: $${D.stats.savings}.</p></div></div>
  <form class="frm" data-form="income"><select name="kind"><option value="revenue">Revenue</option><option value="expense">Business cost</option><option value="saving">Saving (confirmed transfer)</option></select><input name="amt" type="number" step="0.01" min="0" placeholder="$" required><input name="note" placeholder="What" maxlength="80"><button class="btn pri">Add</button></form>${ent}`) +
  `<div class="grid">` + card("Spending vs weekly caps", bars(capsRows, 100) + `<form class="frm" data-form="expense"><input name="merchant" placeholder="Merchant" required maxlength="60"><input name="amount" type="number" step="0.01" min="0" placeholder="$" required><select name="category">${["Food", "Gas", "Bills", "Subscriptions", "Fun", "Alcohol", "Tobacco", "Crypto", "Other"].map((c) => `<option>${c}</option>`).join("")}</select><input name="card" placeholder="Card last 4 (optional)" maxlength="4" pattern="[0-9]{0,4}" inputmode="numeric"><button class="btn pri">Add</button></form>${ex}<p class="note">Food counts toward the restaurants cap. Notion Expenses (synced by the morning routine) are the main record; entries here stay on this device. Card: last 4 digits at most.</p>`) +
  card("Unnecessary spending flags", (fl.map(([n, why]) => `<div class="row"><span class="dot warn" style="margin-top:6px"></span><div class="t">${esc(n)}<div class="s">${esc(why)}</div></div></div>`).join("") || '<p class="note">Nothing flagged.</p>') + (gp >= 80 ? `<p class="note"><span class="pill ${gp >= 100 ? "bad" : "warn"}">Grok budget alert: ${Math.round(gp)}% of the $${D.stats.grok_cap} monthly cap</span></p>` : "")) +
  card("Bills & subscriptions", D.subscriptions.map(([n, a, s]) => `<div class="row"><div class="t">${esc(n)}<div class="s">${esc(a)}</div></div><span class="pill ${/unconfirmed|paused|check/i.test(s) ? "warn" : "mut"}">${esc(s.split(";")[0].split("(")[0].trim())}</span></div>`).join("") + `<p class="note">From the Oct 28 Gmail sweep. Cancel only after you approve.</p>`) +
  card("Income ideas", `<ol>${D.income_ideas.map(([t, d]) => `<li><b>${esc(t)}</b><div class="s" style="color:var(--mut);font-size:13px">${esc(d)}</div></li>`).join("")}</ol><p class="note">Ideas only. No guaranteed returns.</p>`) + `</div>`;
}
/* ---------- sheet (agent detail / add agent) ---------- */
function sheet(html) { const el = $("#sheet"); el.innerHTML = `<div class="sh glass">${html}<button class="btn" data-close style="margin-top:12px;width:100%">Close</button></div>`; el.classList.add("on"); }
function agentSheet(id) {
  const a = agents().find((x) => x.id === id); if (!a) return; const pr = PROPOSALS[a.id], open = ST.tasks.filter((t) => t.to === a.id && !t.done);
  sheet(`<div class="row" style="border:0"><span class="avatar" style="--h:${a.hue || 200}"><span class="eye"></span><span class="eye"></span></span><div class="t"><b>${esc(a.name)}</b><div class="s">${esc(a.role || "")}</div></div></div>
  <h2>Latest report</h2><p>${esc(report(a))}</p><h2>Open tasks (${open.length})</h2>${open.map((t) => `<div class="s">• ${esc(t.text)} <span style="color:var(--dim)">from ${esc(nameOf(t.from))}</span></div>`).join("") || '<p class="note">None</p>'}
  <form class="frm" data-form="assign" data-to="${esc(a.id)}"><input name="text" placeholder="Give ${esc(a.name)} a task" required maxlength="140"><button class="btn pri">Assign</button></form>
  ${pr && !agents().some((x) => x.name === pr[0]) ? `<h2>Proposal</h2><p>${esc(a.name)} proposes a new agent: <b>${esc(pr[0])}</b>, ${esc(pr[1])}.</p><button class="btn pri" data-approve="${esc(a.id)}">Approve and add</button>` : ""}
  ${a.custom ? `<button class="btn" data-rmagent="${esc(a.id)}" style="margin-top:10px">Remove agent</button>` : ""}<p class="note">Saved on this device only. Chief Bot sees tasks only if you send it the exported backup.</p>`);
}
function addAgentSheet() { sheet(`<h2>Add agent</h2><form class="frm" data-form="agent"><input name="name" placeholder="Name" required maxlength="24"><input name="role" placeholder="What it does" maxlength="80"><select name="room">${ROOMS.map(([i, n]) => `<option value="${i}">${n}</option>`).join("")}</select><button class="btn pri">Add</button></form><p class="note">A custom agent is a card in HQ for planning. It isn't a real bot and doesn't run.</p>`); }
const VIEWS = { hq: viewHQ, trade: viewTrade, money: viewMoney, wallets: viewWallets, usage: viewUsage, waiting: viewWaiting };
let cur = location.hash.slice(1) in VIEWS ? location.hash.slice(1) : "hq";
function render() {
  ci = 0; const app = $("#app");
  app.innerHTML = `${stale() ? `<div class="stale mono">STALE: data is ${Math.round(hoursOld())} h old (last update ${esc(D.updated)})</div>` : ""}<div class="view on">${VIEWS[cur]()}</div><p class="note mono" style="text-align:center;margin-bottom:10px">Last updated ${esc(D.updated)}${D.offline ? " · offline copy" : ""}</p>`;
  document.querySelectorAll(".tabs button").forEach((b) => b.classList.toggle("on", b.dataset.tab === cur));
  countUp(app);
}
document.addEventListener("click", (e) => {
  const g = (s) => e.target.closest(s);
  let b;
  if ((b = g(".tabs button"))) { cur = b.dataset.tab; history.replaceState(null, "", "#" + cur); scrollTo(0, 0); render(); return; }
  if ((b = g("[data-src]"))) { src = b.dataset.src; render(); return; }
  if ((b = g("[data-hide]"))) { const i = b.dataset.hide; hidden[i] = !hidden[i]; localStorage.setItem("mc-hidden", JSON.stringify(hidden)); $("#w" + i).classList.toggle("blur", hidden[i]); b.textContent = hidden[i] ? "Show" : "Hide"; return; }
  if ((b = g("[data-agent]"))) return agentSheet(b.dataset.agent);
  if (g("[data-addagent]")) return addAgentSheet();
  if (g("[data-close]") || e.target.id === "sheet") { $("#sheet").classList.remove("on"); return; }
  if ((b = g("[data-up]"))) { const r = b.dataset.up; ST.levels[r] = Math.min(5, (ST.levels[r] || 1) + 1); save(); render(); return; }
  if ((b = g("[data-approve]"))) { const p = PROPOSALS[b.dataset.approve], by = agents().find((a) => a.id === b.dataset.approve); ST.custom.push({ id: "c" + uid(), name: p[0], role: p[1] + " (proposed by " + by.name + ")", room: by.room, hue: (by.hue + 60) % 360, custom: true, activity: "New, planning only" }); save(); $("#sheet").classList.remove("on"); render(); return; }
  if ((b = g("[data-rmagent]"))) { ST.custom = ST.custom.filter((a) => a.id !== b.dataset.rmagent); save(); $("#sheet").classList.remove("on"); render(); return; }
  if ((b = g("[data-del]"))) { const [k, id] = b.dataset.del.split(":"); ST[k] = ST[k].filter((x) => x.id !== id); save(); render(); return; }
  if (g("[data-export]")) { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([JSON.stringify(ST, null, 1)], { type: "application/json" })); a.download = "mission-control-backup-" + todayET() + ".json"; a.click(); return; }
});
document.addEventListener("change", (e) => {
  if (e.target.dataset.done) { const t = ST.tasks.find((x) => x.id === e.target.dataset.done); t.done = e.target.checked; save(); render(); }
  if (e.target.id === "imp" && e.target.files[0]) e.target.files[0].text().then((s) => { try { const o = JSON.parse(s); if (!o || o.v !== 2) throw 0; if (!confirm("Replace this device's data with the backup?")) return; Object.keys(ST).forEach((k) => delete ST[k]); Object.assign(ST, o); save(); render(); alert("Backup restored"); } catch (_) { alert("That file isn't a Mission Control backup."); } });
});
document.addEventListener("submit", (e) => {
  const f = e.target.closest("[data-form]"); if (!f) return; e.preventDefault(); const v = Object.fromEntries(new FormData(f)); const k = f.dataset.form;
  if (k === "task") ST.tasks.unshift({ id: uid(), text: v.text, from: v.from, to: v.to, done: false, ts: Date.now() });
  if (k === "assign") ST.tasks.unshift({ id: uid(), text: v.text, from: "you", to: f.dataset.to, done: false, ts: Date.now() });
  if (k === "income") ST.income.unshift({ id: uid(), kind: v.kind, amt: +v.amt, note: v.note, date: todayET() });
  if (k === "expense") ST.expenses.unshift({ id: uid(), merchant: v.merchant, amount: +v.amount, category: v.category, card: (v.card || "").replace(/\D/g, "").slice(-4), date: todayET() });
  if (k === "agent") ST.custom.push({ id: "c" + uid(), name: v.name, role: v.role, room: v.room, hue: Math.floor(Math.random() * 360), custom: true, activity: "Custom, planning only" });
  save(); $("#sheet").classList.remove("on"); render();
});
clock(); setInterval(clock, 1000);
function boot(d, off) { D = d; D.offline = off; $("#wbadge").textContent = d.waiting.length; autoTasks(); render(); }
fetch("data.json", { cache: "no-cache" }).then((r) => r.json()).then((d) => { localStorage.setItem("mc-data", JSON.stringify(d)); boot(d, false); })
  .catch(() => { const c = localStorage.getItem("mc-data"); if (c) boot(JSON.parse(c), true); else $("#app").innerHTML = '<div class="loading">Offline and no cached data yet. Open once online.</div>'; });
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js");
