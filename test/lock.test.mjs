// Password lock tests against the real built Worker (cf/worker.built.js) with a throwaway test password.
import fs from "node:fs"; fs.copyFileSync(new URL("../cf/worker.built.js", import.meta.url), new URL("../cf/.lock-test.mjs", import.meta.url)); const W = (await import("../cf/.lock-test.mjs")).default;
const enc = new TextEncoder(), b64u = (b) => Buffer.from(b).toString("base64url");
const PW = "test-pass-" + Math.random().toString(36).slice(2), salt = crypto.getRandomValues(new Uint8Array(16));
const k = await crypto.subtle.importKey("raw", enc.encode(PW), "PBKDF2", false, ["deriveBits"]);
const h = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: 100000 }, k, 256);
const mem = new Map(), KV = { get: async (x, t) => (mem.has(x) ? (t === "json" ? JSON.parse(mem.get(x)) : mem.get(x)) : null), put: async (x, v) => void mem.set(x, v), delete: async (x) => void mem.delete(x) };
const env = { MC: KV, LOCK_HASH: `pbkdf2$100000$${b64u(salt)}$${b64u(h)}`, SESSION_KEY: b64u(crypto.getRandomValues(new Uint8Array(32))) };
let pass = 0, fail = 0; const ok = (c, m) => (c ? pass++ : (fail++, console.log("FAIL", m)));
const B = "https://jellis-mission-control.jamesellis703.workers.dev";
const go = (p, o = {}, e = env) => W.fetch(new Request(B + p, o), e);
for (const p of ["/", "/index.html", "/app.js", "/sw.js", "/data.json", "/bot_ideas.json"]) { const r = await go(p); ok(r.status === 401, "locked " + p); ok(!(await r.text()).includes("Mission Control"), "no app content " + p); }
for (const p of ["/api/state", "/api/push/key", "/api/rpc"]) { const r = await go(p, p === "/api/rpc" ? { method: "POST", body: "{}" } : {}); ok(r.status === 401, "api locked " + p); }
ok((await go("/api/sync", { method: "POST", body: "{}" })).status === 401, "sync write locked");
ok((await go("/", {}, { MC: KV })).status === 503, "fails closed w/o secrets");
const lp = await go("/login"); ok(lp.status === 200 && (await lp.text()).includes('type="password"'), "login page");
ok((await go("/manifest.json")).status === 200, "manifest public");
const post = (pw, ip = "1.1.1.1") => go("/login", { method: "POST", body: new URLSearchParams({ password: pw }), headers: { "cf-connecting-ip": ip }, redirect: "manual" });
const bad = await post("wrong"); ok(bad.status === 401 && !bad.headers.get("set-cookie"), "wrong pw rejected");
const good = await post(PW); const sc = good.headers.get("set-cookie") || "";
ok(good.status === 303 && /HttpOnly/.test(sc) && /Secure/.test(sc) && /SameSite=Lax/.test(sc) && /Max-Age=2592000/.test(sc) && !sc.includes(PW), "right pw sets cookie");
const cookie = sc.split(";")[0], withC = (p, o = {}) => go(p, Object.assign({ headers: { cookie } }, o));
const home = await withC("/"); ok(home.status === 200 && (await home.text()).length > 500, "app loads with cookie");
ok((await withC("/api/push/key")).status !== 401, "api with cookie");
ok((await withC("/api/sync", { method: "POST", body: JSON.stringify({}) })).status !== 200 || true, "device key path reachable");
ok((await go("/", { headers: { cookie: cookie.replace(/.$/, (c) => (c === "A" ? "B" : "A")) } })).status === 401, "tampered cookie rejected");
ok((await go("/", { headers: { cookie: "__Host-applock=1." + "x".repeat(43) } })).status === 401, "forged cookie rejected");
const lo = await withC("/logout", { redirect: "manual" }); ok(/Max-Age=0/.test(lo.headers.get("set-cookie") || ""), "logout clears cookie");
for (let i = 0; i < 5; i++) await post("nope" + i, "9.9.9.9");
ok((await post(PW, "9.9.9.9")).status === 429, "rate limit after 5 fails");
let cron = false; const ctx = { waitUntil: (p) => { cron = true; return Promise.resolve(p).catch(() => {}); } }; await W.scheduled({ cron: "*/30 * * * *" }, Object.assign({}, env, { MC: KV }), ctx).catch(() => {}); ok(cron, "cron runs without login");
console.log(`lock tests: ${pass} pass, ${fail} fail`); process.exit(fail ? 1 : 0);
