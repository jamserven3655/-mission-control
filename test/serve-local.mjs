// Local harness: runs cf/worker.built.js on http://localhost:8799 with in-memory KV and a throwaway password (printed to /tmp only). node test/serve-local.mjs
import fs from "node:fs"; import http from "node:http";
fs.copyFileSync(new URL("../cf/worker.built.js", import.meta.url), new URL("../cf/.local.mjs", import.meta.url)); const W = (await import("../cf/.local.mjs")).default;
const enc = new TextEncoder(), b64u = (b) => Buffer.from(b).toString("base64url"), PW = "local-" + Math.random().toString(36).slice(2), salt = crypto.getRandomValues(new Uint8Array(16));
const k = await crypto.subtle.importKey("raw", enc.encode(PW), "PBKDF2", false, ["deriveBits"]), h = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: 100000 }, k, 256);
const mem = new Map(), KV = { get: async (x, t) => (mem.has(x) ? (t === "json" ? JSON.parse(mem.get(x)) : mem.get(x)) : null), put: async (x, v) => void mem.set(x, v), delete: async (x) => void mem.delete(x) };
const env = { MC: KV, LOCK_HASH: `pbkdf2$100000$${b64u(salt)}$${b64u(h)}`, SESSION_KEY: b64u(crypto.getRandomValues(new Uint8Array(32))) };
fs.writeFileSync("/tmp/mc-local-pw", PW);
await W.scheduled({ cron: "*/30 * * * *" }, env, { waitUntil: (p) => p });
http.createServer(async (q, s) => { const ch = []; for await (const c of q) ch.push(c); const body = ch.length ? Buffer.concat(ch) : undefined;
  const r = await W.fetch(new Request("https://localhost:8799" + q.url, { method: q.method, headers: q.headers, body: q.method === "GET" || q.method === "HEAD" ? undefined : body }), env);
  const hd = {}; r.headers.forEach((v, k2) => { if (k2 !== "set-cookie") hd[k2] = v; }); const sc = r.headers.getSetCookie ? r.headers.getSetCookie() : []; if (sc.length) hd["set-cookie"] = sc;
  s.writeHead(r.status, hd); s.end(Buffer.from(await r.arrayBuffer())); }).listen(8799, () => console.log("listening 8799"));
