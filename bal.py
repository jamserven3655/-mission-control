import json,urllib.request,time
from rpc import rpc,W
names={"main":"Main","81ns":"Phantom 81Ns","j1df":"Phantom J1df","fomo":"FOMO app"}
TP=["TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA","TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"]
def get(u):
    return json.load(urllib.request.urlopen(urllib.request.Request(u,headers={"User-Agent":"Mozilla/5.0"}),timeout=20))
out={};mints=set()
SOL="So11111111111111111111111111111111111111112"
for k,a in W.items():
    sol=rpc("getBalance",[a])["value"]/1e9
    toks={}
    for p in TP:
        for t in rpc("getTokenAccountsByOwner",[a,{"programId":p},{"encoding":"jsonParsed"}])["value"]:
            i=t["account"]["data"]["parsed"]["info"];amt=float(i["tokenAmount"]["uiAmount"] or 0)
            if amt>0: toks[i["mint"]]=toks.get(i["mint"],0)+amt;mints.add(i["mint"])
    out[k]={"sol":sol,"toks":toks}
px={}
ml=list(mints|{SOL})
for i in range(0,len(ml),30):
    for tr in range(4):
        try:
            d=get("https://lite-api.jup.ag/price/v3?ids="+",".join(ml[i:i+30]))
            for m,v in d.items(): px[m]=v.get("usdPrice")
            break
        except Exception as e: print("price err",e); time.sleep(3+tr*4)
if not px.get(SOL):  # fallback: DexScreener SOL/USD pair (free)
    try: px[SOL]=float(next(p["priceUsd"] for p in get("https://api.dexscreener.com/tokens/v1/solana/"+SOL) if "USD" in p["quoteToken"]["symbol"]))
    except Exception as e: print("dex price err",e)
for m in ["EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v","CASHx9KJUStyftLFWGvEVf59SGeG9sh5FfcnZMVPCASH"]:
    px.setdefault(m,1.0)
tot=0
for k,v in out.items():
    usd=v["sol"]*(px.get(SOL) or 0)+sum(a*(px.get(m) or 0) for m,a in v["toks"].items())
    v["usd"]=round(usd,2);tot+=usd
    print(names[k],round(v["sol"],5),"SOL",{m[:6]:round(a,4) for m,a in v["toks"].items()},"$",v["usd"])
print("SOL px",px.get(SOL),"TOTAL",round(tot,2))
json.dump({"wallets":out,"px":px,"total":tot},open("wallets.json","w"),indent=1)
