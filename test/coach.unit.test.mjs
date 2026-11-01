// Unit tests for the rule-based coach engine (no browser). node test/coach.unit.test.mjs
import { createRequire } from "module"; import fs from "fs";
const require = createRequire(import.meta.url), Coach = require("../pwa/coach.js");
const D = JSON.parse(fs.readFileSync(new URL("../pwa/data.json", import.meta.url)));
let fails = 0; const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fails++; };
const now = new Date("2026-11-01T18:00:00").getTime();
const mk = (ST = { tasks: [], expenses: [] }, week = { Tobacco: 0, Crypto: 0, Restaurants: 0, Alcohol: 0 }, d = D) => ({ D: d, ST, now, today: "2026-11-01", week, hoursOld: 4 });
let c = mk(), r;
r = Coach.reply("how much did I spend this week", c); ok(/\$0\.00 of \$50\.00/.test(r.text) && /No expenses logged yet/.test(r.text), "spend: real $0 of $50 caps, notes nothing logged");
r = Coach.reply("am I over any cap", c); ok(/No spending category is over/.test(r.text) && /Grok extra usage is over its cap: \$26\.69 vs \$20\.00/.test(r.text), "caps: none over, Grok extra over");
r = Coach.reply("wallet total", c); ok(r.text.includes("$" + D.total.toFixed(2)) && /Oct 27/.test(r.text), "wallet total from data");
r = Coach.reply("what's my P&L", c); ok(/REGRETAMINE/.test(r.text) && /-\$1\.36/.test(r.text), "P&L includes live REGRETAMINE -$1.36");
r = Coach.reply("usage left / reset", c); ok(r.text.includes(D.usage.pct + "%") && r.text.includes(D.usage.reset_label), "usage % and reset label");
r = Coach.reply("what bills are due", c); ok(/No bills data yet/.test(r.text) && /Thu, Nov 12/.test(r.text), "bills: no bills data yet + next payday Nov 12 (2nd Thu)");
r = Coach.reply("how are my bots doing", c); ok(/Chief Bot/.test(r.text) && /Grok Bot/.test(r.text) && /Routines/.test(r.text), "bots + routines");
ok(Coach.nextPayday("2026-11-01") === "2026-11-12" && Coach.nextPayday("2026-11-12") === "2026-11-26" && Coach.nextPayday("2026-11-27") === "2026-12-10", "paydays = 2nd/4th Thursday");
r = Coach.reply("can I afford $40", c); ok(/don't have a cash figure/.test(r.text), "afford without cash asks for it, no invented cash");
Coach.reply("my cash is $120", c); r = Coach.reply("can I afford $40", c); ok(/^Yes/.test(r.text) && /no bills data yet/.test(r.text) && /\$80\.00/.test(r.text), "afford: 120 - 0 bills - 40 = 80");
// to-dos, reorder, complete, undo
Coach.reply("add todo Call GEICO", c); Coach.reply("add todo: Log receipts", c); Coach.reply("todo Check Kikoff", c);
ok(c.ST.tasks.map((t) => t.text).join("|") === "Check Kikoff|Log receipts|Call GEICO", "add 3 to-dos (original case kept)");
Coach.reply("move todo 3 up", c); ok(c.ST.tasks.map((t) => t.text).join("|") === "Check Kikoff|Call GEICO|Log receipts", "move todo up");
Coach.reply("move todo 3 to top", c); ok(c.ST.tasks[0].text === "Log receipts", "move to top");
Coach.reply("complete todo geico", c); ok(c.ST.tasks.find((t) => t.text === "Call GEICO").done, "complete by text");
const L = c.ST.coach.log; Coach.undo(c.ST, L[0].id); ok(!c.ST.tasks.find((t) => t.text === "Call GEICO").done, "undo complete");
Coach.undo(c.ST, L[1].id); ok(c.ST.tasks.map((t) => t.text).join("|") === "Check Kikoff|Call GEICO|Log receipts", "undo reorder");
// reminders, pins, snooze
r = Coach.reply("remind me to log receipts in 2 hours", c); ok(c.ST.coach.reminders.length === 1 && c.ST.coach.reminders[0].at === now + 72e5 && c.ST.coach.reminders[0].text === "log receipts", "reminder in 2 hours");
ok(Coach.dueReminders({ ...c, now: now + 8e6 }).length === 1 && Coach.dueReminders(c).length === 0, "reminder becomes due");
Coach.reply("pin wallets", c); ok(c.ST.coach.pins.includes("wallets"), "pin wallets");
const nA = Coach.liveAlerts(c).length; Coach.reply("snooze alerts", c); ok(nA > 0 && Coach.liveAlerts(c).length === 0 && Coach.liveAlerts({ ...c, now: now + 9e7 }).length === nA, "snooze all 24h then return");
// flags with over-cap week
const c2 = mk({ tasks: [], expenses: [] }, { Tobacco: 30, Crypto: 0, Restaurants: 5, Alcohol: 0 }); r = Coach.reply("am I over any cap", c2);
ok(/Tobacco \$30\.00 vs \$25/.test(r.text) && c2.ST.coach.flags.length === 1 && c2.ST.coach.log[0].label.startsWith("Flagged"), "flags over-cap category and logs it");
// bills with confirm
Coach.reply("add bill Rent $900 due Nov 5", c); ok(c.ST.coach.bills[0].due === "2026-11-05" && c.ST.coach.bills[0].name === "Rent", "add bill parses date + name");
r = Coach.reply("what bills are due", c); ok(/Rent \$900\.00 in 4 d/.test(r.text), "bill radar shows Rent in 4 d");
r = Coach.reply("can I afford $40", c); ok(/^Not safely/.test(r.text) && /\$900\.00 in bills due before payday/.test(r.text), "afford counts bills before payday");
r = Coach.reply("mark rent paid", c); ok(/Confirm/.test(r.text) && !c.ST.coach.bills[0].paid, "mark paid asks to confirm first");
r = Coach.reply("no", c); ok(!c.ST.coach.bills[0].paid && /Cancelled/.test(r.text), "'no' cancels");
Coach.reply("mark rent paid", c); Coach.reply("yes", c); ok(c.ST.coach.bills[0].paid, "'yes' marks paid");
Coach.undo(c.ST, c.ST.coach.log[0].id); ok(!c.ST.coach.bills[0].paid, "undo paid");
// checklist, brief, csv, refusals
const c3 = mk(); r = Coach.reply("what should I do today", c3); ok(c3.ST.tasks.length >= 2 && /Log this week's receipts/.test(r.text) && c3.ST.coach.log[0].label.includes("checklist"), "today checklist adds to-dos + logs");
r = Coach.reply("what should I do today", c3); ok(/already cover/.test(r.text), "no duplicate checklist items");
Coach.undo(c3.ST, c3.ST.coach.log[0].id); ok(c3.ST.tasks.length === 0, "undo checklist removes them");
const b = Coach.brief(mk()); ok(b.length === 3 && /no bills data yet/.test(b[1]) && /\$50\.00 of \$50\.00/.test(b[2]), "morning brief: 3 template lines");
const csv = Coach.csv(c); ok(/^"section","item"/.test(csv) && /"todo","Call GEICO"/.test(csv) && /"wallet","Main"/.test(csv) && /"bill","Rent"/.test(csv), "CSV export");
for (const q of ["send an email to my landlord", "buy BONK", "transfer $20 to savings", "sell everything", "pause the morning routine and change routine"]) { const n = JSON.stringify(c.ST).length; r = Coach.reply(q, c); ok(/never send messages/.test(r.text) && JSON.stringify(c.ST).length === n, "refuses + no change: " + q); }
r = Coach.reply("usage saver", c); ok(/Usage by share/.test(r.text) && /never change routines/.test(r.text) && r.extra && r.extra.pause, "usage saver offers mark-to-pause only");
ok(Coach.ideas(mk()).some((x) => /Grok extra/.test(x[1])) && Coach.ideas(mk()).some((x) => /CooMeet renews Nov 26/.test(x[1])), "coach ideas from data");
const before = c.ST.coach.chat.length; Coach.ask("wallet total", c); ok(c.ST.coach.chat.length === before + 2 && /Over\.|Standing by\.|FD out\./.test(c.ST.coach.chat.at(-1).text), "ask stores chat + Flight Director voice");
c.ST.coach.theme = "rt"; Coach.ask("usage", c); ok(/^> /.test(c.ST.coach.chat.at(-1).text), "Retro Terminal theme voice");
r = Coach.reply("zzz qqq", c); ok(/rule-based/.test(r.text), "fallback says rule-based");
const src = fs.readFileSync(new URL("../pwa/coach.js", import.meta.url), "utf8") + fs.readFileSync(new URL("../pwa/coach-ui.js", import.meta.url), "utf8");
ok(!/https?:\/\/(?!dexscreener)/.test(src.replace(/fetch\("bot_ideas\.json"/, "")) && (src.match(/fetch\(/g) || []).length === 1, "coach makes no external calls (only same-origin bot_ideas.json)");
console.log(fails ? fails + " FAILED" : "ALL PASS"); process.exitCode = fails ? 1 : 0;
