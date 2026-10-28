// Run: node backup-sheet.js [output-dir] — saves every tab of the Sheet as CSV, plus the raw reply, to a new folder. Read-only.
// Needs MM_URL (the /exec URL) and MM_TOKEN (APP_TOKEN) set in the terminal. The default folder sits next to the repo, never inside it,
// so financial data can't be committed by accident.
const fs=require('fs'),path=require('path');
const url=process.env.MM_URL,token=process.env.MM_TOKEN;
if(!url||!token){console.error('Set MM_URL (your /exec URL) and MM_TOKEN (your APP_TOKEN) first. See README → Back up.');process.exit(1)}
const now=new Date(),pad=n=>String(n).padStart(2,'0');
const stamp=`${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
const outDir=path.resolve(process.argv[2]||path.join(__dirname,'..',`my-money-backup-${stamp}`));
if(fs.existsSync(outDir)){console.error(`${outDir} already exists. Pick another folder so no backup is overwritten.`);process.exit(1)}

// Excel opens these correctly: a BOM for UTF-8 (emoji icons, "→") and Windows line endings.
const cell=v=>/[",\n\r]/.test(String(v??''))?`"${String(v).replaceAll('"','""')}"`:String(v??'');
const writeCsv=(file,rows)=>fs.writeFileSync(path.join(outDir,file),'﻿'+rows.map(r=>r.map(cell).join(',')).join('\r\n')+'\r\n');
const money=n=>(Math.round(n*100)/100).toFixed(2);

(async()=>{
  const res=await fetch(`${url}${url.includes('?')?'&':'?'}token=${encodeURIComponent(token)}`);
  const text=await res.text();
  let data;try{data=JSON.parse(text)}catch{throw new Error(`Not JSON (HTTP ${res.status}). Is the URL right and access set to Anyone?\n${text.slice(0,300)}`)}
  if(!data.ok)throw new Error(`The script refused: ${data.error||'unknown error'}`);
  const {accounts,categories,settings,transactions:txs}=data;
  fs.mkdirSync(outDir,{recursive:true});
  fs.writeFileSync(path.join(outDir,'sheet-response.json'),JSON.stringify(data,null,2));

  writeCsv('transactions.csv',[
    ['ID','Date','Type','Account','Destination Account','Category','Amount','Note','Created At'],
    ...txs.map(t=>[t.id,t.date,t.type,t.account,t.destination,t.category,t.amount,t.note,t.createdAt?new Date(t.createdAt).toISOString():''])]);

  // Same sum as the app: opening balance, plus income, minus spending, transfers moving money between accounts.
  const bal=Object.fromEntries(accounts.map(a=>[a.id,a.openingBalance]));
  const add=(id,n)=>{if(Object.prototype.hasOwnProperty.call(bal,id))bal[id]+=n};
  txs.forEach(t=>{if(t.type==='income')add(t.account,t.amount);else if(t.type==='expense')add(t.account,-t.amount);else{add(t.account,-t.amount);add(t.destination,t.amount)}});
  writeCsv('accounts.csv',[
    ['ID','Name','Icon','Opening Balance','Sort','Archived','Current Balance','Entries'],
    ...accounts.map(a=>[a.id,a.name,a.icon,money(a.openingBalance),a.sort,a.archived?'TRUE':'FALSE',money(bal[a.id]),txs.filter(t=>t.account===a.id||t.destination===a.id).length])]);

  writeCsv('categories.csv',[
    ['Name','Type','Sort','Archived','Entries'],
    ...categories.map(c=>[c.name,c.type,c.sort,c.archived?'TRUE':'FALSE',txs.filter(t=>t.type===c.type&&t.category===c.name).length])]);

  writeCsv('settings.csv',[['Key','Value'],...Object.entries(settings)]);

  console.log(`Saved to ${outDir}`);
  console.log(`  transactions.csv  ${txs.length} entries`);
  console.log(`  accounts.csv      ${accounts.length} accounts, total balance ${money(Object.values(bal).reduce((s,n)=>s+n,0))}`);
  console.log(`  categories.csv    ${categories.length} categories`);
  console.log(`  settings.csv      ${Object.keys(settings).length} settings`);
})().catch(e=>{console.error(e.message);process.exit(1)});
