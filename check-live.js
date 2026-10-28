// Run: node check-live.js [page-url] — checks the deployed Apps Script from the app's real web page, in headless Microsoft Edge (Windows).
// Needs MM_URL (the /exec URL) and MM_TOKEN (APP_TOKEN) set in the terminal. Changes no data: the change check sends an action the script rejects.
const {spawn}=require('child_process'),fs=require('fs'),os=require('os'),path=require('path');
const url=process.env.MM_URL,token=process.env.MM_TOKEN,page=process.argv[2]||'https://adamamzar.github.io/personal-fin-track/';
if(!url||!token){console.error('Set MM_URL (your /exec URL) and MM_TOKEN (your APP_TOKEN) first. See README → Test.');process.exit(1)}
const edge=['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find(p=>fs.existsSync(p));
if(!edge){console.error('Microsoft Edge not found. This check runs on Windows with Edge installed.');process.exit(1)}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
  const profile=fs.mkdtempSync(path.join(os.tmpdir(),'mm-live-'));
  const browser=spawn(edge,['--headless=new','--disable-gpu','--no-first-run','--remote-debugging-port=9341',`--user-data-dir=${profile}`,'about:blank']);
  let target;for(let i=0;i<40&&!target;i++){await sleep(250);try{target=(await(await fetch('http://127.0.0.1:9341/json/list')).json()).find(t=>t.type==='page')}catch{}}
  if(!target)throw new Error('Edge did not start.');
  const ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise(r=>ws.onopen=r);
  let id=0;const waiting={};ws.onmessage=m=>{const d=JSON.parse(m.data);if(d.id&&waiting[d.id])waiting[d.id](d)};
  const send=(method,params={})=>new Promise(r=>{waiting[++id]=r;ws.send(JSON.stringify({id,method,params}))});
  // Requests are sent from the app's own page, so the browser applies the same cross-site rules it does for the real app.
  await send('Page.enable');await send('Page.navigate',{url:page});await sleep(3000);
  const run=async expr=>{const r=await send('Runtime.evaluate',{expression:`(async()=>{try{${expr}}catch(e){return 'FAILED: '+e.message}})()`,awaitPromise:true,returnByValue:true});return r.result.result.value};
  const u=JSON.stringify(url),t=JSON.stringify(token),q=s=>`${u}+(${u}.includes('?')?'&':'?')+'token='+encodeURIComponent(${s})`;
  const change=s=>`return await(await fetch(${u},{method:'POST',headers:{'Content-Type':'text/plain'},body:JSON.stringify({action:'checkOnly',token:${s}})})).json()`;
  // [label, expression, passes?]. The read check shows counts only, never your data.
  const checks=[
    ['Read with your token',`const d=await(await fetch(${q(t)})).json();return d.ok?{ok:true,accounts:d.accounts.length,categories:d.categories.length,entries:d.transactions.length,settings:d.settings}:d`,v=>v&&v.ok===true],
    ['Read with a wrong token is refused',`return await(await fetch(${q("'wrong-token'")})).json()`,v=>v&&v.ok===false],
    ['Read with no token is refused',`return await(await fetch(${q("''")})).json()`,v=>v&&v.ok===false],
    ['App can read a change reply',change(t),v=>v&&v.ok===false&&v.error==='Invalid request'],
    ['Change with a wrong token is refused',change("'wrong-token'"),v=>v&&v.ok===false&&v.error!=='Invalid request'],
  ];
  let failed=0;
  for(const [label,expr,pass] of checks){const v=await run(expr);const ok=pass(v);if(!ok)failed++;console.log(`${ok?'PASS':'FAIL'}  ${label.padEnd(38)} ${JSON.stringify(v)}`)}
  ws.close();browser.kill();try{fs.rmSync(profile,{recursive:true,force:true})}catch{}
  process.exit(failed?1:0);
})().catch(e=>{console.error(e.message||e);process.exit(1)});
