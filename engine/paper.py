#!/usr/bin/env python3
"""Paper Trader + Risk Keeper: PAPER ONLY. No wallet, no keys, no orders. Ledger: engine/paper_trades.json.
Rules: $4.50 per position, 1% fee each side, 2% slippage each side; sell half at 2x, trail rest 30% from peak,
hard stop -50%, max hold 3 days. Risk Keeper: max 2 open, no new entries after 3 losses in a day, $88 bucket.
Prices are checked only when this runs (once per weekday), so exits are approximate. `python3 paper.py --selftest` runs a synthetic test."""
import json, os, sys, time, datetime, urllib.request
H = os.path.dirname(os.path.abspath(__file__))
R = dict(stake=4.50, fee=0.01, slip=0.02, take=2.0, trail=0.30, stop=0.50, max_hold_h=72, max_open=2, daily_loss_stop=3, bucket=88.0)
def et_now(): return datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=-4 if datetime.date.today() < datetime.date(2026, 11, 1) else -5)))
def prices(mints):
    out = {}
    if not mints: return out
    try:
        with urllib.request.urlopen(urllib.request.Request("https://api.dexscreener.com/tokens/v1/solana/" + ",".join(mints), headers={"User-Agent": "MissionControl-Paper/1.0"}), timeout=15) as r:
            for p in json.load(r):
                m = p["baseToken"]["address"]; liq = (p.get("liquidity") or {}).get("usd") or 0
                if m not in out or liq > out[m][1]: out[m] = (float(p.get("priceUsd") or 0), liq)
    except Exception as e: print("price fetch failed:", str(e)[:80])
    return {m: v[0] for m, v in out.items()}
def sell(t, qty, px, why, ts):
    fill = px * (1 - R["slip"]); gross = qty * fill; fee = gross * R["fee"]
    t["qty"] -= qty; t["proceeds"] += gross - fee; t["fees"] += fee; t["slip_cost"] += qty * px * R["slip"]
    t["events"].append([ts, why, round(px, 10), round(gross - fee, 4)])
def step(L, px_now, ts, today):
    """Update open trades with current prices. Returns list of actions."""
    acts = []
    for t in L["trades"]:
        if t["status"] != "open": continue
        px = px_now.get(t["ca"])
        if not px: acts.append(f"{t['sym']}: no price, held"); continue
        t["last_px"] = px; t["peak"] = max(t["peak"], px); held = (ts - t["opened_ts"]) / 3600; e = t["entry_mkt"]
        if px <= e * (1 - R["stop"]): sell(t, t["qty"], px, "hard stop -50%", ts)
        else:
            if not t["half_sold"] and px >= e * R["take"]: sell(t, t["qty"] / 2, px, "sold half at 2x", ts); t["half_sold"] = True
            if t["half_sold"] and t["qty"] > 0 and px <= t["peak"] * (1 - R["trail"]): sell(t, t["qty"], px, "trail stop 30% from peak", ts)
            if t["qty"] > 0 and held >= R["max_hold_h"]: sell(t, t["qty"], px, "max hold 3 days", ts)
        if t["qty"] <= 1e-12:
            t.update(status="closed", closed=today, closed_ts=ts, net=round(t["proceeds"] - R["stake"], 4))
            L["losses"].setdefault(today, 0)
            if t["net"] < 0: L["losses"][today] += 1
            acts.append(f"{t['sym']}: closed, net {t['net']:+.2f} ({t['events'][-1][1]})")
        else: acts.append(f"{t['sym']}: open, price x{px / e:.2f} of entry")
    return acts
def try_open(L, pick, ts, today):
    op = [t for t in L["trades"] if t["status"] == "open"]
    realized = sum(t["net"] for t in L["trades"] if t["status"] == "closed")
    avail = R["bucket"] + realized - R["stake"] * len(op)
    if not pick: return "NO TRADE today (no token passed every filter)"
    if any(t["opened"] == today for t in L["trades"]): return "Already opened a paper trade today"
    if len(op) >= R["max_open"]: return "Risk Keeper: max 2 open positions"
    if L["losses"].get(today, 0) >= R["daily_loss_stop"]: return "Risk Keeper: daily stop after 3 losses"
    if avail < R["stake"]: return "Risk Keeper: $88 bucket exhausted"
    if any(t["ca"] == pick["ca"] and t["status"] == "open" for t in L["trades"]): return "Already holding " + pick["sym"]
    px = pick["price"]; fee = R["stake"] * R["fee"]; fill = px * (1 + R["slip"]); qty = (R["stake"] - fee) / fill
    L["trades"].append(dict(id=len(L["trades"]) + 1, sym=pick["sym"], ca=pick["ca"], url=pick.get("url"), opened=today, opened_ts=ts, entry_mkt=px, fill=fill, qty=qty, qty0=qty,
                            peak=px, last_px=px, half_sold=False, proceeds=0.0, fees=fee, slip_cost=(R["stake"] - fee) * R["slip"] / (1 + R["slip"]), status="open", events=[[ts, "open $4.50 paper", px, -R["stake"]]]))
    return f"Opened $4.50 paper position in {pick['sym']} at ${px:.8g}"
def summary(L):
    C = [t for t in L["trades"] if t["status"] == "closed"]; O = [t for t in L["trades"] if t["status"] == "open"]
    mark = lambda t: t["proceeds"] + t["qty"] * t["last_px"] * (1 - R["slip"]) * (1 - R["fee"]) - R["stake"]
    wins = sum(t["net"] > 0 for t in C)
    return dict(closed=len(C), open=len(O), wins=wins, win_rate=round(100 * wins / len(C), 1) if C else None, net=round(sum(t["net"] for t in C), 2),
                unrealized=round(sum(mark(t) for t in O), 2), fees=round(sum(t["fees"] for t in L["trades"]), 2), slippage=round(sum(t["slip_cost"] for t in L["trades"]), 2),
                avg_hold_h=round(sum((t["closed_ts"] - t["opened_ts"]) / 3600 for t in C) / len(C), 1) if C else None,
                bucket_left=round(R["bucket"] + sum(t["net"] for t in C) - R["stake"] * len(O), 2))
def run(path, pick, px_fn, ts, today):
    L = json.load(open(path)) if os.path.exists(path) else {"rules": R, "trades": [], "losses": {}, "log": []}
    acts = step(L, px_fn([t["ca"] for t in L["trades"] if t["status"] == "open"]), ts, today)
    acts.append(try_open(L, pick, ts, today))
    L["rules"] = R; L["summary"] = summary(L); L["log"] = (L["log"] + [[today, a] for a in acts])[-60:]; L["last_run"] = today
    for t in L["trades"]: t["mark_x"] = round(t["last_px"] / t["entry_mkt"], 3)
    json.dump(L, open(path, "w"), indent=1); return L, acts
def selftest():
    import tempfile; p = os.path.join(tempfile.mkdtemp(), "t.json"); day = 86400; t0 = 1.8e9
    pk = lambda s, px: dict(sym=s, ca=s, price=px)
    seq = {"A": [1, 2.2, 3.0, 2.0], "B": [1, 0.4], "C": [1, 1.1, 1.2, 1.3]}
    def pf(i): return lambda ms: {m: seq[m][min(i, len(seq[m]) - 1)] for m in ms}
    L, _ = run(p, pk("A", 1), pf(0), t0, "d0"); L, _ = run(p, pk("B", 1), lambda ms: {"A": 2.2, "B": 1}, t0 + day, "d1")
    L, a = run(p, pk("C", 1), lambda ms: {"A": 3.0, "B": 0.4}, t0 + 2 * day, "d2"); assert "max 2" not in a[-1], a
    L, a = run(p, None, lambda ms: {"A": 2.0, "C": 1.3}, t0 + 3 * day, "d3")
    T = {t["sym"]: t for t in L["trades"]}
    assert T["A"]["half_sold"] and T["A"]["status"] == "closed" and T["A"]["events"][-1][1].startswith("trail"), T["A"]["events"]
    assert T["B"]["status"] == "closed" and T["B"]["net"] < -2 and T["B"]["events"][-1][1] == "hard stop -50%"
    assert T["C"]["status"] == "open"
    L2 = {"trades": [dict(status="open", opened="y", ca="q")] * 2, "losses": {}}; assert "max 2" in try_open(L2, pk("D", 1), t0, "x")
    L3 = {"trades": [], "losses": {"x": 3}}; assert "daily stop" in try_open(L3, pk("D", 1), t0, "x")
    L4 = {"trades": [dict(status="closed", net=-84.0, opened="y")], "losses": {}}; assert "bucket" in try_open(L4, pk("D", 1), t0, "x")
    L, a = run(p, None, lambda ms: {"C": 1.3}, t0 + 6 * day, "d6"); assert L["trades"][2]["events"][-1][1] == "max hold 3 days"
    s = L["summary"]; print("selftest OK:", s); assert s["closed"] == 3 and s["wins"] == 2
if __name__ == "__main__":
    if "--selftest" in sys.argv: selftest(); sys.exit()
    S = json.load(open(os.path.join(H, "scan.json")))
    n = et_now(); L, acts = run(os.path.join(H, "paper_trades.json"), S.get("pick"), prices, time.time(), S.get("date") or n.strftime("%Y-%m-%d"))
    print("\n".join(acts)); print(L["summary"])
