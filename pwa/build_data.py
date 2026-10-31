# Regenerates pwa/data.json from ../wallets.json, ../tokens.json, ../raw_sources.json + pwa/static.json. Read-only data; no keys.
import json, os, time, datetime
H = os.path.dirname(os.path.abspath(__file__)); M = os.path.dirname(H)
L = lambda p: json.load(open(p))
S = L(os.path.join(H, "static.json"))
W = L(os.path.join(M, "wallets.json"))
P = L(os.path.join(M, "wallets_prev.json")) if os.path.exists(os.path.join(M, "wallets_prev.json")) else W
SYM = {"EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v": "USDC", "CASHx9KJUStyftLFWGvEVf59SGeG9sh5FfcnZMVPCASH": "CASH"}
px = W.get("px", {}); sol = px.get("So11111111111111111111111111111111111111112") or 0
et = datetime.datetime.fromtimestamp(os.path.getmtime(os.path.join(M, "wallets.json")), datetime.timezone(datetime.timedelta(hours=-4)))  # EDT; switch to -5 after Nov 1
stamp = et.strftime("%b %-d, %Y, %-I:%M %p ET")
wallets = []
for m in S["wallet_meta"]:
    w = W["wallets"].get(m["key"], {}); hold = []
    if w.get("sol", 0) >= 0.0005: hold.append(f'{w["sol"]:.4f} SOL')
    dust = False
    for mint, amt in (w.get("toks") or {}).items():
        v = amt * (px.get(mint) or 0)
        if mint in SYM and amt >= 0.01: hold.append(f"{amt:,.2f} {SYM[mint]}")
        elif amt > 0: dust = True
    if dust: hold.append("dust")
    wallets.append(dict(m, hold=", ".join(hold) or "empty", now=round(w.get("usd", 0), 2), prev=round(P["wallets"].get(m["key"], {}).get("usd", 0), 2)))
total = round(W["total"], 2)
hist = S["history"] + [[et.strftime("%b %-d %-I:%M%p").replace("AM", "a").replace("PM", "p"), total]]
def money(x): return "$%.1fM" % (x / 1e6) if x >= 1e6 else "$%.1fk" % (x / 1e3) if x >= 1e3 else "$%.0f" % x
def age(h): return f"{round(h)} h" if h < 48 else f"{round(h/24)} d"
dex = []
for t in L(os.path.join(M, "tokens.json"))[:10]:
    liq, vol, chg = t.get("liq") or 0, t.get("vol24") or 0, t.get("chg24") or 0
    ok = liq >= 50000 and chg > -50
    why = S["scout_override"].get(t["sym"]) or (f"Down {abs(round(chg))}%, liquidity {money(liq)}" if chg <= -50 else "Liquidity under $50k" if liq < 50000 else f"Volume {round(vol/liq)}x liquidity" if vol > 20 * liq else "Liquidity ok")
    if t["sym"] in S["scout_override"]: ok = False
    dex.append(dict(sym=t["sym"], name=t["name"], ca=t["ca"], age=age(t["age_h"]), liq=money(liq), vol=money(vol), chg=("%+d%%" % round(chg)), scout="WATCH" if ok else "SKIP", why=why, url=t["url"], liqn=liq, voln=vol))
pump = []
raw = L(os.path.join(M, "raw_sources.json")).get("pump")
if isinstance(raw, list):
    for c in raw[:6]:
        h = (time.time() * 1000 - (c.get("created_timestamp") or 0)) / 3.6e6
        pump.append(dict(sym=c.get("symbol"), name=c.get("name"), ca=c.get("mint"), age=age(h), liq="unverified", vol="unverified", chg="mcap " + money(c.get("usd_market_cap") or 0), scout="SKIP", why="Liquidity unverified" + ("" if c.get("complete") else ", on bonding curve"), url="https://pump.fun/coin/" + c.get("mint", "")))
E = os.path.join(M, "engine")
def LJ(p, d=None): return L(p) if os.path.exists(p) else d
scan = LJ(os.path.join(E, "scan.json"), {}); paper = LJ(os.path.join(E, "paper_trades.json"), {"trades": [], "summary": {}, "log": []})
notion_exp = LJ(os.path.join(E, "expenses.json"), [])  # written by the routine's Notion Inbox step: [{date,merchant,amount,category,source}]
mt = [os.path.getmtime(os.path.join(M, "wallets.json"))] + ([os.path.getmtime(os.path.join(E, "scan.json"))] if scan else [])
oldest = datetime.datetime.fromtimestamp(min(mt), datetime.timezone(datetime.timedelta(hours=-4)))
ps = paper.get("summary") or {}
trades = [dict(id=t["id"], sym=t["sym"], url=t.get("url"), opened=t["opened"], status=t["status"], entry=t["entry_mkt"], last=t["last_px"], x=t.get("mark_x"), half=t["half_sold"],
               net=t.get("net"), fees=round(t["fees"], 3), last_event=t["events"][-1][1], closed=t.get("closed")) for t in paper["trades"]][::-1]
# week spend from Notion-synced expenses (Mon-Sun ET)
today = datetime.date.today(); wk0 = today - datetime.timedelta(days=today.weekday())
CAT = {"Alcohol": "Alcohol", "Food": "Restaurants", "Fun": None, "Other": None}
week = {k: 0.0 for k in S["caps_weekly"]}
for x in notion_exp:
    try:
        if datetime.date.fromisoformat(x["date"][:10]) < wk0: continue
    except Exception: continue
    c = x.get("cap") or CAT.get(x.get("category"))
    if c in week: week[c] += float(x.get("amount") or 0)
pick = scan.get("pick")
act = {"chief": f"Refresh done {oldest.strftime('%-I:%M %p')} ET", "scout": f"Scanned {scan.get('scanned', 0)} pairs: " + (f"pick {pick['sym']}" if pick else "NO TRADE"),
       "paper": f"{ps.get('open', 0)} open, {ps.get('closed', 0)} closed", "risk": f"Bucket left ${ps.get('bucket_left', 88)}", "analyst": "Daily briefing written",
       "finance": f"{len(notion_exp)} Notion expenses synced", "income": f"{len(S['income_ideas'])} ideas on the board"}
out_risk = [[k, f"{ps.get('open', 0)} of max 2" if k == "Open positions" else f"Paper trading only, {ps.get('open', 0) + ps.get('closed', 0)} paper trades logged" if k == "Mode" else v] for k, v in S["risk"]]
agents = [dict(a, activity=act.get(a["id"], "")) for a in S["agents"]]
out = {k: v for k, v in S.items() if k not in ("wallet_meta", "history", "scout_override", "agents")}
out.update(risk=out_risk, updated_iso=oldest.isoformat(), agents=agents, scan=dict(run=scan.get("run"), decision=scan.get("decision", "Scan not run"), reason=scan.get("reason", ""), pick=pick, filters=scan.get("filters"),
           candidates=[{k: c.get(k) for k in ("sym", "name", "ca", "url", "price", "liq", "vol24", "vol_liq", "age_h", "chg1", "chg24", "bs1", "score", "scout", "flags")} | {"rug": c.get("rug")} for c in scan.get("candidates", [])]),
           paper=dict(summary=ps, trades=trades, log=paper.get("log", [])[-8:], rules=paper.get("rules")), expenses=notion_exp, week_spend=week)
out.update(updated=stamp, sol_price=round(sol, 2), wallets=wallets, total=total, history=hist, dex=dex, pump=pump)
sm = lambda v: "n/a" if v is None else f"{v:+.2f}"
hrs = (time.time() - min(mt)) / 3600
lines = [f"# Daily briefing, {datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=-4))).strftime('%a %b %-d, %-I:%M %p')} ET",
 f"- Scout: {scan.get('decision', 'scan not run')}. {scan.get('reason', '')}.",
 f"- Paper: {ps.get('open', 0)} open, {ps.get('closed', 0)} closed, win rate {('%s%%' % ps['win_rate']) if ps.get('win_rate') is not None else 'n/a'}, net ${sm(ps.get('net'))} realized, ${sm(ps.get('unrealized'))} open (after fees/slippage). Paper only.",
 f"- Wallets: ${total:.2f} total vs ${S['oct27_total']:.2f} on Oct 27 (read-only).",
 "- Spend this week vs caps: " + ", ".join(f"{k} ${week[k]:.0f}/${v}" for k, v in S["caps_weekly"].items()) + ("" if notion_exp else " (no Notion expenses logged yet)") + ".",
 f"- $5K mission: income/savings are entered in the app on your phone; the server only knows confirmed savings ${S['stats']['savings']}.",
 f"- Grok cost this month ${S['stats']['grok_month']} (extra ${S['stats']['grok_extra']} vs ${S['stats']['grok_cap']} cap). Usage {S['usage']['pct']}%, resets {S['usage']['reset_label']}."]
if hrs > 30: lines.append(f"- WARNING: data is STALE ({hrs:.0f} h old).")
if S["usage"]["pct"] >= 90: lines.append("- WARNING: plan usage at or above 90%.")
open(os.path.join(H, "briefing.md"), "w").write("\n".join(lines[:10]) + "\n"); out["briefing"] = lines[1:10]
json.dump(out, open(os.path.join(H, "data.json"), "w"), indent=1)
print("data.json", stamp, "total", total, "dex", len(dex), "pump", len(pump))
