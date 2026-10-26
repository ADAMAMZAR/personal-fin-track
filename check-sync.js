// Run: node check-sync.js — loads dist/app.js with a stub DOM and a fake Sheet, checks pull() merging.
const fs=require('fs'),vm=require('vm'),assert=require('assert');
const el=()=>new Proxy({classList:{add(){},remove(){},toggle(){}},addEventListener(){},showModal(){},close(){},focus(){}},{get:(o,k)=>k in o?o[k]:''});
const tx=(id,account,amount,synced)=>({id,type:'expense',amount,account,destination:'',category:'Shopping',note:'',date:'2026-10-26',createdAt:5,synced});
const start=(id,account,amount,createdAt)=>({id,type:'income',amount,account,destination:'',category:'Starting balance',note:'Starting balance',date:'2026-10-26',createdAt});
const store={'my-money-v1':JSON.stringify({onboarded:true,settings:{scriptUrl:'https://fake/exec'},transactions:[
  {...start('old-mb','maybank',1000,1),synced:true},
  tx('deleted-in-sheet','maybank',50,true), // synced, then removed from the Sheet -> dropped
  tx('not-synced-yet','maybank',10,false),  // waiting for Sync -> kept
  tx('edited-in-sheet','tng',5,true)]})};    // Sheet says 1 -> Sheet wins
const sheet=[start('old-mb','maybank',1000,1),start('legacy-mb','maybank',500,0),start('n-mb','maybank',1496.12,9),start('n-tng','tng',2.82,9),start('n-wise','wise',12.07,9),start('n-spp','shopeepay',0.39,9),start('n-cash','cash',0,9),
  tx('edited-in-sheet','tng',1)];
const ctx=vm.createContext({document:{querySelector:el,querySelectorAll:()=>[]},localStorage:{getItem:k=>store[k]??null,setItem:(k,v)=>store[k]=v},
  navigator:{},crypto,Intl,setTimeout,confirm:()=>false,fetch:async()=>({json:async()=>({ok:true,transactions:sheet})})});
vm.runInContext(fs.readFileSync(__dirname+'/dist/app.js','utf8'),ctx);
(async()=>{
  await ctx.pull();await ctx.pull(); // second pull must change nothing
  const b=ctx.balances(),r=n=>Math.round(n*100)/100;
  assert.deepStrictEqual({cash:r(b.cash),tng:r(b.tng),shopeepay:r(b.shopeepay),maybank:r(b.maybank),wise:r(b.wise)},{cash:0,tng:1.82,shopeepay:0.39,maybank:1486.12,wise:12.07});
  const saved=JSON.parse(store['my-money-v1']).transactions;
  assert.strictEqual(saved.length,7);
  assert.strictEqual(saved.find(t=>t.id==='not-synced-yet').synced,false);
  console.log('sync check ok');
})();
