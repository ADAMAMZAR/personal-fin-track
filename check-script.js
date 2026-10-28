// Run: node check-script.js — runs google-apps-script/Code.gs against an in-memory fake of SpreadsheetApp and friends. No network, no real Sheet.
const fs=require('fs'),vm=require('vm'),assert=require('assert');
class Sheet{constructor(name,rows=[],maxRows=1000){this.name=name;this.data=rows.map(r=>[...r]);this.maxRows=Math.max(maxRows,rows.length);this.frozen=0;this.checkboxes=[];this.rules=[]}
  getLastRow(){for(let i=this.data.length-1;i>=0;i--)if((this.data[i]||[]).some(v=>v!==''&&v!=null))return i+1;return 0}
  getMaxRows(){return this.maxRows} insertRowAfter(n){this.maxRows++;this.data.splice(n,0,[])}
  deleteRow(n){if(this.maxRows-this.frozen<=1)throw new Error("You can't delete all the rows on the sheet that are not frozen.");this.data.splice(n-1,1);this.maxRows--}
  appendRow(r){const at=this.getLastRow();this.data[at]=[...r];if(at+1>this.maxRows)this.maxRows=at+1}
  setFrozenRows(n){this.frozen=n} autoResizeColumns(){}
  getRange(r,c,nr=1,nc=1){const sh=this;return{
    getValues(){return Array.from({length:nr},(_,i)=>Array.from({length:nc},(_,j)=>{const v=(sh.data[r-1+i]||[])[c-1+j];return v===undefined?'':v}))},
    getDisplayValues(){return this.getValues().map(row=>row.map(v=>String(v)))},
    setValues(vals){vals.forEach((row,i)=>{const ri=r-1+i;sh.data[ri]=sh.data[ri]||[];row.forEach((v,j)=>sh.data[ri][c-1+j]=v)});if(r-1+vals.length>sh.maxRows)sh.maxRows=r-1+vals.length;return this},
    setValue(v){return this.setValues([[v]])},setFontWeight(){return this},insertCheckboxes(){sh.checkboxes.push([r,c,nr]);return this},
    sheetName:sh.name,r,c,nr,nc,
    setDataValidation(rule){sh.rules.push({r,c,nr,rule});return this},
    getDataValidation(){return sh.rules.findLast(x=>x.c===c&&r>=x.r&&r<x.r+x.nr)?.rule||null}}}}
// Records what each rule asks for; a criterion can be told to throw, to check a failure doesn't break requests.
let failOn='';
const newDataValidation=()=>{const rule={};const b={setAllowInvalid:v=>(rule.allowInvalid=v,b),setHelpText:v=>(rule.help=v,b),
  requireValueInList:(v,d)=>(rule.list=v,rule.dropdown=d,b),requireValueInRange:(v,d)=>(rule.range=`${v.sheetName}!${v.r},${v.c}x${v.nr}`,rule.dropdown=d,b),
  requireNumberGreaterThan:v=>(rule.gt=v,b),requireFormulaSatisfied:f=>{if(failOn&&f.includes(failOn))throw new Error('Invalid formula');rule.formula=f;return b},build:()=>rule};return b};
const code=fs.readFileSync(__dirname+'/google-apps-script/Code.gs','utf8');
// A fresh script and Sheet whose Transactions tab starts with these rows. get/post/quick send what the app and phone shortcuts send.
function run(transactions,{maxRows=1000,props={APP_TOKEN:'app-secret'}}={}){
  const tabs=new Map([['Transactions',new Sheet('Transactions',transactions,maxRows)]]);tabs.get('Transactions').frozen=1;
  const ss={getSheetByName:n=>tabs.get(n)||null,insertSheet:n=>{const s=new Sheet(n);tabs.set(n,s);return s},getSpreadsheetTimeZone:()=>'Asia/Kuala_Lumpur'};
  const ctx=vm.createContext({console:{error:()=>{}},SpreadsheetApp:{getActiveSpreadsheet:()=>ss,openById:()=>ss,newDataValidation},PropertiesService:{getScriptProperties:()=>({getProperty:k=>props[k]??null})},
    LockService:{getScriptLock:()=>({waitLock(){},releaseLock(){}})},ContentService:{createTextOutput:text=>({text,setMimeType(){return this}}),MimeType:{JSON:'json'}},
    Utilities:{formatDate:(d,tz)=>new Intl.DateTimeFormat('en-CA',{timeZone:tz}).format(d),getUuid:()=>crypto.randomUUID()}});
  vm.runInContext(code,ctx);
  const get=(token='app-secret')=>JSON.parse(ctx.doGet({parameter:{token}}).text),post=(b,token='app-secret')=>ctx.doPost({parameter:{},postData:{contents:JSON.stringify({token,...b})}}).text,quick=p=>ctx.doPost({parameter:{action:'quickAdd',token:'s3cret',...p}}).text;
  return {tabs,get,post,quick,rows:n=>tabs.get(n).data.slice(1).map(r=>[...r])};
}
const H=['ID','Date','Type','Account','Destination Account','Category','Amount','Note','Created At'];
const S=(id,acc,amt,at)=>[id,'2026-10-20','income',acc,'','Starting balance',amt,'Starting balance',at];
// 1. A Sheet in the old layout: starting balances mixed in with entries, one hand-added account and category.
const t=run([H,S('s1','maybank',1000,'2026-10-01T00:00:00.000Z'),['e1','2026-10-21','expense','tng','','Food & drinks',12.5,'Lunch','2026-10-21T04:00:00.000Z'],
  S('s2','maybank',1496.12,'2026-10-20T00:00:00.000Z'),S('s3','tng',2.82,'2026-10-20T00:00:00.000Z'),['e2','2026-10-22','expense','bigpay','','Parking',3,'','2026-10-22T04:00:00.000Z'],
  S('s4','cash',0,'2026-10-20T00:00:00.000Z'),['x1','2026-10-23','transfer','maybank','tng','Transfer',50,'Top up','2026-10-23T04:00:00.000Z']],{props:{APP_TOKEN:'app-secret',SHORTCUT_TOKEN:'s3cret'}});
// Without the right token nothing runs: no data back, no tabs created, nothing written.
const refused={ok:false,error:'Wrong or missing app token'};
assert.deepStrictEqual(t.get(''),refused);
assert.deepStrictEqual(t.get(null),refused);
assert.deepStrictEqual(t.get('s3cret'),refused); // the shortcut token can't read
assert.deepStrictEqual(JSON.parse(t.post({action:'appendTransactions',transactions:[{id:'evil',amount:1}]},'nope')),refused);
assert.ok(!t.tabs.has('Accounts')&&t.rows('Transactions').length===7);
// The first request moves starting balances into the new Accounts tab and adds the other tabs.
const g=t.get();
assert.deepStrictEqual(t.rows('Accounts'),[['cash','Cash','⌑',0,1,false],['tng','TNG eWallet','◉',2.82,2,false],['shopeepay','ShopeePay','S',0,3,false],['maybank','Maybank','M',1496.12,4,false],['wise','Wise','W',0,5,false],['bigpay','bigpay','',0,6,false]]);
assert.deepStrictEqual(t.rows('Transactions').map(r=>r[0]),['e1','e2','x1']); // starting balances gone, everything else kept in order
assert.deepStrictEqual(t.rows('Categories').filter(r=>r[0]==='Parking'),[['Parking','expense',11,false]]);
assert.strictEqual(t.rows('Categories').length,16);
assert.deepStrictEqual(t.rows('Settings').map(r=>r[0]+'='+r[1]),['currency=MYR','locale=en-MY','timezone=Asia/Kuala_Lumpur']);
assert.deepStrictEqual(t.tabs.get('Accounts').checkboxes,[[2,6,6]]);
assert.deepStrictEqual(Object.keys(g),['ok','accounts','categories','settings','transactions']);
assert.deepStrictEqual(g.accounts[1],{id:'tng',name:'TNG eWallet',icon:'◉',openingBalance:2.82,sort:2,archived:false});
assert.deepStrictEqual(g.settings,{currency:'MYR',locale:'en-MY',timezone:'Asia/Kuala_Lumpur'});
assert.strictEqual(g.transactions.length,3);
assert.deepStrictEqual(t.get(),g); // a second run changes nothing
// Dropdowns and checks in the Sheet, added once.
const rules=n=>JSON.parse(JSON.stringify(t.tabs.get(n).rules.map(x=>({col:x.c,from:x.r,...x.rule})))); // copied out of the sandbox's realm
const txRules=rules('Transactions');
assert.deepStrictEqual(txRules.map(x=>x.col),[4,5,6,7,3]); // Type (col 3) last: it marks the job done
assert.ok(txRules.every(x=>x.from===2&&x.allowInvalid===false&&x.help));
assert.strictEqual(t.tabs.get('Transactions').rules[0].nr,t.tabs.get('Transactions').maxRows-1); // down to the last row of the grid
assert.deepStrictEqual(txRules.find(x=>x.col===4).range,'Accounts!2,1x999');
assert.deepStrictEqual(txRules.find(x=>x.col===3).list,['expense','income','transfer']);
assert.match(txRules.find(x=>x.col===6).formula,/^=OR\(AND\(\$C2="transfer",F2="Transfer"\),SUMPRODUCT\(EXACT\(INDIRECT\("Categories!A2:A"\),F2\)/);
assert.strictEqual(txRules.find(x=>x.col===7).gt,0);
assert.deepStrictEqual(rules('Accounts').map(x=>x.col),[1,4]);
assert.deepStrictEqual(rules('Categories').map(x=>x.list||x.formula),['=COUNTIFS($A$2:$A,A2,$B$2:$B,B2)=1',['expense','income']]);
assert.deepStrictEqual(rules('Settings')[0].list,['currency','locale','timezone']);
t.get();t.post({action:'reorder',list:'accounts',keys:[]});
assert.strictEqual(rules('Transactions').length,5); // not added again
t.tabs.get('Transactions').rules=[];t.get(); // removed in the Sheet -> back on the next request
assert.strictEqual(rules('Transactions').length,5);
// A rule Sheets refuses must not break requests; it's retried next time.
failOn='SUMPRODUCT';const bad=run([]);
assert.strictEqual(bad.get().ok,true);
assert.strictEqual(bad.tabs.get('Transactions').rules.some(x=>x.c===3),false);
failOn='';bad.get();
assert.strictEqual(bad.tabs.get('Transactions').rules.some(x=>x.c===3),true);
// Opening balances from the current app, and from an app that hasn't updated yet.
assert.strictEqual(JSON.parse(t.post({action:'setOpeningBalances',balances:{tng:50,nope:3,cash:'x'}})).updated,1);
t.post({action:'appendTransactions',transactions:[{id:'old-start',type:'income',amount:7.5,account:'wise',destination:'',category:'Starting balance',note:'',date:'2026-10-28',createdAt:2},{id:'e1',type:'expense',amount:99,account:'tng',category:'Shopping',date:'2026-10-28',createdAt:3},{id:'e3',type:'expense',amount:4,account:'cash',destination:'',category:'Shopping',note:'',date:'2026-10-28',createdAt:4}]});
assert.deepStrictEqual(t.rows('Accounts').map(r=>r[3]),[0,50,0,1496.12,7.5,0]);
assert.deepStrictEqual(t.rows('Transactions').map(r=>r[0]),['e1','e2','x1','e3']); // duplicate e1 skipped, no Starting balance row
// Phone shortcuts check the tabs, not hardcoded lists.
t.tabs.get('Accounts').data[3][5]=true; // archive shopeepay
t.tabs.get('Categories').data.push(['Coffee','expense',12,'TRUE']); // archived, typed as text
assert.match(t.quick({type:'expense',amount:'RM12.50',account:'tng ewallet',category:'parking'}),/^Saved RM12\.50 · Parking · TNG eWallet$/);
assert.match(t.quick({type:'transfer',amount:'5',account:'bigpay',destination:'Cash'}),/^Saved RM5\.00 · bigpay → Cash$/);
assert.strictEqual(t.quick({type:'expense',amount:'1',account:'ShopeePay',category:'Shopping'}),'Error: unknown account "ShopeePay"');
assert.strictEqual(t.quick({type:'expense',amount:'1',account:'cash',category:'Coffee'}),'Error: unknown category "Coffee"');
assert.strictEqual(t.quick({type:'income',amount:'1',account:'cash',category:'Starting balance'}),'Error: unknown category "Starting balance"');
assert.strictEqual(t.quick({type:'expense',amount:'1',account:'cash',category:'Shopping',token:'wrong'}),'Error: wrong or missing token');
// Account changes from the Manage screen.
const P=b=>JSON.parse(t.post(b)),acc=()=>t.rows('Accounts').filter(r=>r.length);
assert.deepStrictEqual(P({action:'saveAccount',account:{name:"Touch 'n Go Card",icon:'💳🎉🎈',openingBalance:12.345}}),{ok:true,id:'touch-n-go-card'});
assert.deepStrictEqual(acc().at(-1),['touch-n-go-card',"Touch 'n Go Card",'💳🎉',12.35,7,false]);
assert.deepStrictEqual(t.tabs.get('Accounts').checkboxes.at(-1),[8,6,1]);
assert.deepStrictEqual(P({action:'saveAccount',account:{name:'Touch-n-Go card!'}}),{ok:true,id:'touch-n-go-card-2'}); // ID taken -> -2
assert.deepStrictEqual(P({action:'saveAccount',account:{name:'tng EWALLET'}}),{ok:false,error:'Another account is already called "tng EWALLET"'});
assert.deepStrictEqual(P({action:'saveAccount',account:{name:'TNG'}}),{ok:false,error:'Another account is already called "TNG"'}); // clashes with an ID
assert.deepStrictEqual(P({action:'saveAccount',account:{name:'  '}}),{ok:false,error:'Give the account a name'});
assert.deepStrictEqual(P({action:'saveAccount',account:{name:'X',openingBalance:'5'}}),{ok:false,error:'Opening balance must be a number'});
assert.deepStrictEqual(P({action:'saveAccount',account:{id:'nope',name:'X'}}),{ok:false,error:'No account with ID "nope"'});
assert.deepStrictEqual(P({action:'saveAccount',account:{id:'tng',name:'TNG eWallet',icon:'📱'}}),{ok:true,id:'tng'}); // keeping its own name is fine
assert.deepStrictEqual(acc()[1],['tng','TNG eWallet','📱',50,2,false]); // opening balance untouched when not sent
P({action:'saveAccount',account:{id:'tng',name:'Touch n Go',openingBalance:-20}});
assert.deepStrictEqual(acc()[1].slice(1,4),['Touch n Go','📱',-20]); // icon untouched when not sent
assert.deepStrictEqual(P({action:'archiveAccount',id:'bigpay'}),{ok:true});assert.strictEqual(acc()[5][5],true);
P({action:'archiveAccount',id:'bigpay',archived:false});assert.strictEqual(acc()[5][5],false);
assert.deepStrictEqual(P({action:'deleteAccount',id:'cash'}),{ok:false,error:'Cash is used by 2 entries. Archive it instead'});
assert.deepStrictEqual(P({action:'deleteAccount',id:'touch-n-go-card-2'}),{ok:true});
assert.deepStrictEqual(acc().map(r=>r[0]),['cash','tng','shopeepay','maybank','wise','bigpay','touch-n-go-card']);
assert.deepStrictEqual(JSON.parse(t.post({action:'deleteAccount',id:'wise'},'bad')).ok,false); // still needs the token
// Category changes from the Manage screen.
const cat=()=>t.rows('Categories').filter(r=>r.length);
assert.deepStrictEqual(P({action:'saveCategory',category:{name:'Groceries',type:'expense'}}),{ok:true});
assert.deepStrictEqual(cat().at(-1),['Groceries','expense',13,false]);
assert.deepStrictEqual(P({action:'saveCategory',category:{name:'groceries',type:'expense'}}),{ok:false,error:'There is already a category called "groceries"'});
assert.deepStrictEqual(P({action:'saveCategory',category:{name:'Groceries',type:'income'}}),{ok:true}); // same name, other type is fine
assert.deepStrictEqual(P({action:'saveCategory',category:{name:'TRANSFER',type:'expense'}}),{ok:false,error:'"TRANSFER" is reserved'});
assert.deepStrictEqual(P({action:'saveCategory',category:{name:'X',type:'spend'}}),{ok:false,error:'Type must be expense or income'});
assert.deepStrictEqual(P({action:'saveCategory',category:{name:'Food',type:'expense',previousName:'Food & drinks'}}),{ok:true,renamed:1});
assert.deepStrictEqual(t.rows('Transactions').filter(r=>r[0]==='e1').map(r=>r[5]),['Food']);
assert.ok(cat().some(r=>r[0]==='Food'&&r[1]==='expense')&&!cat().some(r=>r[0]==='Food & drinks'));
assert.deepStrictEqual(P({action:'saveCategory',category:{name:'Shopping',type:'expense',previousName:'Food'}}),{ok:false,error:'There is already a category called "Shopping"'});
assert.deepStrictEqual(P({action:'saveCategory',category:{name:'Y',type:'expense',previousName:'Nope'}}),{ok:false,error:'No category called "Nope"'});
assert.deepStrictEqual(P({action:'deleteCategory',name:'Parking',type:'expense'}),{ok:false,error:'"Parking" is used by 2 entries. Archive it instead'});
assert.deepStrictEqual(P({action:'archiveCategory',name:'Parking',type:'expense'}),{ok:true});
assert.deepStrictEqual(P({action:'deleteCategory',name:'Groceries',type:'income'}),{ok:true});
assert.ok(cat().some(r=>r[0]==='Groceries'&&r[1]==='expense')&&!cat().some(r=>r[0]==='Groceries'&&r[1]==='income'));
assert.match(t.quick({type:'expense',amount:'1',account:'cash',category:'Parking'}),/^Error: unknown category/); // archived from the app -> shortcuts refuse it
// The move up / down buttons.
assert.deepStrictEqual(P({action:'reorder',list:'accounts',keys:['wise','cash']}),{ok:true});
assert.deepStrictEqual(acc().map(r=>r[0]+':'+r[4]),['cash:2','tng:2','shopeepay:3','maybank:4','wise:1','bigpay:6','touch-n-go-card:7']);
assert.deepStrictEqual(t.get().accounts.find(a=>a.id==='wise').sort,1);
P({action:'reorder',list:'income',keys:['Groceries','Foodpanda','Salary']}); // 'Groceries' is only an expense now -> untouched
assert.deepStrictEqual(cat().filter(r=>['Salary','Foodpanda','Groceries'].includes(r[0])).map(r=>r.slice(0,3).join(':')),['Salary:income:3','Foodpanda:income:2','Groceries:expense:13']);
assert.deepStrictEqual(P({action:'reorder',list:'nope',keys:[]}),{ok:false,error:'Unknown list'});
// The last active account, or the last active category of a type, can't be archived or deleted.
const k=run([]);k.get();const K=b=>JSON.parse(k.post(b));
['cash','tng','shopeepay','maybank'].forEach(id=>assert.ok(K({action:'archiveAccount',id}).ok));
assert.deepStrictEqual(K({action:'archiveAccount',id:'wise'}),{ok:false,error:'Keep at least one active account'});
assert.deepStrictEqual(K({action:'deleteAccount',id:'wise'}),{ok:false,error:'Keep at least one active account'});
assert.ok(K({action:'deleteAccount',id:'cash'}).ok); // an archived, unused account can go
['Salary','Foodpanda','Other income','Refund / reimbursement'].forEach(name=>assert.ok(K({action:'deleteCategory',name,type:'income'}).ok));
assert.deepStrictEqual(K({action:'deleteCategory',name:'Gift received',type:'income'}),{ok:false,error:'Keep at least one active income category'});
assert.deepStrictEqual(K({action:'archiveCategory',name:'Gift received',type:'income'}),{ok:false,error:'Keep at least one active income category'});
assert.ok(K({action:'archiveCategory',name:'Other',type:'expense'}).ok); // expense has others left
// 2. A Sheet holding only starting balances, with no spare rows: moving them must not delete every row.
const u=run([H,S('a','cash',5,''),S('b','tng',6,'')],{maxRows:3});
u.get();
assert.deepStrictEqual(u.rows('Transactions').filter(r=>r.length),[]);
assert.deepStrictEqual(u.rows('Accounts').slice(0,2).map(r=>r[3]),[5,6]);
// 3. APP_TOKEN never set: everything from the app is refused, even an empty token.
const w=run([H],{props:{}});
assert.deepStrictEqual(w.get(''),{ok:false,error:'APP_TOKEN is not set in Script properties'});
assert.deepStrictEqual(w.get(null),{ok:false,error:'APP_TOKEN is not set in Script properties'});
// 4. A brand-new, empty Sheet.
const v=run([]);
v.get();
assert.deepStrictEqual(v.tabs.get('Transactions').data[0],H);
assert.strictEqual(v.get().accounts.length,5);
console.log('Code.gs check ok');
