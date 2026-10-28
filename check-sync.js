// Run: node check-sync.js — loads dist/app.js with a stub DOM and a fake Sheet, checks the upgrade from 'Starting balance' rows, what gets sent, and how pull() merges.
const fs=require('fs'),vm=require('vm'),assert=require('assert');
const el=()=>new Proxy({classList:{add(){},remove(){},toggle(){}},addEventListener(){},showModal(){},close(){},focus(){}},{get:(o,k)=>k in o?o[k]:''});
const tx=(id,account,amount,synced,more)=>({id,type:'expense',amount,account,destination:'',category:'Shopping',note:'',date:'2026-10-26',createdAt:5,synced,...more});
const start=(id,account,amount,createdAt,synced)=>({id,type:'income',amount,account,destination:'',category:'Starting balance',note:'Starting balance',date:'2026-10-26',createdAt,synced});
const acct=(id,openingBalance,archived=false)=>({id,name:id.toUpperCase(),icon:'',openingBalance,sort:1,archived});
const r=n=>Math.round(n*100)/100,round=b=>Object.fromEntries(Object.entries(b).map(([k,v])=>[k,r(v)]));
// Runs app.js on a saved localStorage state against a fake Sheet; the Sheet ignores POSTs, as if they were lost.
function load(saved,sheet){
  const store={'my-money-v1':JSON.stringify(saved)},posts=[];
  const ctx=vm.createContext({document:{querySelector:el,querySelectorAll:()=>[],addEventListener(){}},window:{addEventListener(){}},location:{search:'',pathname:'/'},history:{replaceState(){}},localStorage:{getItem:k=>store[k]??null,setItem:(k,v)=>store[k]=v},
    navigator:{},crypto,Intl,URLSearchParams,setTimeout,confirm:()=>false,fetch:async(_,o)=>{if(o&&o.method==='POST')posts.push(JSON.parse(o.body));return {json:async()=>JSON.parse(JSON.stringify(sheet))}}});
  vm.runInContext(fs.readFileSync(__dirname+'/dist/app.js','utf8'),ctx);
  return {ctx,posts,saved:()=>JSON.parse(store['my-money-v1'])};
}
(async()=>{
  // 1. A device upgrading from 'Starting balance' rows, syncing with an upgraded Sheet.
  const sheet={ok:true,
    accounts:[acct('cash',0),acct('tng',0),acct('maybank',1496.12),acct('wise',12.07,true),acct('bigpay',20)],
    categories:[{name:'Shopping',type:'expense',sort:1,archived:false}],
    settings:{currency:'MYR',locale:'en-MY',timezone:'Mars/Olympus'},
    transactions:[tx('edited-in-sheet','tng',1),tx('in-removed-account','gone',7),tx('t1','maybank',5,undefined,{type:'transfer',destination:'bigpay',category:'Transfer'})]};
  const a=load({onboarded:true,settings:{scriptUrl:'https://fake/exec'},transactions:[
    start('old-mb','maybank',1000,1,true),    // already in the Sheet -> replaced by the Sheet's Accounts tab
    start('new-tng','tng',2.82,9,false),      // set offline before upgrading -> sent as an opening balance
    tx('deleted-in-sheet','maybank',50,true), // synced, then removed from the Sheet -> dropped
    tx('not-synced-yet','maybank',10,false),  // waiting to upload -> kept
    tx('edited-in-sheet','tng',5,true)]},sheet); // Sheet says 1 -> Sheet wins
  await a.ctx.syncNow(); // waits for the sync the app starts on open, then runs another
  const sent=a.posts.filter(p=>p.action==='appendTransactions'),opening=a.posts.filter(p=>p.action==='setOpeningBalances');
  assert.ok(sent.length&&sent.every(p=>p.transactions.map(t=>t.id).join()==='not-synced-yet')); // only unsynced entries, never 'Starting balance' rows
  assert.ok(opening.length&&opening.every(p=>JSON.stringify(p.balances)==='{"tng":2.82}'));
  assert.strictEqual(a.posts.length,sent.length+opening.length);
  // tng shows its pending 2.82 until the Sheet has it, archived wise still counts, and the removed account's entry is skipped instead of making NaN.
  assert.deepStrictEqual(round(a.ctx.balances()),{cash:0,tng:1.82,maybank:1481.12,wise:12.07,bigpay:25});
  const s=a.saved();
  assert.deepStrictEqual(s.transactions.map(t=>t.id).sort(),['edited-in-sheet','in-removed-account','not-synced-yet','t1']);
  assert.strictEqual(s.transactions.find(t=>t.id==='not-synced-yet').synced,false);
  assert.deepStrictEqual(s.pendingOpening,{tng:2.82});
  assert.deepStrictEqual(s.accounts.map(x=>x.id),['cash','tng','maybank','wise','bigpay']);
  assert.strictEqual(s.prefs.timezone,'Asia/Kuala_Lumpur'); // an invalid Settings value falls back to the defaults
  sheet.accounts[1].openingBalance=2.82; // the Sheet now has it -> no longer pending
  await a.ctx.pull();const once=JSON.stringify(a.saved());
  assert.deepStrictEqual(a.saved().pendingOpening,{});
  await a.ctx.pull();assert.strictEqual(JSON.stringify(a.saved()),once); // a second pull changes nothing

  // 2. The app updated before the script: the old script has no Accounts tab, so opening balances come from its 'Starting balance' rows.
  const b=load({onboarded:true,settings:{scriptUrl:'https://fake/exec'},transactions:[]},
    {ok:true,transactions:[start('old-mb','maybank',1000,1),start('n-mb','maybank',1496.12,9),start('n-tng','tng',2.82,9),tx('e1','tng',1)]});
  await b.ctx.syncNow();
  assert.deepStrictEqual(round(b.ctx.balances()),{cash:0,tng:1.82,shopeepay:0,maybank:1496.12,wise:0});
  assert.deepStrictEqual(b.saved().transactions.map(t=>t.id),['e1']);
  assert.deepStrictEqual(b.posts,[]); // nothing pending, so nothing sent
  console.log('sync check ok');
})().catch(e=>{console.error(e);process.exit(1)});
