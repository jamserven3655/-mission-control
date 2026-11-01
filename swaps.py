# Read-only: today's (ET) on-chain transactions per wallet -> per-tx SOL/token deltas + fees. Public RPC only.
import json, sys, time, datetime, zoneinfo
from rpc import W
import urllib.request
EPS = ["https://solana-rpc.publicnode.com", "https://api.mainnet-beta.solana.com"]
def rpc(m, p):
    last = None
    for i in range(10):
        try:
            r = urllib.request.urlopen(urllib.request.Request(EPS[i % 2], json.dumps({"jsonrpc": "2.0", "id": 1, "method": m, "params": p}).encode(), {"Content-Type": "application/json", "User-Agent": "mc/1"}), timeout=30)
            j = json.load(r)
            if "error" in j: raise Exception(j["error"])
            return j["result"]
        except Exception as e:
            last = e; time.sleep(1 + i)
    raise Exception("fail %s %s" % (m, last))
ET = zoneinfo.ZoneInfo("America/New_York")
since = datetime.datetime.combine(datetime.date.fromisoformat(sys.argv[1]) if len(sys.argv) > 1 else datetime.datetime.now(ET).date(), datetime.time(0), ET).timestamp()
out = []
for k, a in W.items():
    sigs = [s for s in rpc("getSignaturesForAddress", [a, {"limit": 50}]) if (s.get("blockTime") or 0) >= since]
    for s in sigs:
        tx = rpc("getTransaction", [s["signature"], {"encoding": "jsonParsed", "maxSupportedTransactionVersion": 1}]); time.sleep(0.4)
        if not tx: continue
        m = tx["meta"]; keys = [x["pubkey"] for x in tx["transaction"]["message"]["accountKeys"]]
        i = keys.index(a) if a in keys else None
        dsol = (m["postBalances"][i] - m["preBalances"][i]) / 1e9 if i is not None else 0
        signer = keys[0] == a
        tok = {}
        for side, arr in (("pre", m.get("preTokenBalances") or []), ("post", m.get("postTokenBalances") or [])):
            for b in arr:
                if b.get("owner") != a: continue
                amt = float(b["uiTokenAmount"]["uiAmount"] or 0)
                tok.setdefault(b["mint"], [0, 0])[0 if side == "pre" else 1] += amt
        dtok = {mt: round(v[1] - v[0], 9) for mt, v in tok.items() if abs(v[1] - v[0]) > 0}
        progs = sorted({ix.get("programId", "")[:6] for ix in tx["transaction"]["message"]["instructions"]})
        logs = " ".join(m.get("logMessages") or [])
        out.append(dict(wallet=k, sig=s["signature"], time=datetime.datetime.fromtimestamp(s["blockTime"], ET).strftime("%Y-%m-%d %-I:%M:%S %p ET"), ts=s["blockTime"],
                        ok=m["err"] is None, signer=signer, fee_sol=m["fee"] / 1e9 if signer else 0, dsol=round(dsol, 9), dtok=dtok, progs=progs,
                        jup="JUP6Lk" in logs or "JUP6Lk" in "".join(progs), pump="6EF8rr" in logs or "pAMMBa" in logs))
json.dump(sorted(out, key=lambda x: x["ts"]), open("swaps_today.json", "w"), indent=1)
for x in sorted(out, key=lambda x: x["ts"]): print(x["wallet"], x["time"], "ok" if x["ok"] else "FAILED", "dSOL", x["dsol"], "fee", x["fee_sol"], {m[:6]: v for m, v in x["dtok"].items()}, "jup" if x["jup"] else "", "pump" if x["pump"] else "", x["sig"][:10])
