"use strict";
/* Mission Control Coach: rule-based, on-device. No AI, no network calls, no Grok usage.
   Engine (Coach) is pure: answer(q, ctx) reads ctx.D (data.json) + ctx.ST (this device) and may change ctx.ST only. */
const Coach = (() => {
  const THEMES = {
    fd: { name: "Flight Director", av: "🎧", hi: "Flight Director on the loop. Ask me about spend, caps, wallets, P&L, usage, bills or bots.", open: ["Copy that.", "Roger.", "Flight, here.", "Loud and clear."], close: ["Over.", "Standing by.", "FD out."] },
    rt: { name: "Retro Terminal", av: "👾", hi: "MC-OS v1.0 READY. TYPE A QUESTION OR 'HELP'.", open: ["> OK.", "> QUERY RESULT:", "> READY."], close: ["_", "> END.", "> AWAITING INPUT_"] },
    cap: { name: "Starship Captain", av: "🚀", hi: "Bridge here, Captain. Ship's logs are loaded. What do you need?", open: ["Aye, Captain.", "On screen.", "Bridge reporting."], close: ["Make it so.", "Steady as she goes.", "Bridge out."] },
  };
  const m2 = (n) => (n < 0 ? "-$" : "$") + Math.abs(+n || 0).toFixed(2);
  const NEVER = "I only change things inside this app. I never send messages or emails, move money, touch wallets or keys, trade, change routines, or call paid services.";
  const DEF = () => ({ theme: "fd", chat: [], log: [], reminders: [], pins: [], snooze: {}, flags: [], bills: [], cash: null, pending: null, ideaMarks: {} });
  const init = (ST) => { ST.tasks = ST.tasks || []; const C = ST.coach || (ST.coach = {}), d = DEF(); for (const k in d) if (!(k in C)) C[k] = d[k]; return C; };
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const dayDiff = (a, b) => Math.round((new Date(b + "T12:00:00") - new Date(a + "T12:00:00")) / 864e5);
  const ymd = (d) => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  const fmtD = (s) => new Date(s + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  /* paydays: 2nd and 4th Thursday of each month */
  function paydays(y, m) { const d = new Date(y, m, 1), off = (4 - d.getDay() + 7) % 7; return [new Date(y, m, 1 + off + 7), new Date(y, m, 1 + off + 21)]; }
  function nextPayday(today) { const t = new Date(today + "T12:00:00"); for (let i = 0; i < 3; i++) { const y = t.getFullYear(), m = t.getMonth() + i; for (const p of paydays(y, m)) if (ymd(p) > today) return ymd(p); } }
  const MON = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
  function parseDue(s, today) {
    s = (s || "").toLowerCase().trim(); let m, mo, da; const ty = +today.slice(0, 4);
    if ((m = s.match(/^(\d{4})-(\d\d)-(\d\d)$/))) return s;
    if ((m = s.match(/([a-z]{3})[a-z]*\.?\s+(\d{1,2})/)) && MON.includes(m[1])) { mo = MON.indexOf(m[1]); da = +m[2]; }
    else if ((m = s.match(/(\d{1,2})\/(\d{1,2})/))) { mo = +m[1] - 1; da = +m[2]; }
    else if ((m = s.match(/(\d{1,2})(st|nd|rd|th)?$/))) { const t = new Date(today + "T12:00:00"); mo = t.getMonth(); da = +m[1]; if (da < t.getDate()) mo++; }
    else if (s === "today") return today; else if (s === "tomorrow") return ymd(new Date(new Date(today + "T12:00:00").getTime() + 864e5));
    else return null;
    let d = new Date(ty, mo, da, 12); if (dayDiff(today, ymd(d)) < -60) d = new Date(ty + 1, mo, da, 12); return ymd(d);
  }
  /* bills: data.json "bills" if the refresh ever adds it, plus bills James adds on this device. Never invented. */
  function bills(ctx) { const C = init(ctx.ST); return (ctx.D.bills || []).map((b) => ({ ...b, src: "dashboard", paid: C.bills.some((x) => x.ref === b.name + "|" + b.due && x.paid) })).concat(C.bills.filter((b) => !b.ref)); }
  const unpaid = (ctx) => bills(ctx).filter((b) => !b.paid);
  function billRadar(ctx, days = 7) { return unpaid(ctx).map((b) => ({ ...b, left: dayDiff(ctx.today, b.due) })).filter((b) => b.left <= days).sort((a, b) => a.left - b.left); }
  const capTotal = (D) => Object.values(D.caps_weekly || {}).reduce((a, b) => a + b, 0);
  const spentTotal = (w) => Object.values(w).reduce((a, b) => a + b, 0);
  const overCaps = (ctx) => Object.entries(ctx.D.caps_weekly || {}).filter(([k, c]) => (ctx.week[k] || 0) > c).map(([k, c]) => [k, ctx.week[k], c]);
  function alerts(ctx) {
    const A = [], D = ctx.D, s = D.stats || {};
    overCaps(ctx).forEach(([k, v, c]) => A.push(["cap:" + k, `${k} over cap: ${m2(v)} of $${c} this week`]));
    if (s.grok_extra > s.grok_cap) A.push(["grok", `Grok extra ${m2(s.grok_extra)} is over the ${m2(s.grok_cap)} monthly cap`]);
    if (ctx.hoursOld > 30) A.push(["stale", `Dashboard data is ${Math.round(ctx.hoursOld)} h old`]);
    billRadar(ctx, 3).forEach((b) => A.push(["bill:" + b.id, `${b.name} ${m2(b.amount)} due ${b.left < 0 ? "OVERDUE" : b.left === 0 ? "today" : "in " + b.left + " d"}`]));
    (D.subscriptions || []).forEach(([n, a, st]) => /unconfirmed|check/i.test(st) && A.push(["sub:" + n, `${n}: ${st}`]));
    return A;
  }
  const liveAlerts = (ctx) => { const sn = init(ctx.ST).snooze; return alerts(ctx).filter(([k]) => !(sn[k] > ctx.now) && !(sn.all > ctx.now)); };
  const dueReminders = (ctx) => init(ctx.ST).reminders.filter((r) => !r.done && r.at <= ctx.now);
  const openTasks = (ST) => ST.tasks.filter((t) => !t.done);

  /* ---- actions: every one is logged with an undo ---- */
  function log(ctx, label, undo) { const C = init(ctx.ST); C.log.unshift({ id: uid(), ts: ctx.now, label, undo, undone: false }); C.log = C.log.slice(0, 100); }
  const A = {
    addTodo(ctx, text, tag) { const t = { id: uid(), text: text.slice(0, 140), from: "coach", to: "you", done: false, ts: ctx.now, coach: true, tag }; ctx.ST.tasks.unshift(t); log(ctx, `Added to-do “${t.text}”`, { t: "rmTask", ids: [t.id] }); return t; },
    complete(ctx, t) { t.done = true; log(ctx, `Completed “${t.text}”`, { t: "undone", id: t.id }); },
    move(ctx, t, dir) { const L = ctx.ST.tasks, prev = L.map((x) => x.id), op = openTasks(ctx.ST), i = op.indexOf(t), j = dir === "top" ? 0 : dir === "up" ? Math.max(0, i - 1) : Math.min(op.length - 1, i + 1), ref = op[j];
      if (ref === t) return false; L.splice(L.indexOf(t), 1); L.splice(L.indexOf(ref) + (dir === "down" ? 1 : 0), 0, t); log(ctx, `Moved “${t.text}” ${dir === "top" ? "to the top" : dir}`, { t: "order", prev }); return true; },
    remind(ctx, text, at) { const r = { id: uid(), text, at, done: false }; init(ctx.ST).reminders.push(r); log(ctx, `Reminder “${text}” for ${new Date(at).toLocaleString("en-US", { weekday: "short", hour: "numeric", minute: "2-digit" })}`, { t: "rmRem", id: r.id }); return r; },
    pin(ctx, k, on) { const P = init(ctx.ST).pins, had = P.includes(k); if (on && !had) P.push(k); if (!on && had) P.splice(P.indexOf(k), 1); log(ctx, `${on ? "Pinned" : "Unpinned"} the ${k} card on HQ`, { t: "pin", k, was: had }); },
    snooze(ctx, key, ms, label) { const S = init(ctx.ST).snooze, was = S[key] ?? null; S[key] = ctx.now + ms; log(ctx, `Snoozed ${label} for ${Math.round(ms / 36e5)} h`, { t: "snooze", key, was }); },
    flag(ctx, list) { const C = init(ctx.ST), was = C.flags.slice(); C.flags = list.map(([k, v, c]) => `${k}: ${m2(v)} of $${c}`); log(ctx, `Flagged ${list.length} over-cap categor${list.length === 1 ? "y" : "ies"}`, { t: "flags", was }); },
    addBill(ctx, name, amount, due) { const b = { id: uid(), name, amount, due, paid: false, src: "this device" }; init(ctx.ST).bills.push(b); log(ctx, `Added bill ${name} ${m2(amount)} due ${fmtD(due)}`, { t: "rmBill", id: b.id }); return b; },
    paid(ctx, b) { const C = init(ctx.ST); if (b.src === "dashboard") { const x = { id: uid(), ref: b.name + "|" + b.due, paid: true }; C.bills.push(x); log(ctx, `Marked ${b.name} paid (you confirmed)`, { t: "rmBill", id: x.id }); } else { const x = C.bills.find((y) => y.id === b.id); x.paid = true; log(ctx, `Marked ${b.name} paid (you confirmed)`, { t: "unpaid", id: x.id }); } },
    cash(ctx, v) { const C = init(ctx.ST), was = C.cash; C.cash = { v, ts: ctx.now }; log(ctx, `Saved cash on hand ${m2(v)}`, { t: "cash", was }); },
  };
  function undo(ST, id) {
    const C = init(ST), e = C.log.find((x) => x.id === id); if (!e || e.undone) return false; const u = e.undo;
    if (u.t === "rmTask") ST.tasks = ST.tasks.filter((t) => !u.ids.includes(t.id));
    if (u.t === "undone") { const t = ST.tasks.find((x) => x.id === u.id); if (t) t.done = false; }
    if (u.t === "order") { const pos = Object.fromEntries(u.prev.map((x, i) => [x, i])); ST.tasks.sort((a, b) => (pos[a.id] ?? -1) - (pos[b.id] ?? -1)); }
    if (u.t === "rmRem") C.reminders = C.reminders.filter((r) => r.id !== u.id);
    if (u.t === "pin") { C.pins = C.pins.filter((k) => k !== u.k); if (u.was) C.pins.push(u.k); }
    if (u.t === "snooze") { if (u.was == null) delete C.snooze[u.key]; else C.snooze[u.key] = u.was; }
    if (u.t === "flags") C.flags = u.was;
    if (u.t === "rmBill") C.bills = C.bills.filter((b) => b.id !== u.id);
    if (u.t === "unpaid") { const b = C.bills.find((x) => x.id === u.id); if (b) b.paid = false; }
    if (u.t === "cash") C.cash = u.was;
    e.undone = true; return true;
  }

  /* ---- answers (real numbers only) ---- */
  function spend(ctx) { const w = ctx.week, D = ctx.D, rows = Object.entries(D.caps_weekly).map(([k, c]) => `${k} ${m2(w[k] || 0)}/$${c}`).join(", ");
    const n = (D.expenses || []).length + (ctx.ST.expenses || []).length;
    return `This week: ${m2(spentTotal(w))} of ${m2(capTotal(D))} in capped categories (${rows}). This month: ${m2((D.spending || {}).month_total || 0)} from Notion.${n ? "" : " No expenses logged yet, so these are $0 until you log receipts."}`; }
  function caps(ctx, doFlag) { const o = overCaps(ctx), s = ctx.D.stats || {}; let t = o.length ? `Over cap: ${o.map(([k, v, c]) => `${k} ${m2(v)} vs $${c}`).join(", ")}.` : `No spending category is over its weekly cap (${m2(spentTotal(ctx.week))} of ${m2(capTotal(ctx.D))} used).`;
    if (s.grok_extra > s.grok_cap) t += ` Grok extra usage is over its cap: ${m2(s.grok_extra)} vs ${m2(s.grok_cap)}.`;
    if (doFlag && o.length) { A.flag(ctx, o); t += " I flagged them in Alerts."; } return t; }
  function wallets(ctx) { const D = ctx.D, W = D.wallets || [], ch = W.reduce((a, w) => a + (w.now - w.prev), 0), big = W.slice().sort((a, b) => Math.abs(b.now - b.prev) - Math.abs(a.now - a.prev))[0];
    return `Wallets total ${m2(D.total)} (${W.map((w) => `${w.name} ${m2(w.now)}`).join(", ")}). Change since last refresh ${ch >= 0 ? "+" : ""}${m2(ch)}${big ? `, biggest mover ${big.name} ${big.now - big.prev >= 0 ? "+" : ""}${m2(big.now - big.prev)}` : ""}. Vs Oct 27 (${m2(D.oct27_total)}): ${m2(D.total - D.oct27_total)}. Read-only, as of ${D.updated}.`; }
  function pnl(ctx) { const P = ctx.D.pnl; if (!P) return "No P&L data in the dashboard yet."; const L = ((ctx.D.live_trades || {}).summary || []);
    return P.rows.map((r) => `${r[0]}: ${r[1]}`).join(". ") + `. As of ${P.as_of}.` + (L.length ? ` Live trades on file: ${L.map((x) => `${x.sym} ${m2(x.realized_usd)} (${x.pct}%)`).join(", ")}.` : ""); }
  function usage(ctx) { const U = ctx.D.usage, d = Math.max(0, Math.ceil((new Date(U.reset) - ctx.now) / 864e5)); return `${U.pct}% of your ${U.plan} weekly limit used, ${(100 - U.pct).toFixed(1)}% left. Resets ${U.reset_label} (${d} day${d === 1 ? "" : "s"}). As of ${U.as_of}.`; }
  function billsAns(ctx) { const B = bills(ctx); if (!B.length) { const sub = (ctx.D.subscriptions || []).filter((s) => /renews/i.test(s[1])).map((s) => `${s[0]} (${s[1]})`); return "No bills data yet. Add one with “add bill Rent $900 due Nov 15”." + (sub.length ? ` Subscription renewals on file: ${sub.join("; ")}.` : ""); }
    const R = billRadar(ctx, 7); return R.length ? `Due in the next 7 days: ${R.map((b) => `${b.name} ${m2(b.amount)} ${b.left < 0 ? "overdue" : b.left === 0 ? "today" : "in " + b.left + " d"}`).join(", ")}. ${unpaid(ctx).length} unpaid in total.` : `Nothing due in the next 7 days. ${unpaid(ctx).length} unpaid bill(s) later.`; }
  function bots(ctx) { const D = ctx.D, B = Object.values(D.bots || {}).map((b) => `${b.name}: ${b.state === "working" ? "working, " + b.task : "idle" + (b.last ? " since " + b.last : "")}`), R = (D.routines || []).map((r) => `${r[0]} (${r[3]})`);
    const top = (D.usage.by || []).slice().sort((a, b) => b[1] - a[1])[0]; return `${B.join(". ")}. Routines: ${R.join(", ")}. Biggest usage share: ${top[0]} ${top[1]}%.`; }
  function afford(ctx, x) { const C = init(ctx.ST), np = nextPayday(ctx.today), due = unpaid(ctx).filter((b) => b.due < np), sumDue = due.reduce((a, b) => a + +b.amount, 0), o = overCaps(ctx);
    const billTxt = bills(ctx).length ? `${m2(sumDue)} in bills due before payday ${fmtD(np)}${due.length ? " (" + due.map((b) => b.name).join(", ") + ")" : ""}` : `no bills data yet, so $0 counted for bills before payday ${fmtD(np)}`;
    if (!C.cash) return `I don't have a cash figure yet. Tell me “my cash is $120” (saved on this device). Your $${ctx.D.total} in crypto wallets isn't counted as cash. Next payday: ${fmtD(np)}.`;
    const left = C.cash.v - sumDue - x; return `${left >= 0 ? "Yes" : "Not safely"}: cash ${m2(C.cash.v)} minus ${billTxt} leaves ${m2(C.cash.v - sumDue)}; after ${m2(x)} you'd have ${m2(left)}.${o.length ? " Heads up, over cap: " + o.map((r) => r[0]).join(", ") + "." : ""} Cash was set ${new Date(C.cash.ts).toLocaleDateString("en-US", { month: "short", day: "numeric" })}.`; }
  function brief(ctx) { const op = openTasks(ctx.ST), R = billRadar(ctx, 0), left = capTotal(ctx.D) - spentTotal(ctx.week);
    return [`To-dos: ${op.length} open${op[0] ? ", first up “" + op[0].text + "”" : ""}.`, bills(ctx).length ? `Bills due today: ${R.length ? R.map((b) => b.name + " " + m2(b.amount)).join(", ") : "none"}.` : "Bills due today: no bills data yet.", `Spend left this week: ${m2(left)} of ${m2(capTotal(ctx.D))} across capped categories.`]; }
  function checklist(ctx) { const items = [], have = new Set(openTasks(ctx.ST).map((t) => t.text));
    billRadar(ctx, 7).forEach((b) => items.push(`Pay ${b.name} ${m2(b.amount)} (due ${fmtD(b.due)})`));
    overCaps(ctx).forEach(([k]) => items.push(`Hold off on ${k} spending: over cap`));
    dueReminders(ctx).forEach((r) => items.push(r.text));
    if (!(ctx.D.expenses || []).length && !(ctx.ST.expenses || []).length) items.push("Log this week's receipts (Notion Inbox or Money tab)");
    (ctx.D.waiting || []).slice(0, 3).forEach(([t]) => items.push(t));
    const add = items.filter((t) => !have.has(t)).slice(0, 7), ids = add.map((t) => { const x = { id: uid(), text: t.slice(0, 140), from: "coach", to: "you", done: false, ts: ctx.now, coach: true, tag: "today:" + ctx.today }; ctx.ST.tasks.unshift(x); return x.id; }).reverse();
    if (ids.length) log(ctx, `Built today's checklist (${ids.length} to-dos)`, { t: "rmTask", ids }); return { add, skipped: items.length - add.length }; }
  function usageSaver(ctx) { const U = ctx.D.usage, r = (U.by || []).slice().sort((a, b) => b[1] - a[1]), rt = (ctx.D.routines || []).filter((x) => x[3] === "Scheduled");
    const lazy = rt.find((x) => /not yet rated|rarely|no output/i.test(JSON.stringify(U.by) + x.join(" "))) || rt[0];
    return { text: `Usage by share: ${r.map((x) => `${x[0]} ${x[1]}%`).join(", ")}.` + (lazy ? ` Candidate to review: “${lazy[0]}” (${lazy[2] || lazy[1]}). Tap “Mark to pause” to add a to-do; I never change routines myself.` : " No scheduled routines to review."), lazy: lazy && lazy[0] }; }
  function ideas(ctx) { const D = ctx.D, s = D.stats || {}, I = [], L = ((D.live_trades || {}).summary || []);
    if (s.grok_extra > s.grok_cap) I.push(["grok", `Grok extra is ${m2(s.grok_extra)}, ${Math.round(s.grok_extra / s.grok_cap * 100)}% of your ${m2(s.grok_cap)} cap. Keep bot work to the weekday refresh and use this coach for questions (it's free).`]);
    if (!(D.expenses || []).length) I.push(["log", "No spending logged yet, so cap tracking shows $0. Drop this week's receipts in the Notion Inbox, or add them in the Money tab."]);
    if (D.total < D.oct27_total) I.push(["wal", `Wallets are down ${m2(D.oct27_total - D.total)} since Oct 27 (${m2(D.oct27_total)} → ${m2(D.total)}). Consider a no-new-live-buys week and practise in paper mode.`]);
    L.filter((x) => x.realized_usd < 0).forEach((x) => I.push(["lt:" + x.sym, `Live ${x.sym} closed ${m2(x.realized_usd)} (${x.pct}%). Tag the mistake in Coin Radar's journal so the pattern shows up.`]));
    L.filter((x) => x.rent_locked_sol > 0).forEach((x) => I.push(["rent:" + x.sym, `${x.rent_locked_sol.toFixed(4)} SOL rent is held in the empty ${x.sym} token account. You can reclaim it by closing that account in Phantom yourself.`]));
    (D.subscriptions || []).forEach(([n, a, st]) => { if (/unconfirmed|check|paused/i.test(st)) I.push(["sub:" + n, `${n}: ${st}. Check whether it still bills you.`]); const m = a.match(/renews ([A-Z][a-z]{2} \d{1,2})/); if (m) I.push(["ren:" + n, `${n} renews ${m[1]} (${a}). Decide before then whether to keep it.`]); });
    if ((D.waiting || []).length) I.push(["wait", `${D.waiting.length} items are waiting on you. Oldest first: “${D.waiting[0][0]}”.`]);
    if (D.usage && D.usage.pct >= 75) I.push(["use", `Usage is at ${D.usage.pct}%. Pause non-essential bot requests until ${D.usage.reset_label}.`]);
    return I; }
  function csv(ctx) { const q = (v) => '"' + String(v ?? "").replace(/"/g, '""') + '"', R = [["section", "item", "value", "detail", "date"]], C = init(ctx.ST), D = ctx.D, iso = (t) => (t ? new Date(t).toISOString() : "");
    ctx.ST.tasks.forEach((t) => R.push(["todo", t.text, t.done ? "done" : "open", t.from + "→" + t.to, iso(t.ts)]));
    bills(ctx).forEach((b) => R.push(["bill", b.name, b.amount, b.paid ? "paid" : "unpaid", b.due]));
    C.reminders.forEach((r) => R.push(["reminder", r.text, r.done ? "done" : "pending", "", iso(r.at)]));
    Object.entries(ctx.week).forEach(([k, v]) => R.push(["week_spend", k, v.toFixed(2), "cap " + D.caps_weekly[k], ctx.today]));
    (D.wallets || []).forEach((w) => R.push(["wallet", w.name, w.now, "prev " + w.prev, D.updated]));
    (D.pnl ? D.pnl.rows : []).forEach((r) => R.push(["pnl", r[0], r[1], r[2], D.pnl.as_of]));
    C.log.forEach((e) => R.push(["coach_log", e.label, e.undone ? "undone" : "done", "", iso(e.ts)]));
    C.chat.forEach((m) => R.push(["chat", m.who, m.text, "", iso(m.ts)]));
    return R.map((r) => r.map(q).join(",")).join("\n"); }
  const HELP = "Try: “how much did I spend this week”, “am I over any cap”, “wallet total”, “what's my P&L”, “usage left”, “what bills are due”, “what should I do today”, “how are my bots doing”, “can I afford $40”, “add todo call GEICO”, “complete todo 1”, “move todo 2 up”, “remind me to log receipts in 2 hours”, “pin wallets”, “snooze alerts”, “add bill Rent $900 due Nov 15”, “mark Rent paid”, “usage saver”, “morning brief”, “export csv”.";

  function remindAt(s, now) { let m; const d = new Date(now);
    if ((m = s.match(/in (\d+)\s*(m|min|mins|minutes?|h|hr|hrs|hours?|d|days?)$/))) return now + +m[1] * (/^m/.test(m[2]) ? 6e4 : /^h/.test(m[2]) ? 36e5 : 864e5);
    if ((m = s.match(/at (\d{1,2})(?::(\d\d))?\s*(am|pm)?$/))) { let h = +m[1]; if (m[3] === "pm" && h < 12) h += 12; if (m[3] === "am" && h === 12) h = 0; d.setHours(h, +(m[2] || 0), 0, 0); if (d.getTime() <= now) d.setDate(d.getDate() + 1); return d.getTime(); }
    if (/tomorrow$/.test(s)) { d.setDate(d.getDate() + 1); d.setHours(9, 0, 0, 0); return d.getTime(); }
    if (/tonight$/.test(s)) { d.setHours(20, 0, 0, 0); return d.getTime() > now ? d.getTime() : now + 36e5; } return null; }
  const findTask = (ST, ref) => { const op = openTasks(ST); if (/^\d+$/.test(ref)) return op[+ref - 1]; ref = ref.toLowerCase(); return op.find((t) => t.text.toLowerCase().includes(ref)); };
  const PINS = { wallet: "wallets", wallets: "wallets", usage: "usage", spending: "spending", spend: "spending", caps: "spending", "p&l": "pnl", pnl: "pnl", bills: "bills", bill: "bills", tasks: "todos", todos: "todos", "to-dos": "todos" };

  /* returns {text, extra?} — extra: {brief:[], csv:true, pause:name} for the UI */
  function reply(q, ctx) {
    const C = init(ctx.ST), s = q.trim().toLowerCase().replace(/[?!.]+$/, ""); let m;
    if (C.pending) { const p = C.pending;
      if (/^(yes|y|yep|yeah|confirm|confirmed|do it|ok)\b/.test(s)) { C.pending = null; const b = bills(ctx).find((x) => (x.id || x.name + "|" + x.due) === p.key && !x.paid); if (!b) return { text: "That bill is already paid or gone." }; A.paid(ctx, b); return { text: `Marked ${b.name} ${m2(b.amount)} as paid. You can undo it in “Coach did this”.` }; }
      if (/^(no|nope|cancel|n)\b/.test(s)) { C.pending = null; return { text: "Cancelled. Nothing changed." }; } C.pending = null; }
    if (!s || /^(help|hi|hello|hey|what can you do|commands)\b/.test(s)) return { text: HELP };
    if ((m = s.match(/^(?:add|new|create)\s+(?:a\s+)?(?:to-?do|task)[:\s]+(.+)/) || s.match(/^to-?do[:\s]+(.+)/))) { const t = A.addTodo(ctx, q.trim().replace(/^(?:(?:add|new|create)\s+(?:a\s+)?(?:to-?do|task)|to-?do)[:\s]+/i, "")); return { text: `Added to-do “${t.text}”.` }; }
    if ((m = s.match(/^remind me (?:to )?(.+)/))) { const at = remindAt(m[1], ctx.now); if (!at) return { text: "When? Say “remind me to X in 30 minutes”, “… at 5pm”, “… tonight” or “… tomorrow”." };
      const text = m[1].replace(/\s+(in \d+\s*\w+|at \d{1,2}(:\d\d)?\s*(am|pm)?|tomorrow|tonight)$/, ""); A.remind(ctx, text, at); return { text: `I'll show “${text}” in the app at ${new Date(at).toLocaleString("en-US", { weekday: "short", hour: "numeric", minute: "2-digit" })}. It's an in-app reminder only (no notifications are sent).` }; }
    if ((m = s.match(/^(?:complete|finish|done|check off|tick)\s+(?:to-?do|task)?\s*#?(.+)/))) { const t = findTask(ctx.ST, m[1].trim()); if (!t) return { text: `I couldn't find an open to-do matching “${m[1]}”.` }; A.complete(ctx, t); return { text: `Checked off “${t.text}”.` }; }
    if ((m = s.match(/^move\s+(?:to-?do|task)?\s*#?(\d+)\s+(up|down|to (?:the )?top|top)/))) { const t = findTask(ctx.ST, m[1]); if (!t) return { text: `No open to-do #${m[1]}.` }; if (!A.move(ctx, t, /top/.test(m[2]) ? "top" : m[2])) return { text: `“${t.text}” is already there.` }; return { text: `Moved “${t.text}” ${/top/.test(m[2]) ? "to the top" : m[2]}.` }; }
    if ((m = s.match(/^add bill\s+(.+?)\s+\$?(\d+(?:\.\d\d?)?)(?:\s+due\s+(.+))?$/))) { const due = parseDue(m[3] || "", ctx.today); if (!due) return { text: "Add a due date, like “add bill Rent $900 due Nov 15”." }; const b = A.addBill(ctx, q.trim().replace(/^add bill\s+/i, "").replace(/\s+\$?\d+(\.\d\d?)?(\s+due.*)?$/i, ""), +m[2], due); return { text: `Added ${b.name} ${m2(b.amount)} due ${fmtD(due)} (saved on this device).` }; }
    if ((m = s.match(/^mark\s+(?:the\s+)?(.+?)\s+(?:bill\s+)?(?:as\s+)?paid$/))) { const b = unpaid(ctx).find((x) => x.name.toLowerCase().includes(m[1])); if (!bills(ctx).length) return { text: "No bills data yet, so there's nothing to mark paid." }; if (!b) return { text: `No unpaid bill matching “${m[1]}”.` };
      C.pending = { kind: "paid", key: b.id || b.name + "|" + b.due }; return { text: `Confirm: mark ${b.name} ${m2(b.amount)} (due ${fmtD(b.due)}) as paid? Reply “yes” or “no”. This only updates the app; it doesn't pay anything.` }; }
    if ((m = s.match(/^(un)?pin\s+(?:the\s+)?([a-z&-]+)/))) { const k = PINS[m[2]]; if (!k) return { text: "I can pin: wallets, usage, spending, pnl, bills, todos." }; A.pin(ctx, k, !m[1]); return { text: `${m[1] ? "Unpinned" : "Pinned"} ${k} ${m[1] ? "from" : "to the top of"} HQ.` }; }
    if ((m = s.match(/^snooze(?:\s+all)?(?:\s+(?:the\s+)?alerts?)?(?:\s+for\s+(\d+)\s*(h|hours?|d|days?))?$/))) { const ms = m[1] ? +m[1] * (/^d/.test(m[2]) ? 864e5 : 36e5) : 864e5; const n = liveAlerts(ctx).length; if (!n) return { text: "No active alerts to snooze." }; A.snooze(ctx, "all", ms, `all ${n} alert(s)`); return { text: `Snoozed ${n} alert(s) for ${Math.round(ms / 36e5)} h.` }; }
    if ((m = s.match(/^(?:my\s+)?cash(?:\s+on\s+hand)?\s+(?:is|=)\s*\$?(\d+(?:\.\d\d?)?)/))) { A.cash(ctx, +m[1]); return { text: `Saved cash on hand ${m2(+m[1])} on this device. Ask “can I afford $X” anytime.` }; }
    if (/\b(send|email|text|tweet|post|dm|buy|sell|trade|swap|transfer|withdraw|deposit|move money|pay|cancel|unsubscribe|private key|seed|run routine|change routine|delete routine)\b/.test(s) && !/\bpaid\b/.test(s)) return { text: NEVER + " I can add it as a to-do for you instead: say “add todo …”." };
    if ((m = s.match(/afford\s+(?:a\s+|an\s+)?\$?(\d+(?:\.\d\d?)?)/))) return { text: afford(ctx, +m[1]) };
    if (/afford/.test(s)) return { text: "How much? Ask like “can I afford $40”." };
    if (/usage saver|save usage|use less|what should i pause|pause/.test(s)) { const u = usageSaver(ctx); return { text: u.text, extra: u.lazy ? { pause: u.lazy } : null }; }
    if (/over (any |a |my )?caps?|over budget|flag/.test(s)) return { text: caps(ctx, true) };
    if (/\b(today|plan my day|checklist|what should i do)\b/.test(s)) { const r = checklist(ctx); return { text: r.add.length ? `Today's checklist, added to your to-dos: ${r.add.map((t, i) => `${i + 1}) ${t}`).join(" ")}` : `Your to-dos already cover today (${openTasks(ctx.ST).length} open).` }; }
    if (/brief|morning|summary/.test(s)) { const b = brief(ctx); return { text: b.join(" "), extra: { brief: b } }; }
    if (/csv|export/.test(s)) return { text: "Exporting your to-dos, bills, reminders, spend, wallets, P&L, coach log and chat as a CSV file.", extra: { csv: true } };
    if (/\bcaps?\b|budget|limit for/.test(s) && !/usage/.test(s)) return { text: caps(ctx, false) };
    if (/spen[dt]|spending|expenses?/.test(s)) return { text: spend(ctx) };
    if (/p\s*[&\/]?\s*l\b|pnl|profit|loss|lost|made/.test(s)) return { text: pnl(ctx) };
    if (/wallet|balance|net worth|portfolio|total|change/.test(s)) return { text: wallets(ctx) };
    if (/usage|reset|limit|credits?|plan/.test(s)) return { text: usage(ctx) };
    if (/bills?|due|payday|rent/.test(s)) return { text: billsAns(ctx) + ` Next payday (2nd/4th Thursday): ${fmtD(nextPayday(ctx.today))}.` };
    if (/bots?|routines?|agents?|team/.test(s)) return { text: bots(ctx) };
    if (/ideas?|suggest|advice|tips?/.test(s)) { const I = ideas(ctx); return { text: I.length ? I.slice(0, 3).map((x, i) => `${i + 1}) ${x[1]}`).join(" ") : "No new ideas from today's data." }; }
    if (/remind/.test(s)) return { text: "Say “remind me to X in 30 minutes” (or at 5pm, tonight, tomorrow)." };
    return { text: "I didn't catch that. I'm rule-based, so I only know set questions. " + HELP };
  }
  function voice(theme, text, n) { const T = THEMES[theme] || THEMES.fd; return `${T.open[n % T.open.length]} ${text} ${T.close[n % T.close.length]}`; }
  function ask(q, ctx) { const C = init(ctx.ST), r = reply(q, ctx), n = C.chat.length; C.chat.push({ who: "you", text: q.slice(0, 500), ts: ctx.now }); C.chat.push({ who: "coach", text: voice(C.theme, r.text, n >> 1), ts: ctx.now }); C.chat = C.chat.slice(-200); return r; }
  return { THEMES, init, ask, reply, undo, alerts, liveAlerts, dueReminders, billRadar, bills, brief, csv, ideas, usageSaver, nextPayday, parseDue, A, NEVER, m2, fmtD };
})();
if (typeof module !== "undefined") module.exports = Coach;
