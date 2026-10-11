# My Money

An installable, mobile-first personal finance tracker. Transactions are saved locally immediately and can be exported as CSV or sent to a private Google Sheet through the included Apps Script bridge.

## Google Sheets connection

1. Create a blank Google Sheet named `My Money`.
2. In the sheet, choose **Extensions → Apps Script** and replace the default code with [`google-apps-script/Code.gs`](google-apps-script/Code.gs).
3. In **Project Settings → Script properties**, create `SHEET_ID` with the part between `/d/` and `/edit` from your Sheet URL.
4. Deploy **Web app**, select *Execute as: Me*, copy the deployment `/exec` URL, and paste it into the app’s Settings.

The app marks transactions as synced after sending them. It never removes data from the Sheet; the script also de-duplicates by transaction ID.

For your privacy, keep the site and Sheet private. A public Apps Script web app can accept requests from anyone who knows its URL, so add your own authentication before using public access for financial data.
