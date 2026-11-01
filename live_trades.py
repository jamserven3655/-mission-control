# Read-only: turns swaps_today.json (from swaps.py) into live_trades.json with fee breakdown + realized P&L. Public RPC/DexScreener only; no keys.
import json, time, urllib.request
exec(open("swaps.py").read().split("ET = ")[0])  # rpc() + W
WSOL = "So11111111111111111111111111111111111111112"
STABLE = {"EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", "CASHx9KJUStyftLFWGvEVf59SGeG9sh5FfcnZMVPCASH", WSOL}
sw = json.load(open("swaps_today.json")); wl = json.load(open("wallets.json"))
solpx = wl.get("px", {}).get(WSOL) or 0
def sym(mint):
    try:
        p = json.load(urllib.request.urlopen(urllib.request.Request("https://api.dexscreener.com/tokens/v1/solana/" + mint, headers={"User-Agent": "mc/1"}), timeout=20))[0]
        return p["baseToken"]["symbol"], p["baseToken"]["name"], p["url"], p.get("dexId")
    except Exception: return mint[:6], mint[:6], "", ""
trades = []
for x in sw:
    if not x["ok"] or not x["signer"]: continue
    toks = {m: v for m, v in x["dtok"].items() if m not in STABLE}
    if len(toks) != 1: continue
    mint, amt = next(iter(toks.items())); a = W[x["wallet"]]
    tx = rpc("getTransaction", [x["sig"], {"encoding": "jsonParsed", "maxSupportedTransactionVersion": 1}]); m = tx["meta"]; msg = tx["transaction"]["message"]
    inner = [ix for g in m.get("innerInstructions", []) for ix in g["instructions"]]
    P = lambda ix: ix.get("parsed") if isinstance(ix.get("parsed"), dict) else {}
    closed = {P(ix)["info"]["account"] for ix in msg["instructions"] + inner if P(ix).get("type") == "closeAccount"}
    # top-level SOL transfers from the wallet = app/router fee + tips
    side_fees = sum(P(ix)["info"]["lamports"] for ix in msg["instructions"] if P(ix).get("type") == "transfer" and ix.get("program") == "system" and P(ix)["info"]["source"] == a) / 1e9
    # rent locked in new accounts that were not closed in the same tx (refundable later by closing the empty account)
    keys = [k["pubkey"] for k in msg["accountKeys"]]
    rent = 0
    for ix in inner:
        if P(ix).get("type") == "createAccount" and P(ix)["info"]["source"] == a and P(ix)["info"].get("newAccount") not in closed: rent += P(ix)["info"]["lamports"] / 1e9
    s, name, url, dex = sym(mint)
    trades.append(dict(wallet=x["wallet"], side="buy" if amt > 0 else "sell", time=x["time"], ts=x["ts"], sig=x["sig"], mint=mint, sym=s, name=name, url=url, dex=dex,
                       tokens=abs(amt), sol_wallet_delta=x["dsol"], network_fee=x["fee_sol"], app_fees_tips=round(side_fees, 9), rent_locked=round(rent, 9),
                       sol_trade=round(abs(x["dsol"]) - x["fee_sol"] - side_fees - rent, 9) if amt > 0 else round(x["dsol"] + x["fee_sol"] + side_fees, 9)))
# pair per mint: realized = proceeds (net of fees) - cost (incl. fees, excl. refundable rent)
summary = []
for mint in dict.fromkeys(t["mint"] for t in trades):
    T = [t for t in trades if t["mint"] == mint]; b = [t for t in T if t["side"] == "buy"]; s_ = [t for t in T if t["side"] == "sell"]
    bt, st = sum(t["tokens"] for t in b), sum(t["tokens"] for t in s_)
    cost = sum(-t["sol_wallet_delta"] - t["rent_locked"] for t in b); proc = sum(t["sol_wallet_delta"] for t in s_)
    fees = sum(t["network_fee"] + t["app_fees_tips"] for t in T)
    if b and s_ and abs(bt - st) < 1e-6 * max(bt, 1):
        summary.append(dict(mint=mint, sym=T[0]["sym"], name=T[0]["name"], url=T[0]["url"], closed=True, cost_sol=round(cost, 9), proceeds_sol=round(proc, 9), realized_sol=round(proc - cost, 9),
                            realized_usd=round((proc - cost) * solpx, 2), fees_sol=round(fees, 9), fees_usd=round(fees * solpx, 3), rent_locked_sol=round(sum(t["rent_locked"] for t in b), 9),
                            pct=round((proc - cost) / cost * 100, 1) if cost else None, first=T[0]["time"], last=T[-1]["time"]))
    else:
        summary.append(dict(mint=mint, sym=T[0]["sym"], name=T[0]["name"], url=T[0]["url"], closed=False, cost_sol=round(cost, 9), proceeds_sol=round(proc, 9), tokens_left=bt - st, first=T[0]["time"], last=T[-1]["time"]))
out = dict(generated=time.strftime("%Y-%m-%d %H:%M %Z"), sol_price=solpx, note="Real trades signed by you, read from the public Solana RPC. USD at the refresh SOL price.", trades=trades, summary=summary)
json.dump(out, open("live_trades.json", "w"), indent=1); print(json.dumps(summary, indent=1)); [print(t["side"], t["time"], t["sym"], t["tokens"], t["sol_wallet_delta"], t["network_fee"], t["app_fees_tips"], t["rent_locked"], t["sol_trade"]) for t in trades]
