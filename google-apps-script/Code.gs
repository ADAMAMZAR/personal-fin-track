/**
 * My Money Google Sheets bridge.
 * This copy is preconfigured for the linked My Money Google Sheet.
 * Paste it into the Apps Script project, save, then deploy a new Web-app version.
 *
 * For a personal tracker, deploy it to run as you. Do not use a broadly public
 * deployment for sensitive financial data without adding your own authentication.
 *
 * Phone shortcuts (quickAdd) need a Script property named SHORTCUT_TOKEN:
 * Project Settings > Script properties > Add property.
 */
const SHEET_ID = '1jxNJVVSd6oNRGPzPXhQNTc5L7xV2cSUsIvWTRZGqVuI';
const HEADERS = ['ID','Date','Type','Account','Destination Account','Category','Amount','Note','Created At'];
// Keep these in step with ACCOUNTS / EXPENSES / INCOMES in dist/app.js.
const ACCOUNTS = {cash:'Cash', tng:'TNG eWallet', shopeepay:'ShopeePay', maybank:'Maybank', wise:'Wise'};
const EXPENSES = ['Food & drinks','Fuel & transport','Mobile & internet','Bills & subscriptions','Family & giving','Social & lifestyle','Shopping','Healthcare','Education','Other'];
const INCOMES = ['Salary','Foodpanda','Other income','Refund / reimbursement','Gift received'];

function doPost(e) {
  // Shortcuts send form fields (e.parameter); the app sends a JSON body.
  const body = e.parameter && e.parameter.action ? e.parameter : JSON.parse(e.postData.contents || '{}');
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    if (body.action === 'quickAdd') return ContentService.createTextOutput(quickAdd_(body));
    if (body.action !== 'appendTransactions' || !Array.isArray(body.transactions)) return json_({ok:false, error:'Invalid request'});
    const sheet = transactionsSheet_();
    const lastRow = sheet.getLastRow();
    const known = lastRow > 1 ? new Set(sheet.getRange(2,1,lastRow-1,1).getDisplayValues().flat().filter(String)) : new Set();
    const rows = body.transactions.filter(t => t && t.id && !known.has(t.id)).map(t => [t.id,t.date,t.type,t.account,t.destination||'',t.category,Number(t.amount),t.note||'',new Date(t.createdAt || Date.now()).toISOString()]);
    if (rows.length) sheet.getRange(sheet.getLastRow()+1,1,rows.length,HEADERS.length).setValues(rows);
    return json_({ok:true, added:rows.length});
  } finally {
    lock.releaseLock();
  }
}

// One entry from a phone shortcut. Returns a short line the shortcut shows as its notification.
function quickAdd_(p) {
  const token = PropertiesService.getScriptProperties().getProperty('SHORTCUT_TOKEN');
  if (!token || p.token !== token) return 'Error: wrong or missing token';
  const type = String(p.type || '').trim().toLowerCase();
  if (!['income','expense','transfer'].includes(type)) return 'Error: type must be income, expense or transfer';
  const amount = Math.round(Number(String(p.amount || '').replace(/[^\d.]/g, '')) * 100) / 100;
  if (!(amount > 0)) return 'Error: amount must be more than 0';
  const account = accountId_(p.account);
  if (!account) return 'Error: unknown account "' + (p.account || '') + '"';
  let destination = '', category = 'Transfer';
  if (type === 'transfer') {
    destination = accountId_(p.destination);
    if (!destination || destination === account) return 'Error: choose a different destination account';
  } else {
    const wanted = String(p.category || '').trim().toLowerCase();
    category = (type === 'income' ? INCOMES : EXPENSES).find(c => c.toLowerCase() === wanted);
    if (!category) return 'Error: unknown category "' + (p.category || '') + '"';
  }
  const date = /^\d{4}-\d{2}-\d{2}$/.test(p.date || '') ? p.date : Utilities.formatDate(new Date(), 'Asia/Kuala_Lumpur', 'yyyy-MM-dd');
  const note = String(p.note || '').trim();
  transactionsSheet_().appendRow([Utilities.getUuid(), date, type, account, destination, category, amount, note, new Date().toISOString()]);
  const where = type === 'transfer' ? ACCOUNTS[account] + ' → ' + ACCOUNTS[destination] : category + ' · ' + ACCOUNTS[account];
  return 'Saved RM' + amount.toFixed(2) + ' · ' + where;
}

// Accepts an account id ("tng") or its name ("TNG eWallet"), any case.
function accountId_(value) {
  const v = String(value || '').trim().toLowerCase();
  return Object.keys(ACCOUNTS).find(id => id === v || ACCOUNTS[id].toLowerCase() === v) || '';
}

function doGet() {
  const sheet = transactionsSheet_();
  const tz = sheet.getParent().getSpreadsheetTimeZone();
  const rows = sheet.getLastRow() > 1 ? sheet.getRange(2,1,sheet.getLastRow()-1,HEADERS.length).getValues() : [];
  const transactions = rows.filter(r => r[0]).map(r => ({id:String(r[0]), date:r[1] instanceof Date ? Utilities.formatDate(r[1],tz,'yyyy-MM-dd') : String(r[1]), type:r[2], account:r[3], destination:r[4]||'', category:r[5], amount:Number(r[6]), note:r[7]||'', createdAt:new Date(r[8]).getTime()||0}));
  return json_({ok:true, transactions});
}

function transactionsSheet_() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sh = ss.getSheetByName('Transactions') || ss.insertSheet('Transactions');
  if (sh.getLastRow() === 0) { sh.appendRow(HEADERS); sh.setFrozenRows(1); sh.getRange('A1:I1').setFontWeight('bold'); sh.autoResizeColumns(1,9); }
  return sh;
}
function json_(value) { return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON); }
