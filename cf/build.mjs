// Builds a self-contained Cloudflare Worker serving ../pwa (static, read-only) + the connector deploy code. node build.mjs
import fs from "fs"; import path from "path";
const root = new URL("../pwa/", import.meta.url).pathname, F = {};
const ct = { ".html": "text/html; charset=utf-8", ".js": "application/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8", ".md": "text/markdown; charset=utf-8", ".png": "image/png" };
const skip = new Set(["build_data.py", "static.json"]);
(function walk(d) { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); if (fs.statSync(p).isDirectory()) walk(p); else if (!skip.has(f)) F["/" + path.relative(root, p)] = [f === "manifest.json" ? "application/manifest+json" : ct[path.extname(p)] || "application/octet-stream", fs.readFileSync(p).toString("base64")]; } })(root);
const w = `const F = ${JSON.stringify(F)};
const BIN = {}, NOCACHE = new Set(["/sw.js", "/index.html", "/data.json", "/manifest.json", "/bot_ideas.json", "/coach.js", "/coach-ui.js", "/app.js"]);
export default { async fetch(req) {
  let p = new URL(req.url).pathname; if (p === "/" || p === "") p = "/index.html";
  if (req.method !== "GET" && req.method !== "HEAD") return new Response("GET only", { status: 405 });
  const f = F[p]; if (!f) return new Response("Not found", { status: 404 });
  const b = BIN[p] || (BIN[p] = Uint8Array.from(atob(f[1]), (c) => c.charCodeAt(0)));
  return new Response(req.method === "HEAD" ? null : b, { headers: { "content-type": f[0], "x-frame-options": "DENY", "referrer-policy": "no-referrer", "x-content-type-options": "nosniff", "cache-control": NOCACHE.has(p) ? "no-cache" : "public, max-age=300" } });
} };
`;
fs.writeFileSync("worker.built.js", w);
fs.writeFileSync("deploy.js", `async () => {
  const NAME = "jellis-mission-control", log = [], W = ${JSON.stringify(w)};
  const form = new FormData();
  form.append("metadata", new Blob([JSON.stringify({ main_module: "worker.js", compatibility_date: "2026-10-01" })], { type: "application/json" }));
  form.append("worker.js", new Blob([W], { type: "application/javascript+module" }), "worker.js");
  const up = await cloudflare.request({ method: "PUT", path: \`/accounts/\${accountId}/workers/scripts/\${NAME}\`, body: form });
  log.push("script " + up.success + " " + JSON.stringify(up.errors));
  const sd = await cloudflare.request({ method: "POST", path: \`/accounts/\${accountId}/workers/scripts/\${NAME}/subdomain\`, body: { enabled: true, previews_enabled: false } });
  log.push("subdomain " + JSON.stringify(sd.result));
  return log;
}`);
console.log(Object.keys(F).join(" "), fs.statSync("deploy.js").size);
