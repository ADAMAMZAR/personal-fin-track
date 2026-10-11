/**
 * My Money Google Sheets bridge.
 * 1. Create a Google Sheet and copy its ID from the URL.
 * 2. Apps Script > Project Settings > Script properties: add SHEET_ID.
 * 3. Paste this file into Apps Script, deploy as a Web app, and put its /exec URL in My Money settings.
 *
 * For a personal tracker, deploy it to run as you. Do not use a broadly public
 * deployment for sensitive financial data without adding your own authentication.
 */
const HEADERS = ['ID','Date','Type','Account','Destination Account','Category','Amount','Note','Created At'];

function doPost(e) {
  const body = JSON.parse(e.postData.contents || '{}');
  if (body.action !== 'appendTransactions' || !Array.isArray(body.transactions)) return json_({ok:false, error:'Invalid request'});
  const sheet = transactionsSheet_();
  const known = new Set(sheet.getRange(2,1,Math.max(0,sheet.getLastRow()-1),1).getDisplayValues().flat().filter(String));
  const rows = body.transactions.filter(t => t && t.id && !known.has(t.id)).map(t => [t.id,t.date,t.type,t.account,t.destination||'',t.category,Number(t.amount),t.note||'',new Date(t.createdAt || Date.now()).toISOString()]);
  if (rows.length) sheet.getRange(sheet.getLastRow()+1,1,rows.length,HEADERS.length).setValues(rows);
  return json_({ok:true, added:rows.length});
}

function transactionsSheet_() {
  const ss = SpreadsheetApp.openById(PropertiesService.getScriptProperties().getProperty('SHEET_ID'));
  const sh = ss.getSheetByName('Transactions') || ss.insertSheet('Transactions');
  if (sh.getLastRow() === 0) { sh.appendRow(HEADERS); sh.setFrozenRows(1); sh.getRange('A1:I1').setFontWeight('bold'); sh.autoResizeColumns(1,9); }
  return sh;
}
function json_(value) { return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON); }
