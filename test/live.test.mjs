// Phone-size test of the live server parts (Today, wallets-live, sleep log, pairing). U=https://jellis-mission-control.jamesellis703.workers.dev node test/live.test.mjs
import { createRequire } from "module";
const require = createRequire(process.env.PUPPETEER_FROM || "/workspace/viral-coin-radar/package.json"), puppeteer = require("puppeteer-core");
const U = process.env.U || "http://localhost:8799", PAIR = process.env.PAIR === "1";
let fails = 0; const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fails++; }; const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const br = await puppeteer.launch({ executablePath: "/usr/bin/google-chrome", headless: "new", args: ["--no-sandbox"] });
const p = await br.newPage(); await p.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
const errs = []; p.on("pageerror", (e) => errs.push(String(e)));
await p.goto(U + "/?t=" + Date.now(), { waitUntil: "networkidle2" }); await p.evaluate(() => localStorage.clear()); await p.goto(U + "/?t=" + Date.now() + "#hq", { waitUntil: "networkidle2" }); await sleep(1500);
const txt = () => p.$eval("#app", (e) => e.innerText);
let t = await txt();
ok(/Today/i.test(t) && /Wallets \$\d/.test(t) && /Usage [\d.]+% as of/.test(t), "Today card shows templated digest");
ok(/Wallets updated .* ET/.test(t), "Wallets updated <time ET> shown");
ok(/Cron last ran .* ET/.test(t), "cron last-run time shown: " + (t.match(/Cron last ran [^\n]*/) || [""])[0]);
ok(/Sleep log/i.test(t) && /No data yet/.test(t), "sleep log empty state says no data yet");
await p.$eval("[data-l=bed]", (e) => e.click()); await sleep(200); ok(/In bed since/.test(await txt()), "Bed records a timestamp");
await p.evaluate(() => { const s = JSON.parse(localStorage.getItem("mc-sleep")); s.open -= 7.5 * 36e5; localStorage.setItem("mc-sleep", JSON.stringify(s)); });
await p.$eval("[data-l=awake]", (e) => e.click()); await sleep(200); t = await txt();
ok(/7\.5 h/.test(t) && /Avg bedtime/.test(t), "Awake closes the night and charts averages");
await p.$eval("[data-l=sleepundo]", (e) => e.click()); await sleep(200); ok(/No data yet/.test(await txt()), "Undo removes the test night");
ok(/Private server sync/i.test(await txt()) && /Pair this device/.test(await txt()), "sync card offers optional pairing");
await p.click(".tabs [data-tab=wallets]"); await sleep(300); t = await txt(); ok(/Wallets updated .* by the free server cron/.test(t), "Wallets tab reads live KV data");
ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), "no horizontal overflow at 390px");
if (PAIR) { await p.click(".tabs [data-tab=hq]"); await sleep(200); await p.$eval("[data-l=pair]", (e) => e.click()); await sleep(2500); t = await txt(); ok(/Paired/.test(t), "pairing works: " + (t.match(/Paired[^\n]*/) || [""])[0]); }
ok(!errs.length, "no page errors " + errs.join(" | "));
await p.screenshot({ path: "/tmp/mc-live.png" }); await br.close(); console.log(fails ? fails + " FAIL" : "ALL PASS"); process.exit(fails ? 1 : 0);
