#!/usr/bin/env python3
"""Scout: deterministic Solana memecoin scan (no LLM, read-only public APIs, never trades).
Sources: DexScreener token-boosts top/latest + token-profiles latest (Solana), pair data via /tokens/v1/solana.
Safety: RugCheck public report (api.rugcheck.xyz) for mint/freeze authority, top-10 holder share, rugged flag.
Writes engine/scan.json. At most ONE paper pick, only if a token passes every filter; else NO TRADE."""
import json, os, time, urllib.request, datetime
H = os.path.dirname(os.path.abspath(__file__))
UA = {"User-Agent": "MissionControl-Scout/1.0 (read-only)"}
def get(u, t=15):
    try:
        with urllib.request.urlopen(urllib.request.Request(u, headers=UA), timeout=t) as r: return json.load(r)
    except Exception as e: return {"_err": str(e)[:120]}
F = dict(min_liq=50000, max_vol_liq=50, min_age_h=24, min_buy_sell=1.0, min_chg24=-50, min_chg1=-25, max_top10=30, min_holders=500, max_rug_score=500)
def rugcheck(mint):
    d = get(f"https://api.rugcheck.xyz/v1/tokens/{mint}/report", 20)
    if not isinstance(d, dict) or "_err" in d or "mint" not in d: return {"ok": False, "err": (d or {}).get("_err", "no data") if isinstance(d, dict) else "bad"}
    known = set((d.get("knownAccounts") or {}).keys())
    hold = [h for h in (d.get("topHolders") or []) if h.get("owner") not in known and h.get("address") not in known]  # skip AMM/pool accounts
    return {"ok": True, "mint_auth": d.get("mintAuthority"), "freeze_auth": d.get("freezeAuthority"), "top10": round(sum(h.get("pct") or 0 for h in hold[:10]), 1),
            "holders": d.get("totalHolders"), "rugged": bool(d.get("rugged")), "score": d.get("score"), "risks": [r.get("name") for r in (d.get("risks") or [])][:5]}
def main():
    now = time.time(); mints, seen = [], set()
    for u in ("https://api.dexscreener.com/token-boosts/top/v1", "https://api.dexscreener.com/token-boosts/latest/v1", "https://api.dexscreener.com/token-profiles/latest/v1"):
        d = get(u)
        for x in d if isinstance(d, list) else []:
            m = x.get("tokenAddress")
            if x.get("chainId") == "solana" and m and m not in seen: seen.add(m); mints.append(m)
    mints = mints[:60]; pairs = {}
    for i in range(0, len(mints), 30):
        d = get("https://api.dexscreener.com/tokens/v1/solana/" + ",".join(mints[i:i + 30]))
        for p in d if isinstance(d, list) else []:
            m = (p.get("baseToken") or {}).get("address")
            if m in seen and ((p.get("liquidity") or {}).get("usd") or 0) >= ((pairs.get(m, {}).get("liquidity") or {}).get("usd") or 0): pairs[m] = p
    rows = []
    for m, p in pairs.items():
        liq = (p.get("liquidity") or {}).get("usd") or 0; vol = (p.get("volume") or {}).get("h24") or 0
        ch = p.get("priceChange") or {}; tx = p.get("txns") or {}; t1 = tx.get("h1") or {}; t24 = tx.get("h24") or {}
        age = (now * 1000 - (p.get("pairCreatedAt") or now * 1000)) / 3.6e6
        bs1 = (t1.get("buys") or 0) / max(1, t1.get("sells") or 0); bs24 = (t24.get("buys") or 0) / max(1, t24.get("sells") or 0)
        info = p.get("info") or {}; socials = len(info.get("socials") or []) + len(info.get("websites") or [])
        vl = vol / liq if liq else 999
        hard = []
        if liq < F["min_liq"]: hard.append("Low liquidity")
        if vl > F["max_vol_liq"]: hard.append(f"Extreme volume/liquidity {vl:.0f}x")
        if age < F["min_age_h"]: hard.append("Very new (<24h)")
        if bs1 < F["min_buy_sell"]: hard.append("Sell pressure (1h)")
        if (ch.get("h24") or 0) <= F["min_chg24"] or (ch.get("h1") or 0) <= F["min_chg1"]: hard.append("Dumping")
        if not socials: hard.append("No socials/website")
        if not any(c.isalnum() for c in (p.get("baseToken") or {}).get("symbol") or ""): hard.append("Unreadable symbol")
        # score 0-100: deterministic weights
        s = min(30, liq / 200000 * 30) + (20 if 2 <= vl <= 20 else 10 if vl < 2 or vl <= 50 else 0) + min(15, age / 72 * 15) + min(20, max(0, (bs24 - 0.8) * 25)) + (10 if 0 < (ch.get("h24") or 0) < 300 else 3) + (5 if socials else 0)
        rows.append(dict(sym=(p.get("baseToken") or {}).get("symbol"), name=(p.get("baseToken") or {}).get("name"), ca=m, url=p.get("url"), price=float(p.get("priceUsd") or 0),
                         liq=round(liq), vol24=round(vol), vol_liq=round(vl, 1), age_h=round(age, 1), chg1=ch.get("h1"), chg24=ch.get("h24"), bs1=round(bs1, 2), bs24=round(bs24, 2),
                         socials=socials, score=round(s), flags=hard, rug=None))
    rows.sort(key=lambda r: (len(r["flags"]) > 0, -r["score"]))
    for r in rows[:8]:  # RugCheck only the best few to stay light on the free API
        rc = rugcheck(r["ca"]); r["rug"] = rc; time.sleep(0.4)
        if not rc["ok"]: r["flags"].append("RugCheck UNVERIFIED"); continue
        if rc["mint_auth"]: r["flags"].append("Mint authority enabled")
        if rc["freeze_auth"]: r["flags"].append("Freeze authority enabled")
        if rc["top10"] > F["max_top10"]: r["flags"].append(f"Top-10 holders {rc['top10']}%")
        if (rc["holders"] or 0) < F["min_holders"]: r["flags"].append("Few holders")
        if rc["rugged"]: r["flags"].append("Flagged rugged")
        if (rc["score"] or 0) > F["max_rug_score"]: r["flags"].append(f"RugCheck risk score {rc['score']}")
    for r in rows:
        if r["rug"] is None: r["flags"].append("RugCheck not run (outside top 8)")
        r["scout"] = "WATCH" if not r["flags"] else "SKIP"
    rows.sort(key=lambda r: (r["scout"] != "WATCH", -r["score"]))
    pick = next((r for r in rows if r["scout"] == "WATCH"), None)
    et = datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=-4 if datetime.date.today() < datetime.date(2026, 11, 1) else -5)))
    out = dict(run=et.strftime("%Y-%m-%d %H:%M ET"), date=et.strftime("%Y-%m-%d"), scanned=len(rows), filters=F, pick=pick and {k: pick[k] for k in ("sym", "name", "ca", "url", "price", "score")},
               decision=("PAPER PICK " + pick["sym"]) if pick else "NO TRADE today", reason=("Passed every filter, highest score %d" % pick["score"]) if pick else
               ("No token passed every filter" if rows else "No data from DexScreener"), candidates=rows[:15])
    json.dump(out, open(os.path.join(H, "scan.json"), "w"), indent=1)
    print(out["run"], "scanned", len(rows), "WATCH", sum(r["scout"] == "WATCH" for r in rows), "->", out["decision"])
if __name__ == "__main__": main()
