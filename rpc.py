import json,urllib.request,time,sys
RPC="https://api.mainnet-beta.solana.com"
def rpc(m,p):
    for i in range(8):
        try:
            r=urllib.request.urlopen(urllib.request.Request(RPC,json.dumps({"jsonrpc":"2.0","id":1,"method":m,"params":p}).encode(),{"Content-Type":"application/json"}),timeout=30)
            j=json.load(r)
            if 'error' in j: raise Exception(j['error'])
            return j['result']
        except Exception as e:
            time.sleep(2+i*2)
    raise Exception("fail "+m)
W={"main":"BZD82QWFzFpfKgAbm46GRr1GR76pZq6AmktLnjCZB2NA","j1df":"J1dfibagGeMAbWpUMAjWeJ1oLEQ7uLysqSjqw6xcDto5","81ns":"81NsSsVMAC1Fo8daTvohCq2bnE5syiMRMHtg2hp8Ye5D","fomo":"DsV7L4LnsekSsfV3FFqgnpvNApBKipq7hbtEGzoyYYcb"}
if __name__=="__main__":
    for k,a in W.items():
        sigs=[];before=None
        while True:
            p={"limit":1000}
            if before:p["before"]=before
            r=rpc("getSignaturesForAddress",[a,p])
            sigs+=r
            if len(r)<1000:break
            before=r[-1]["signature"]
        out[k]=sigs;print(k,len(sigs),file=sys.stderr)
    json.dump(out,open("sigs.json","w"))
    