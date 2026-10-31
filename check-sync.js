// Run: node check-sync.js — loads dist/app.js with a stub DOM and a fake Sheet, checks the upgrade from 'Starting balance' rows, what gets sent, how pull() merges, and how History groups by day.
const fs=require('fs'),vm=require('vm'),assert=require('assert');
const el=()=>new Proxy({classList:{add(){},remove(){},toggle(){}},addEventListener(){},showModal(){},close(){},focus(){}},{get:(o,k)=>k in o?o[k]:''});
const tx=(id,account,amount,synced,more)=>({id,type:'expense',amount,account,destination:'',category:'Shopping',note:'',date:'2026-10-26',createdAt:5,synced,...more});
const start=(id,account,amount,createdAt,synced)=>({id,type:'income',amount,account,destination:'',category:'Starting balance',note:'Starting balance',date:'2026-10-26',createdAt,synced});
const acct=(id,openingBalance,archived=false)=>({id,name:id.toUpperCase(),icon:'',openingBalance,sort:1,archived});
const r=n=>Math.round(n*100)/100,round=b=>Object.fromEntries(Object.entries(b).map(([k,v])=>[k,r(v)]));
const TOKEN='t0k&n',settings={scriptUrl:'https://fake/exec',appToken:TOKEN};
// Runs app.js on a saved localStorage state against a fake Sheet. The Sheet ignores POSTs, as if they were lost, and refuses a GET without the app token.
// A POST without no-cors (an account or category change) gets reply(body) back; reply can throw to act like an unreadable response.
function load(saved,sheet,reply=()=>({ok:true}),navigator={}){
  const store={'my-money-v1':JSON.stringify(saved)},posts=[],gets=[];
  const ctx=vm.createContext({document:{querySelector:el,querySelectorAll:()=>[],addEventListener(){}},window:{addEventListener(){}},location:{search:'',pathname:'/'},history:{replaceState(){}},localStorage:{getItem:k=>store[k]??null,setItem:(k,v)=>store[k]=v},
    navigator,crypto,Intl,URLSearchParams,setTimeout,confirm:()=>false,fetch:async(url,o)=>{if(o&&o.method==='POST'){const body=JSON.parse(o.body);posts.push(body);if(o.mode!=='no-cors')return {json:async()=>reply(body)}}else gets.push(url);
      const ok=new URL(url).searchParams.get('token')===TOKEN;return {json:async()=>ok?JSON.parse(JSON.stringify(sheet)):{ok:false,error:'Wrong or missing app token'}}}});
  vm.runInContext(fs.readFileSync(__dirname+'/dist/app.js','utf8'),ctx);
  return {ctx,posts,gets,saved:()=>JSON.parse(store['my-money-v1'])};
}
(async()=>{
  // 1. A device upgrading from 'Starting balance' rows, syncing with an upgraded Sheet.
  const sheet={ok:true,
    accounts:[acct('cash',0),acct('tng',0),acct('maybank',1496.12),acct('wise',12.07,true),acct('bigpay',20)],
    categories:[{name:'Shopping',type:'expense',sort:1,archived:false}],
    settings:{currency:'MYR',locale:'en-MY',timezone:'Mars/Olympus'},
    transactions:[tx('edited-in-sheet','tng',1),tx('in-removed-account','gone',7),tx('t1','maybank',5,undefined,{type:'transfer',destination:'bigpay',category:'Transfer'})]};
  const a=load({onboarded:true,settings,transactions:[
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
  assert.ok(a.posts.every(p=>p.token===TOKEN)&&a.gets.every(u=>u==='https://fake/exec?token=t0k%26n')); // token on every request, safely encoded
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
  const b=load({onboarded:true,settings,transactions:[]},
    {ok:true,transactions:[start('old-mb','maybank',1000,1),start('n-mb','maybank',1496.12,9),start('n-tng','tng',2.82,9),tx('e1','tng',1)]});
  await b.ctx.syncNow();
  assert.deepStrictEqual(round(b.ctx.balances()),{cash:0,tng:1.82,shopeepay:0,maybank:1496.12,wise:0});
  assert.deepStrictEqual(b.saved().transactions.map(t=>t.id),['e1']);
  assert.deepStrictEqual(b.posts,[]); // nothing pending, so nothing sent

  // 3. A wrong token: the Sheet refuses, and nothing on the device is lost or marked as uploaded.
  const before={onboarded:true,settings:{...settings,appToken:'wrong'},transactions:[tx('kept','cash',3,true),tx('waiting','cash',4,false)]};
  const c=load(before,sheet);
  await c.ctx.syncNow();
  assert.ok(c.posts.length&&c.posts.every(p=>p.token==='wrong'));
  assert.deepStrictEqual(c.saved().transactions,before.transactions);

  // 4. Account and category changes: the script's reply comes back to the caller, then the app reloads from the Sheet.
  const d=load({onboarded:true,settings,transactions:[]},sheet,body=>body.action==='deleteAccount'?{ok:false,error:'Cash is used by 2 entries. Archive it instead'}:{ok:true,id:'touch-n-go-card'});
  await d.ctx.syncNow();const getsBefore=d.gets.length;
  const added=await d.ctx.change({action:'saveAccount',account:{name:"Touch 'n Go Card"}});
  assert.deepStrictEqual({...added},{ok:true,id:'touch-n-go-card'});
  assert.strictEqual(d.gets.length,getsBefore+1); // reloaded after the change
  assert.deepStrictEqual({...d.posts.at(-1)},{action:'saveAccount',account:{name:"Touch 'n Go Card"},token:TOKEN});
  assert.deepStrictEqual({...await d.ctx.change({action:'deleteAccount',id:'cash'})},{ok:false,error:'Cash is used by 2 entries. Archive it instead'});
  // An unreadable reply or no connection: a clear error, and offline nothing is sent at all.
  const e=load({onboarded:true,settings,transactions:[]},sheet,()=>{throw new SyntaxError('Unexpected token <')});
  assert.match((await e.ctx.change({action:'archiveAccount',id:'tng'})).error,/^No reply from Google Sheets/);
  const f=load({onboarded:true,settings,transactions:[]},sheet,undefined,{onLine:false});
  assert.match((await f.ctx.change({action:'archiveAccount',id:'tng'})).error,/offline/);
  assert.deepStrictEqual(f.posts,[]);

  // 5. No Sheet connected: the same changes and rules apply on the device, and nothing is sent.
  const g=load({onboarded:true,settings:{},transactions:[tx('lunch','cash',8,false,{category:'Food & drinks'})]},sheet);
  const L=async b=>({...await g.ctx.change(b)});
  assert.deepStrictEqual(await L({action:'saveAccount',account:{name:"Touch 'n Go Card",icon:'💳',openingBalance:5}}),{ok:true,id:'touch-n-go-card'});
  assert.deepStrictEqual(await L({action:'saveAccount',account:{name:'touch-n-go-card'}}),{ok:false,error:'Another account is already called "touch-n-go-card"'});
  assert.deepStrictEqual(await L({action:'deleteAccount',id:'cash'}),{ok:false,error:'Cash is used by 1 entry. Archive it instead'});
  assert.deepStrictEqual(await L({action:'saveCategory',category:{name:'Makan',type:'expense',previousName:'Food & drinks'}}),{ok:true,renamed:1});
  assert.deepStrictEqual(await L({action:'deleteCategory',name:'Makan',type:'expense'}),{ok:false,error:'"Makan" is used by 1 entry. Archive it instead'});
  assert.deepStrictEqual(await L({action:'saveCategory',category:{name:'transfer',type:'income'}}),{ok:false,error:'"transfer" is reserved'});
  assert.deepStrictEqual(await L({action:'reorder',list:'accounts',keys:['touch-n-go-card','cash']}),{ok:true});
  for(const id of ['tng','shopeepay','maybank','wise','cash'])assert.ok((await L({action:'archiveAccount',id})).ok);
  assert.deepStrictEqual(await L({action:'archiveAccount',id:'touch-n-go-card'}),{ok:false,error:'Keep at least one active account'});
  const local=g.saved();
  assert.deepStrictEqual(local.transactions.map(t=>t.category),['Makan']);
  assert.deepStrictEqual(local.accounts.filter(x=>!x.archived).map(x=>[x.id,x.icon,x.openingBalance,x.sort]),[['touch-n-go-card','💳',5,1]]);
  assert.strictEqual(round(g.ctx.balances()).cash,-8); // archived accounts still count
  assert.deepStrictEqual(g.posts.concat(g.gets),[]);

  // 6. History: newest day first, the most recently added entry first within a day, one header per date.
  const h=load({onboarded:true,settings:{},transactions:[]},sheet);
  const days=h.ctx.groupByDay([tx('a','cash',1,true,{date:'2026-10-30',createdAt:1}),tx('b','cash',1,true,{date:'2026-10-31',createdAt:1}),tx('c','cash',1,true,{date:'2026-10-30',createdAt:2}),tx('d','cash',1,true,{date:'2025-01-05'})]);
  assert.strictEqual(JSON.stringify(days.map(([d,l])=>[d,l.map(t=>t.id)])),JSON.stringify([['2026-10-31',['b']],['2026-10-30',['c','a']],['2025-01-05',['d']]]));
  assert.strictEqual(vm.runInContext('dayLabel(today())',h.ctx),'Today');
  assert.match(h.ctx.dayLabel('2025-01-05'),/5.*Jan.*2025/);
  assert.strictEqual(h.ctx.dayLabel('soon'),'soon'); // a hand-typed Sheet value shows as-is instead of throwing
  // A row starts collapsed with just the category and amount; the note, account and date sit in the expandable part.
  const html=h.ctx.row(tx('x','cash',1,true,{note:'Nasi <lemak>',date:'2025-01-05'})),fold=html.indexOf('</summary>');
  assert.ok(html.startsWith('<details class="transaction-row">')&&!html.includes(' open'));
  assert.ok(html.indexOf('Shopping')<fold&&html.indexOf('Nasi &#60;lemak&#62;')>fold&&html.indexOf('Cash')>fold);
  console.log('sync check ok');
})().catch(e=>{console.error(e);process.exit(1)});
