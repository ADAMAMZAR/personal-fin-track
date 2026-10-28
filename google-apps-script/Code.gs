/**
 * My Money Google Sheets bridge.
 * Paste it into the Apps Script project, save, then deploy a new Web-app version.
 *
 * It uses the Sheet it is bound to (open it from the Sheet: Extensions > Apps Script).
 * A standalone script needs a Script property named SHEET_ID holding the Sheet's ID.
 *
 * Deploy it to run as you, with access set to Anyone. Two Script properties
 * (Project Settings > Script properties) keep it private:
 *   APP_TOKEN       the app sends it with every request; also paste it into the app's Settings.
 *   SHORTCUT_TOKEN  phone shortcuts (quickAdd) send it. It can only add entries.
 */
const TABS = {
  Transactions: ['ID','Date','Type','Account','Destination Account','Category','Amount','Note','Created At'],
  Accounts: ['ID','Name','Icon','Opening Balance','Sort','Archived'],
  Categories: ['Name','Type','Sort','Archived'],
  Settings: ['Key','Value','Description']
};
// Only used to fill a new tab. After that, the Accounts, Categories and Settings tabs are the source of truth.
const DEFAULT_ACCOUNTS = [['cash','Cash','⌑'],['tng','TNG eWallet','◉'],['shopeepay','ShopeePay','S'],['maybank','Maybank','M'],['wise','Wise','W']];
const DEFAULT_CATEGORIES = {
  expense: ['Food & drinks','Fuel & transport','Mobile & internet','Bills & subscriptions','Family & giving','Social & lifestyle','Shopping','Healthcare','Education','Other'],
  income: ['Salary','Foodpanda','Other income','Refund / reimbursement','Gift received']
};
const DEFAULT_SETTINGS = [
  ['currency','MYR','ISO 4217 currency code. MYR is shown as RM.'],
  ['locale','en-MY','BCP 47 locale for number and date formatting.'],
  ['timezone','Asia/Kuala_Lumpur','IANA time zone. Decides "today" for new entries and phone shortcuts.']
];
// Older app versions stored each account's opening balance as an income row with this category.
const STARTING_BALANCE = 'Starting balance';

function doPost(e) {
  // Shortcuts send form fields (e.parameter); the app sends a JSON body.
  const body = e.parameter && e.parameter.action ? e.parameter : JSON.parse(e.postData.contents || '{}');
  const error = body.action === 'quickAdd' ? '' : tokenError_(body.token);
  if (error) return json_({ok:false, error});
  return withLock_(() => {
    const ss = setup_();
    if (body.action === 'quickAdd') return ContentService.createTextOutput(quickAdd_(ss, body));
    if (body.action === 'setOpeningBalances' && body.balances) return json_({ok:true, updated:setOpeningBalances_(ss, body.balances)});
    if (CHANGES.hasOwnProperty(body.action)) return json_(CHANGES[body.action](ss, body));
    if (body.action !== 'appendTransactions' || !Array.isArray(body.transactions)) return json_({ok:false, error:'Invalid request'});
    const list = body.transactions.filter(t => t && t.id);
    // An app that hasn't updated yet still sends opening balances as rows; the newest per account wins.
    const starts = list.filter(t => t.category === STARTING_BALANCE).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
    if (starts.length) setOpeningBalances_(ss, Object.fromEntries(starts.map(t => [t.account, Number(t.amount)])));
    const sheet = ss.getSheetByName('Transactions');
    const lastRow = sheet.getLastRow();
    const known = lastRow > 1 ? new Set(sheet.getRange(2,1,lastRow-1,1).getDisplayValues().flat().filter(String)) : new Set();
    const rows = list.filter(t => t.category !== STARTING_BALANCE && !known.has(t.id)).map(t => [t.id,t.date,t.type,t.account,t.destination||'',t.category,Number(t.amount),t.note||'',new Date(t.createdAt || Date.now()).toISOString()]);
    if (rows.length) sheet.getRange(sheet.getLastRow()+1,1,rows.length,TABS.Transactions.length).setValues(rows);
    return json_({ok:true, added:rows.length});
  });
}

// One entry from a phone shortcut. Returns a short line the shortcut shows as its notification.
function quickAdd_(ss, p) {
  const token = PropertiesService.getScriptProperties().getProperty('SHORTCUT_TOKEN');
  if (!token || p.token !== token) return 'Error: wrong or missing token';
  const {accounts, categories, settings} = readConfig_(ss);
  const type = String(p.type || '').trim().toLowerCase();
  if (!['income','expense','transfer'].includes(type)) return 'Error: type must be income, expense or transfer';
  const amount = Math.round(Number(String(p.amount || '').replace(/[^\d.]/g, '')) * 100) / 100;
  if (!(amount > 0)) return 'Error: amount must be more than 0';
  const account = accountId_(accounts, p.account);
  if (!account) return 'Error: unknown account "' + (p.account || '') + '"';
  let destination = '', category = 'Transfer';
  if (type === 'transfer') {
    destination = accountId_(accounts, p.destination);
    if (!destination || destination === account) return 'Error: choose a different destination account';
  } else {
    const wanted = String(p.category || '').trim().toLowerCase();
    const match = categories.find(c => !c.archived && c.type === type && c.name.toLowerCase() === wanted);
    if (!match) return 'Error: unknown category "' + (p.category || '') + '"';
    category = match.name;
  }
  const date = /^\d{4}-\d{2}-\d{2}$/.test(p.date || '') ? p.date : Utilities.formatDate(new Date(), settings.timezone || 'Asia/Kuala_Lumpur', 'yyyy-MM-dd');
  const note = String(p.note || '').trim();
  ss.getSheetByName('Transactions').appendRow([Utilities.getUuid(), date, type, account, destination, category, amount, note, new Date().toISOString()]);
  const name = id => accounts.find(a => a.id === id).name;
  const where = type === 'transfer' ? name(account) + ' → ' + name(destination) : category + ' · ' + name(account);
  const currency = !settings.currency || settings.currency === 'MYR' ? 'RM' : settings.currency + ' ';
  return 'Saved ' + currency + amount.toFixed(2) + ' · ' + where;
}

// Accepts an active account's ID ("tng") or name ("TNG eWallet"), any case.
function accountId_(accounts, value) {
  const v = String(value || '').trim().toLowerCase();
  const match = accounts.find(a => !a.archived && (a.id.toLowerCase() === v || a.name.toLowerCase() === v));
  return match ? match.id : '';
}

// balances: {accountId: amount}. Unknown IDs and non-numbers are skipped.
function setOpeningBalances_(ss, balances) {
  const sheet = ss.getSheetByName('Accounts');
  const ids = rows_(ss, 'Accounts').map(r => String(r[0]).trim());
  let updated = 0;
  Object.keys(balances).forEach(id => {
    const i = ids.indexOf(id), amount = balances[id];
    if (i < 0 || typeof amount !== 'number' || !isFinite(amount)) return;
    sheet.getRange(i + 2, 4).setValue(round2_(amount));
    updated++;
  });
  return updated;
}

// Account and category changes from the app. Each returns {ok:true, ...} or {ok:false, error} for the app to show.
// Accounts are matched by ID, categories by type + exact name.
const CHANGES = {saveAccount:saveAccount_, archiveAccount:archiveAccount_, deleteAccount:deleteAccount_, saveCategory:saveCategory_, archiveCategory:archiveCategory_, deleteCategory:deleteCategory_, reorder:reorder_};

// list: 'accounts', or a category type ('expense' / 'income'). keys: that list's account IDs or category names in the new order.
// Rows not in keys keep their Sort.
function reorder_(ss, body) {
  const accounts = body.list === 'accounts', type = text_(body.list).toLowerCase();
  if (!accounts && !['expense','income'].includes(type)) return fail_('Unknown list');
  const keys = (Array.isArray(body.keys) ? body.keys : []).map(text_), tab = accounts ? 'Accounts' : 'Categories', col = accounts ? 5 : 3;
  const rows = rows_(ss, tab);
  const column = rows.map(r => { const k = keys.indexOf(text_(r[0])); return [k >= 0 && (accounts || text_(r[1]).toLowerCase() === type) ? k + 1 : r[col - 1]]; });
  if (rows.length) ss.getSheetByName(tab).getRange(2, col, rows.length, 1).setValues(column);
  return {ok:true};
}

// account: {id?, name, icon?, openingBalance?}. No id adds a new account with an ID made from the name.
// When updating, icon and openingBalance stay as they are unless sent.
function saveAccount_(ss, body) {
  const a = body.account || {}, id = text_(a.id), name = text_(a.name), icon = [...text_(a.icon)].slice(0, 2).join('');
  if (!name) return fail_('Give the account a name');
  if (a.openingBalance !== undefined && (typeof a.openingBalance !== 'number' || !isFinite(a.openingBalance))) return fail_('Opening balance must be a number');
  const rows = rows_(ss, 'Accounts'), sheet = ss.getSheetByName('Accounts');
  // Phone shortcuts accept a name or an ID, so neither may repeat another account's.
  if (rows.some(r => text_(r[0]) !== id && [r[0], r[1]].some(v => text_(v).toLowerCase() === name.toLowerCase()))) return fail_('Another account is already called "' + name + '"');
  if (id) {
    const i = rows.findIndex(r => text_(r[0]) === id);
    if (i < 0) return fail_('No account with ID "' + id + '"');
    sheet.getRange(i + 2, 2).setValue(name);
    if (a.icon !== undefined) sheet.getRange(i + 2, 3).setValue(icon);
    if (a.openingBalance !== undefined) sheet.getRange(i + 2, 4).setValue(round2_(a.openingBalance));
    return {ok:true, id};
  }
  const base = name.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'account';
  let newId = base;
  for (let n = 2; rows.some(r => text_(r[0]) === newId); n++) newId = base + '-' + n;
  appendRow_(sheet, 'Accounts', [newId, name, icon, round2_(a.openingBalance || 0), nextSort_(rows.map(r => r[4])), false]);
  return {ok:true, id:newId};
}

// archived: true (default) hides the account from the entry form and shortcuts; false brings it back.
function archiveAccount_(ss, body) {
  const rows = rows_(ss, 'Accounts'), id = text_(body.id), i = rows.findIndex(r => text_(r[0]) === id), archived = body.archived !== false;
  if (i < 0) return fail_('No account with ID "' + id + '"');
  if (archived && isLastActive_(rows, i, r => text_(r[0]), 5)) return fail_('Keep at least one active account');
  ss.getSheetByName('Accounts').getRange(i + 2, 6).setValue(archived);
  return {ok:true};
}

// Only an account no entry uses can be deleted; otherwise archive it, so its history and balance stay.
function deleteAccount_(ss, body) {
  const rows = rows_(ss, 'Accounts'), id = text_(body.id), i = rows.findIndex(r => text_(r[0]) === id);
  if (i < 0) return fail_('No account with ID "' + id + '"');
  const used = rows_(ss, 'Transactions').filter(r => text_(r[3]) === id || text_(r[4]) === id).length;
  if (used) return fail_(text_(rows[i][1]) + ' is used by ' + entries_(used) + '. Archive it instead');
  if (isLastActive_(rows, i, r => text_(r[0]), 5)) return fail_('Keep at least one active account');
  deleteRows_(ss.getSheetByName('Accounts'), [i + 2]);
  return {ok:true};
}

// category: {name, type, previousName?}. With previousName it renames, and updates every entry that used the old name.
function saveCategory_(ss, body) {
  const c = body.category || {}, name = text_(c.name), type = text_(c.type).toLowerCase(), previous = text_(c.previousName);
  if (!['expense','income'].includes(type)) return fail_('Type must be expense or income');
  if (!name) return fail_('Give the category a name');
  if (['transfer', STARTING_BALANCE.toLowerCase()].includes(name.toLowerCase())) return fail_('"' + name + '" is reserved');
  const rows = rows_(ss, 'Categories'), sheet = ss.getSheetByName('Categories'), ofType = r => text_(r[1]).toLowerCase() === type;
  if (rows.some(r => ofType(r) && text_(r[0]) !== previous && text_(r[0]).toLowerCase() === name.toLowerCase())) return fail_('There is already a category called "' + name + '"');
  if (!previous) {
    appendRow_(sheet, 'Categories', [name, type, nextSort_(rows.filter(ofType).map(r => r[2])), false]);
    return {ok:true};
  }
  const i = rows.findIndex(r => ofType(r) && text_(r[0]) === previous);
  if (i < 0) return fail_('No category called "' + previous + '"');
  sheet.getRange(i + 2, 1).setValue(name);
  const tx = rows_(ss, 'Transactions');
  let renamed = 0;
  const column = tx.map(r => { if (text_(r[2]) === type && text_(r[5]) === previous) { renamed++; return [name]; } return [r[5]]; });
  if (renamed) ss.getSheetByName('Transactions').getRange(2, 6, column.length, 1).setValues(column);
  return {ok:true, renamed};
}

function archiveCategory_(ss, body) {
  const rows = rows_(ss, 'Categories'), i = categoryRow_(rows, body), archived = body.archived !== false;
  if (i < 0) return fail_('No category called "' + text_(body.name) + '"');
  if (archived && isLastActive_(rows, i, r => text_(r[1]).toLowerCase() === text_(rows[i][1]).toLowerCase() && text_(r[0]), 3)) return fail_('Keep at least one active ' + text_(rows[i][1]) + ' category');
  ss.getSheetByName('Categories').getRange(i + 2, 4).setValue(archived);
  return {ok:true};
}

function deleteCategory_(ss, body) {
  const rows = rows_(ss, 'Categories'), i = categoryRow_(rows, body);
  if (i < 0) return fail_('No category called "' + text_(body.name) + '"');
  const type = text_(rows[i][1]).toLowerCase(), name = text_(rows[i][0]);
  const used = rows_(ss, 'Transactions').filter(r => text_(r[2]) === type && text_(r[5]) === name).length;
  if (used) return fail_('"' + name + '" is used by ' + entries_(used) + '. Archive it instead');
  if (isLastActive_(rows, i, r => text_(r[1]).toLowerCase() === type && text_(r[0]), 3)) return fail_('Keep at least one active ' + type + ' category');
  deleteRows_(ss.getSheetByName('Categories'), [i + 2]);
  return {ok:true};
}

function categoryRow_(rows, body) {
  const type = text_(body.type).toLowerCase(), name = text_(body.name);
  return rows.findIndex(r => text_(r[1]).toLowerCase() === type && text_(r[0]) === name);
}
// True when rows[i] is the only active row among those that count (inGroup), so archiving or deleting it would leave none.
function isLastActive_(rows, i, inGroup, archivedCol) {
  if (isTrue_(rows[i][archivedCol])) return false;
  return rows.filter(r => inGroup(r) && !isTrue_(r[archivedCol])).length === 1;
}
function nextSort_(sorts) { return Math.max(0, ...sorts.map(n => Number(n) || 0)) + 1; }
function appendRow_(sheet, name, row) {
  const at = sheet.getLastRow() + 1;
  sheet.getRange(at, 1, 1, row.length).setValues([row]);
  sheet.getRange(at, TABS[name].indexOf('Archived') + 1).insertCheckboxes();
}
function entries_(n) { return n + (n === 1 ? ' entry' : ' entries'); }
function fail_(error) { return {ok:false, error}; }

function doGet(e) {
  const error = tokenError_(e && e.parameter && e.parameter.token);
  if (error) return json_({ok:false, error});
  return withLock_(() => {
    const ss = setup_();
    const tz = ss.getSpreadsheetTimeZone();
    const transactions = rows_(ss, 'Transactions').filter(r => r[0]).map(r => ({id:String(r[0]), date:r[1] instanceof Date ? Utilities.formatDate(r[1],tz,'yyyy-MM-dd') : String(r[1]), type:r[2], account:r[3], destination:r[4]||'', category:r[5], amount:Number(r[6]), note:r[7]||'', createdAt:new Date(r[8]).getTime()||0}));
    return json_({ok:true, ...readConfig_(ss), transactions});
  });
}

function readConfig_(ss) {
  const text = v => String(v).trim();
  const accounts = rows_(ss, 'Accounts').filter(r => text(r[0])).map(r => ({id:text(r[0]), name:text(r[1]) || text(r[0]), icon:text(r[2]), openingBalance:Number(r[3]) || 0, sort:Number(r[4]) || 0, archived:isTrue_(r[5])}));
  const categories = rows_(ss, 'Categories').map(r => ({name:text(r[0]), type:text(r[1]).toLowerCase(), sort:Number(r[2]) || 0, archived:isTrue_(r[3])})).filter(c => c.name && ['expense','income'].includes(c.type));
  const settings = {};
  rows_(ss, 'Settings').forEach(r => { if (text(r[0])) settings[text(r[0])] = text(r[1]); });
  return {accounts, categories, settings};
}

// Creates any missing tab. When Accounts is first created, 'Starting balance' rows move into its Opening Balance column.
function setup_() {
  const ss = spreadsheet_();
  const tx = ss.getSheetByName('Transactions') || ss.insertSheet('Transactions');
  if (tx.getLastRow() === 0) header_(tx, 'Transactions');
  const old = rows_(ss, 'Transactions');
  if (!ss.getSheetByName('Accounts')) {
    const opening = {}, at = {}, ids = DEFAULT_ACCOUNTS.map(a => a[0]);
    old.forEach(r => {
      [r[3], r[4]].forEach(id => { id = String(id).trim(); if (id && !ids.includes(id)) ids.push(id); });
      const time = new Date(r[8]).getTime() || 0;
      if (r[5] === STARTING_BALANCE && !(at[r[3]] > time)) { opening[r[3]] = Number(r[6]) || 0; at[r[3]] = time; }
    });
    newTab_(ss, 'Accounts', ids.map((id, i) => { const d = DEFAULT_ACCOUNTS.find(a => a[0] === id) || [id, id, '']; return [id, d[1], d[2], opening[id] || 0, i + 1, false]; }));
    deleteRows_(tx, old.map((r, i) => r[5] === STARTING_BALANCE ? i + 2 : 0).filter(Boolean));
  }
  if (!ss.getSheetByName('Categories')) {
    const cats = ['expense','income'].flatMap(type => DEFAULT_CATEGORIES[type].map(name => [name, type]));
    old.forEach(r => { const type = String(r[2]), name = String(r[5]).trim(); if (DEFAULT_CATEGORIES.hasOwnProperty(type) && name && name !== STARTING_BALANCE && !cats.some(c => c[0] === name && c[1] === type)) cats.push([name, type]); });
    newTab_(ss, 'Categories', cats.map(([name, type]) => [name, type, cats.filter(c => c[1] === type).findIndex(c => c[0] === name) + 1, false]));
  }
  if (!ss.getSheetByName('Settings')) newTab_(ss, 'Settings', DEFAULT_SETTINGS);
  return ss;
}

// Checked before anything else, so a request without the token can't read, write or set up tabs.
function tokenError_(token) {
  const expected = PropertiesService.getScriptProperties().getProperty('APP_TOKEN');
  if (!expected) return 'APP_TOKEN is not set in Script properties';
  return token === expected ? '' : 'Wrong or missing app token';
}

// A bound script uses its own Sheet; a standalone one needs the SHEET_ID script property.
function spreadsheet_() {
  const id = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  const ss = id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('No Sheet: open this script from the Sheet (Extensions > Apps Script) or add a SHEET_ID script property.');
  return ss;
}

function newTab_(ss, name, rows) {
  const sheet = ss.insertSheet(name), cols = TABS[name].length;
  header_(sheet, name);
  if (rows.length) sheet.getRange(2, 1, rows.length, cols).setValues(rows);
  const archived = TABS[name].indexOf('Archived') + 1;
  if (archived && rows.length) sheet.getRange(2, archived, rows.length, 1).insertCheckboxes();
  sheet.autoResizeColumns(1, cols);
}
function header_(sheet, name) { sheet.appendRow(TABS[name]); sheet.setFrozenRows(1); sheet.getRange(1, 1, 1, TABS[name].length).setFontWeight('bold'); sheet.autoResizeColumns(1, TABS[name].length); }
function rows_(ss, name) { const sheet = ss.getSheetByName(name), n = sheet.getLastRow() - 1; return n > 0 ? sheet.getRange(2, 1, n, TABS[name].length).getValues() : []; }
// Sheets refuses to delete every unfrozen row, so a spare one is added first when needed.
function deleteRows_(sheet, rows) {
  if (sheet.getMaxRows() - rows.length < 2) sheet.insertRowAfter(sheet.getMaxRows());
  rows.sort((a, b) => b - a).forEach(row => sheet.deleteRow(row));
}
function text_(v) { return String(v == null ? '' : v).trim(); }
function round2_(n) { return Math.round(n * 100) / 100; }
function isTrue_(v) { return v === true || String(v).trim().toUpperCase() === 'TRUE'; }
function withLock_(fn) { const lock = LockService.getScriptLock(); lock.waitLock(10000); try { return fn(); } finally { lock.releaseLock(); } }
function json_(value) { return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON); }
