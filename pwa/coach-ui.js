"use strict";
/* Coach tab UI. Uses app.js globals (D, ST, save, render, card, esc, todayET, weekSpend, hoursOld) at call time. */
let BOT_IDEAS = null;
fetch("bot_ideas.json", { cache: "no-cache" }).then((r) => (r.ok ? r.json() : [])).then((j) => { BOT_IDEAS = Array.isArray(j) ? j : []; try { localStorage.setItem("mc-botideas", JSON.stringify(BOT_IDEAS)); } catch (_) {} if (typeof cur !== "undefined" && cur === "coach" && D) render(); })
  .catch(() => { BOT_IDEAS = JSON.parse(localStorage.getItem("mc-botideas") || "[]"); });
const cctx = () => ({ D, ST, now: Date.now(), today: todayET(), week: weekSpend(), hoursOld: hoursOld() });
const tET = (t) => new Date(t).toLocaleString("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) + " ET";
const BUILT = [[/afford/i, "Built: ask “can I afford $40”"], [/bill radar/i, "Built: Bill radar card"], [/usage saver/i, "Built: ask “usage saver”"], [/morning brief/i, "Built: Morning brief button"], [/csv|self-run/i, "Built: Export CSV + logged coach actions"]];
const MARKS = ["Try", "Skip", "Worked", "Didn't work"];
function marks(key) { const C = Coach.init(ST), v = C.ideaMarks[key]; return `<div class="cmarks">${MARKS.map((m) => `<button class="chip ${v === m ? "on" : ""}" data-c="mark" data-k="${esc(key)}" data-v="${m}">${m}</button>`).join("")}</div>`; }
function coachBanner() {
  if (!D) return ""; const c = cctx(), R = Coach.dueReminders(c); Coach.init(ST);
  return R.map((r) => `<div class="cban mono"><span>⏰ ${esc(r.text)}</span><button class="btn" data-c="remdone" data-id="${r.id}">Done</button><button class="btn" data-c="remsnz" data-id="${r.id}">+1 h</button></div>`).join("");
}
function coachPins() {
  const C = Coach.init(ST); if (!C.pins.length) return ""; const c = cctx(), w = c.week;
  const P = { wallets: ["Wallets", `${money(D.total)} total · ${Coach.m2(D.total - D.oct27_total)} vs Oct 27`], usage: ["Usage", `${D.usage.pct}% used · resets ${D.usage.reset_label}`],
    spending: ["Spending vs caps", Object.entries(D.caps_weekly).map(([k, cap]) => `${k} ${money(w[k] || 0)}/$${cap}`).join(" · ")], pnl: ["P&L", D.pnl ? D.pnl.rows.slice(0, 2).map((r) => r[0] + " " + r[1]).join(" · ") : "No P&L data"],
    bills: ["Bills (7 days)", Coach.bills(c).length ? Coach.billRadar(c).map((b) => `${b.name} ${money(b.amount)} in ${b.left} d`).join(" · ") || "Nothing due" : "No bills data yet"], todos: ["To-dos", `${ST.tasks.filter((t) => !t.done).length} open` + (ST.tasks.find((t) => !t.done) ? ` · next: ${ST.tasks.find((t) => !t.done).text}` : "")] };
  return card("📌 Pinned by Coach", C.pins.map((k) => `<div class="row"><div class="t"><b>${esc(P[k][0])}</b><div class="s">${esc(P[k][1])}</div></div><button class="btn x" data-c="unpin" data-k="${k}" aria-label="Unpin">✕</button></div>`).join(""));
}
function viewCoach() {
  const C = Coach.init(ST), T = Coach.THEMES[C.theme] || Coach.THEMES.fd, c = cctx(), AL = Coach.liveAlerts(c), allA = Coach.alerts(c), B = Coach.bills(c), R = Coach.billRadar(c), I = Coach.ideas(c), open = ST.tasks.filter((t) => !t.done);
  const chips = ["how much did I spend this week", "am I over any cap", "wallet total", "what's my P&L", "usage left", "what bills are due", "what should I do today", "how are my bots doing", "can I afford $20", "usage saver"];
  const bubbles = C.chat.slice(-40).map((m) => m.who === "you" ? `<div class="bub me">${esc(m.text)}</div>` : `<div class="bub co"><span class="cav">${T.av}</span><div>${esc(m.text)}</div></div>`).join("") || `<div class="bub co"><span class="cav">${T.av}</span><div>${esc(T.hi)}</div></div>`;
  const pauseBtn = C.lastPause ? `<button class="btn" data-c="pause" data-n="${esc(C.lastPause)}">Mark to pause: ${esc(C.lastPause)}</button>` : "";
  return `<div class="coachwrap th-${C.theme}">` + card(`${T.av} ${T.name}`, `<div class="seg" role="tablist">${Object.entries(Coach.THEMES).map(([k, t]) => `<button data-c="theme" data-k="${k}" class="${k === C.theme ? "on" : ""}">${t.av} ${esc(t.name)}</button>`).join("")}</div>
    <p class="note"><span class="pill mut">RULE-BASED · NOT AI</span> Answers come from your dashboard data with set rules. No AI, no internet calls, no bot usage. Chat history stays on this device.</p>
    <div class="chat" id="chat">${bubbles}</div>
    <form class="frm" id="cform"><input id="cq" placeholder="Ask the ${esc(T.name)}…" maxlength="300" autocomplete="off" enterkeyhint="send"><button class="btn pri">Send</button></form>
    <div class="chips">${chips.map((q) => `<button class="chip" data-c="q" data-q="${esc(q)}">${esc(q)}</button>`).join("")}</div>
    <div class="cacts"><button class="btn pri" data-c="brief">☀ Morning brief</button><button class="btn" data-c="today">✓ Build today's checklist</button><button class="btn" data-c="csv">⬇ Export CSV</button>${pauseBtn}<button class="btn" data-c="clear">Clear chat</button></div>`) +
  `<div class="grid">` +
  card("Alerts", (AL.map(([k, t]) => `<div class="row"><span class="dot warn" style="margin-top:6px"></span><div class="t">${esc(t)}</div><button class="btn" data-c="snz" data-k="${esc(k)}" data-t="${esc(t)}">Snooze 24 h</button></div>`).join("") || `<p class="note">No active alerts${allA.length ? ` (${allA.length} snoozed)` : ""}.</p>`) + (C.flags.length ? `<p class="note">Flagged over cap: ${esc(C.flags.join("; "))}</p>` : "")) +
  card("Bill radar · next 7 days", (B.length ? (R.map((b) => `<div class="row"><div class="t">${esc(b.name)}<div class="s">${b.left < 0 ? "Overdue" : b.left === 0 ? "Due today" : "In " + b.left + " d"} · ${esc(Coach.fmtD(b.due))} · ${esc(b.src)}</div></div><b class="mono">${money(b.amount)}</b><button class="btn" data-c="askpaid" data-n="${esc(b.name)}">Mark paid…</button></div>`).join("") || '<p class="note">Nothing due in the next 7 days.</p>') : '<p class="note">No bills data yet. Add one in chat: “add bill Rent $900 due Nov 15”.</p>') + `<p class="note">Next payday (2nd/4th Thursday): ${esc(Coach.fmtD(Coach.nextPayday(c.today)))}. Mark paid asks you to confirm in chat and only updates this app.</p>`) +
  card("Dashboard to-dos", (open.map((t, i) => `<div class="row"><input type="checkbox" data-done="${t.id}" aria-label="Done"><div class="t">${i + 1}. ${esc(t.text)}<div class="s">${t.coach ? "added by Coach" : esc(nameOf(t.from)) + " → " + esc(nameOf(t.to))}</div></div><button class="btn x" data-c="up" data-n="${i + 1}" aria-label="Move up" ${i ? "" : "disabled"}>↑</button><button class="btn x" data-c="down" data-n="${i + 1}" aria-label="Move down" ${i < open.length - 1 ? "" : "disabled"}>↓</button></div>`).join("") || '<p class="note">No open to-dos.</p>') + `<p class="note">Same list as HQ → Tasks.</p>`) +
  card("Reminders", (C.reminders.filter((r) => !r.done).sort((a, b) => a.at - b.at).map((r) => `<div class="row"><div class="t">${esc(r.text)}<div class="s">${esc(tET(r.at))}${r.at <= c.now ? " · due now" : ""}</div></div><button class="btn x" data-c="remdone" data-id="${r.id}" aria-label="Done">✓</button></div>`).join("") || '<p class="note">None. Say “remind me to … in 2 hours”.</p>') + `<p class="note">Shown inside the app only; no notifications are sent.</p>`) +
  card("Coach did this", (C.log.slice(0, 30).map((e) => `<div class="row"><div class="t ${e.undone ? "done" : ""}">${esc(e.label)}<div class="s">${esc(tET(e.ts))}</div></div>${e.undone ? '<span class="pill mut">Undone</span>' : `<button class="btn" data-c="undo" data-id="${e.id}">Undo</button>`}</div>`).join("") || '<p class="note">Nothing yet. Every change the coach makes shows here with Undo.</p>')) +
  card("Coach ideas · from your data", (I.map(([k, t]) => `<div class="idea"><div>${esc(t)}</div><div class="s"><span class="pill mut">Coach · suggestion</span></div>${marks("c:" + k)}</div>`).join("") || '<p class="note">No ideas from today\'s data.</p>')) +
  card("Bot team ideas", BOT_IDEAS === null ? '<p class="note">Loading…</p>' : (BOT_IDEAS.map((x, i) => { const b = (BUILT.find(([r]) => r.test(x.idea)) || [])[1]; return `<div class="idea"><div>${esc(x.idea)}</div><div class="s"><span class="pill mut">${esc(x.bot || "Bot")} · suggestion</span>${b ? ` <span class="pill ok">${esc(b)}</span>` : ""}</div>${marks("b:" + i)}</div>`; }).join("") || '<p class="note">No bot team ideas yet.</p>')) +
  card("What the coach never does", `<p>${esc(Coach.NEVER)}</p><p class="note">All coach changes stay on this device: to-dos, reminders, pins, snoozes, flags, bills you add, and paid marks. Export a backup from HQ to keep them.</p>`) + `</div></div>`;
}
function coachRun(q) { const r = Coach.ask(q, cctx()); const C = ST.coach; if (r.extra && r.extra.pause) C.lastPause = r.extra.pause; if (r.extra && r.extra.csv) coachCSV(); save(); render(); const ch = $("#chat"); if (ch) ch.scrollTop = ch.scrollHeight; return r; }
function coachCSV() { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([Coach.csv(cctx())], { type: "text/csv" })); a.download = "mission-control-" + todayET() + ".csv"; document.body.appendChild(a); a.click(); a.remove(); window.__lastCSV = Coach.csv(cctx()); }
document.addEventListener("submit", (e) => { if (e.target.id !== "cform") return; e.preventDefault(); const v = $("#cq").value.trim(); if (v) coachRun(v); setTimeout(() => { const i = $("#cq"); if (i) i.focus(); }, 0); });
document.addEventListener("click", (e) => {
  const b = e.target.closest("[data-c]"); if (!b) return; const k = b.dataset.c, C = Coach.init(ST), c = cctx();
  if (k === "q") return void coachRun(b.dataset.q);
  if (k === "brief") return void coachRun("morning brief");
  if (k === "today") return void coachRun("what should I do today");
  if (k === "csv") return void coachRun("export csv");
  if (k === "pause") { Coach.A.addTodo(c, `Decide whether to pause “${b.dataset.n}” (tell Chief Bot; coach never changes routines)`); C.lastPause = null; }
  if (k === "clear") { if (!confirm("Clear the chat history on this device?")) return; C.chat = []; }
  if (k === "theme") C.theme = b.dataset.k;
  if (k === "mark") C.ideaMarks[b.dataset.k] = C.ideaMarks[b.dataset.k] === b.dataset.v ? undefined : b.dataset.v;
  if (k === "undo") Coach.undo(ST, b.dataset.id);
  if (k === "snz") Coach.A.snooze(c, b.dataset.k, 864e5, "“" + b.dataset.t + "”");
  if (k === "unpin") Coach.A.pin(c, b.dataset.k, false);
  if (k === "up" || k === "down") return void coachRun(`move todo ${b.dataset.n} ${k}`);
  if (k === "askpaid") return void coachRun(`mark ${b.dataset.n} paid`);
  if (k === "remdone") { const r = C.reminders.find((x) => x.id === b.dataset.id); if (r) r.done = true; }
  if (k === "remsnz") { const r = C.reminders.find((x) => x.id === b.dataset.id); if (r) r.at = Date.now() + 36e5; }
  save(); render();
});
setInterval(() => { if (D && Coach.dueReminders(cctx()).length && !document.querySelector(".cban") && !document.querySelector("#cq:focus")) render(); }, 30000);
