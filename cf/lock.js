// ---- App lock (free): password login -> signed HttpOnly session cookie. Secrets: LOCK_HASH (pbkdf2), SESSION_KEY. ----
// Crons (scheduled) never pass through here. Fails CLOSED if secrets are missing (LOCK_DISABLED="1" only in local tests).
const LOCK_COOKIE = "__Host-applock", LOCK_DAYS = 30, LOCK_PUBLIC = new Set(["/login", "/logout", "/manifest.json", "/favicon.ico"]);
const lockEnc = new TextEncoder();
const lockB64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const lockUnb64 = (s) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
function lockEq(a, b) { if (typeof a !== "string" || typeof b !== "string") return false; let d = a.length ^ b.length; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i % (b.length || 1)); return d === 0; }
async function lockHmac(env, msg) { const k = await crypto.subtle.importKey("raw", lockEnc.encode(env.SESSION_KEY), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]); return lockB64u(await crypto.subtle.sign("HMAC", k, lockEnc.encode(msg))); }
async function lockCheckPw(env, pw) { // LOCK_HASH = pbkdf2$<iter>$<salt b64url>$<hash b64url>
  const [alg, it, salt, want] = String(env.LOCK_HASH || "").split("$"); if (alg !== "pbkdf2" || !want || typeof pw !== "string" || !pw || pw.length > 256) return false;
  const k = await crypto.subtle.importKey("raw", lockEnc.encode(pw), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: lockUnb64(salt), iterations: +it }, k, 256);
  return lockEq(lockB64u(bits), want);
}
function lockCookieVal(req) { const m = (req.headers.get("cookie") || "").match(/(?:^|;\s*)__Host-applock=([^;]+)/); return m ? m[1] : null; }
async function lockValid(req, env) { const v = lockCookieVal(req); if (!v) return false; const [exp, sig] = v.split("."); if (!/^\d+$/.test(exp || "") || +exp < Date.now()) return false; return lockEq(sig, await lockHmac(env, "v1." + exp)); }
const lockIp = (req) => req.headers.get("cf-connecting-ip") || "local";
function lockPage(msg, status = 401, extra = {}) {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Locked</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0b0f17;color:#e8eefc;font:16px system-ui,-apple-system,sans-serif}form{background:#141b2a;padding:28px;border-radius:16px;width:min(92vw,340px);box-shadow:0 10px 40px #0008}h1{font-size:20px;margin:0 0 6px}p{margin:0 0 16px;color:#9fb0d0;font-size:14px}input,button{width:100%;box-sizing:border-box;padding:14px;border-radius:10px;font-size:16px;border:1px solid #2a3550}input{background:#0b0f17;color:#fff;margin-bottom:12px}button{background:#4f7cff;color:#fff;border:0;font-weight:600}.e{color:#ff7a7a;min-height:20px;font-size:14px;margin:0 0 10px}</style></head>
<body><form method="post" action="/login" autocomplete="on"><h1>🔒 Private</h1><p>Enter your password to continue.</p><div class="e">${msg || ""}</div>
<input type="text" name="username" value="james" autocomplete="username" hidden><input type="password" name="password" autocomplete="current-password" placeholder="Password" required autofocus><button type="submit">Unlock</button></form>
<script>try{caches.keys().then(k=>k.forEach(x=>caches.delete(x)))}catch(e){}</script></body></html>`;
  return new Response(html, { status, headers: Object.assign({ "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-frame-options": "DENY", "referrer-policy": "no-referrer", "x-app-lock": "1" }, extra) });
}
async function lockGate(req, env) { // returns a Response to send, or null when the request may proceed
  if (env.LOCK_DISABLED === "1") return null;
  const u = new URL(req.url), p = u.pathname;
  if (!env.LOCK_HASH || !env.SESSION_KEY) return new Response("Locked: not configured", { status: 503, headers: { "cache-control": "no-store" } });
  if (p === "/logout") return new Response(null, { status: 303, headers: { location: "/login", "cache-control": "no-store", "clear-site-data": '"cache"', "set-cookie": `${LOCK_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax` } });
  if (p === "/login" && req.method === "POST") {
    const kv = env.AUTO || env.MC, ip = lockIp(req), rk = "lockfail:" + ip, now = Date.now();
    let rec = (kv && (await kv.get(rk, "json"))) || { n: 0, t: now }; if (now - rec.t > 15 * 60e3) rec = { n: 0, t: now };
    if (rec.n >= 5) return lockPage("Too many tries. Wait 15 minutes.", 429, { "retry-after": "900" });
    let pw = ""; try { const f = await req.formData(); pw = String(f.get("password") || ""); } catch {}
    if (await lockCheckPw(env, pw)) {
      if (kv && rec.n) await kv.delete(rk);
      const exp = now + LOCK_DAYS * 864e5, val = exp + "." + (await lockHmac(env, "v1." + exp));
      return new Response(null, { status: 303, headers: { location: "/", "cache-control": "no-store", "set-cookie": `${LOCK_COOKIE}=${val}; Path=/; Max-Age=${LOCK_DAYS * 86400}; HttpOnly; Secure; SameSite=Lax` } });
    }
    rec.n++; if (kv) await kv.put(rk, JSON.stringify(rec), { expirationTtl: 1800 });
    return lockPage("Wrong password.", 401);
  }
  if (await lockValid(req, env)) return p === "/login" ? new Response(null, { status: 303, headers: { location: "/" } }) : null;
  if (LOCK_PUBLIC.has(p) || p.startsWith("/icons/")) return p === "/login" ? lockPage("", 200) : null;
  if (p.startsWith("/api/") || req.method !== "GET" || (req.headers.get("accept") || "").includes("application/json") || /\.(json|js|css|md)$/.test(p))
    return new Response(JSON.stringify({ error: "locked", login: "/login" }), { status: 401, headers: { "content-type": "application/json", "cache-control": "no-store", "x-app-lock": "1" } });
  return lockPage("", 401);
}
