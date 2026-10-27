# My Money

An installable, mobile-first personal finance tracker. Transactions are saved locally immediately and can be exported as CSV or sent to a private Google Sheet through the included Apps Script bridge.

## Google Sheets connection

1. In your existing Apps Script project, replace the default code with [`google-apps-script/Code.gs`](google-apps-script/Code.gs). It is already configured with your Sheet ID.
2. Save, then deploy a **new Web app version** that runs as you.
3. Paste the deployment `/exec` URL into the app's Settings.

There is no Sync button: saving an entry sends it to the Sheet straight away. Whenever the app opens, comes back to the foreground or reconnects to the internet, it sends anything still waiting and reloads every entry from the Sheet, so all your devices show the same data. Rows you edit or delete in the Sheet change on every device (rows you add by hand need a unique ID in column A) (this needs the web app's access set to **Anyone**). Entries saved offline stay on the device and upload automatically once you're back online. Only the newest starting balance per account counts. Run `node check-sync.js` to test this.

An entry counts as synced once it shows up when the app reloads from the Sheet. The app never removes data from the Sheet; the script also de-duplicates by transaction ID. **Resync all** in Settings sends every entry again if rows ever go missing.

For your privacy, keep the site and Sheet private. A public Apps Script web app can accept requests from anyone who knows its URL, so add your own authentication before using public access for financial data.
