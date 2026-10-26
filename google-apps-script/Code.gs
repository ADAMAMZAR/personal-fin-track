/**
 * My Money Google Sheets bridge.
 * This copy is preconfigured for the linked My Money Google Sheet.
 * Paste it into the Apps Script project, save, then deploy a new Web-app version.
 *
 * For a personal tracker, deploy it to run as you. Do not use a broadly public
 * deployment for sensitive financial data without adding your own authentication.
 */
const SHEET_ID = '1jxNJVVSd6oNRGPzPXhQNTc5L7xV2cSUsIvWTRZGqVuI';
const HEADERS = ['ID','Date','Type','Account','Destination Account','Category','Amount','Note','Created At'];

function doPost(e) {
  const body = JSON.parse(e.postData.contents || '{}');
  if (body.action !== 'appendTransactions' || !Array.isArray(body.transactions)) return json_({ok:false, error:'Invalid request'});
  const sheet = transactionsSheet_();
  const lastRow = sheet.getLastRow();
  const known = lastRow > 1 ? new Set(sheet.getRange(2,1,lastRow-1,1).getDisplayValues().flat().filter(String)) : new Set();
  const rows = body.transactions.filter(t => t && t.id && !known.has(t.id)).map(t => [t.id,t.date,t.type,t.account,t.destination||'',t.category,Number(t.amount),t.note||'',new Date(t.createdAt || Date.now()).toISOString()]);
  if (rows.length) sheet.getRange(sheet.getLastRow()+1,1,rows.length,HEADERS.length).setValues(rows);
  return json_({ok:true, added:rows.length});
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
