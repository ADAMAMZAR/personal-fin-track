# My Money

An installable, mobile-first personal finance tracker. Transactions are saved locally immediately and can be exported as CSV or sent to a private Google Sheet through the included Apps Script bridge.

## Google Sheets connection

1. In your existing Apps Script project, replace the default code with [`google-apps-script/Code.gs`](google-apps-script/Code.gs). It is already configured with your Sheet ID.
2. Save, then deploy a **new Web app version** that runs as you.
3. Paste the deployment `/exec` URL into the app's Settings.

On open, after saving Settings, and after Sync, the app reloads its synced entries from the Sheet, so rows you edit or delete in the Sheet change on every device (entries not yet synced are kept until you tap Sync; rows you add by hand need a unique ID in column A) (this needs the web app's access set to **Anyone**). Only the newest starting balance per account counts. Run `node check-sync.js` to test this merge.

The app marks transactions as synced after sending them. It never removes data from the Sheet; the script also de-duplicates by transaction ID.

For your privacy, keep the site and Sheet private. A public Apps Script web app can accept requests from anyone who knows its URL, so add your own authentication before using public access for financial data.
