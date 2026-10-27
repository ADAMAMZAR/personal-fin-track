# My Money

An installable, mobile-first personal finance tracker. Transactions are saved locally immediately and can be exported as CSV or sent to a private Google Sheet through the included Apps Script bridge.

## Google Sheets connection

1. In your existing Apps Script project, replace the default code with [`google-apps-script/Code.gs`](google-apps-script/Code.gs). It is already configured with your Sheet ID.
2. Save, then deploy a **new Web app version** that runs as you.
3. Paste the deployment `/exec` URL into the app's Settings.

There is no Sync button: saving an entry sends it to the Sheet straight away. Whenever the app opens, comes back to the foreground or reconnects to the internet, it sends anything still waiting and reloads every entry from the Sheet, so all your devices show the same data. Rows you edit or delete in the Sheet change on every device (rows you add by hand need a unique ID in column A) (this needs the web app's access set to **Anyone**). Entries saved offline stay on the device and upload automatically once you're back online. Only the newest starting balance per account counts. Run `node check-sync.js` to test this.

An entry counts as synced once it shows up when the app reloads from the Sheet. The app never removes data from the Sheet; the script also de-duplicates by transaction ID. **Resync all** in Settings sends every entry again if rows ever go missing.

## Phone shortcuts

Log an entry from your home screen or by voice without opening the app. Both phones send the same request to your Apps Script URL. The entry goes straight into the Sheet and shows up in the app the next time it opens.

### One-time setup (Apps Script)

1. Make a long random secret, e.g. run `node -e "console.log(crypto.randomUUID())"`.
2. In Apps Script, open **Project Settings → Script properties → Add script property**. Name it `SHORTCUT_TOKEN` and paste the secret as its value.
3. Paste the latest [`Code.gs`](google-apps-script/Code.gs), then open **Deploy → Manage deployments → ✏️ Edit → Version: New version → Deploy**. Editing the existing deployment keeps your `/exec` URL the same.

### What the shortcut sends

A **POST** to your `/exec` URL with **form** fields (not JSON):

| Field | Value |
|---|---|
| `action` | `quickAdd` |
| `token` | your `SHORTCUT_TOKEN` |
| `type` | `expense`, `income` or `transfer` |
| `amount` | e.g. `12.50` |
| `account` | `Cash`, `TNG eWallet`, `ShopeePay`, `Maybank` or `Wise` (or the ids `cash`, `tng`, `shopeepay`, `maybank`, `wise`) |
| `category` | an expense category (`Food & drinks`, `Fuel & transport`, `Mobile & internet`, `Bills & subscriptions`, `Family & giving`, `Social & lifestyle`, `Shopping`, `Healthcare`, `Education`, `Other`) or an income source (`Salary`, `Foodpanda`, `Other income`, `Refund / reimbursement`, `Gift received`). Not needed for transfers. |
| `destination` | transfers only: the account the money goes to |
| `note` | optional |
| `date` | optional, `YYYY-MM-DD`; defaults to today (Malaysia time) |

The reply is one line of text, e.g. `Saved RM12.50 · Food & drinks · TNG eWallet` or `Error: unknown category "Fod"`, which the shortcut shows as its notification.

### iPhone (Shortcuts app)

1. Open **Shortcuts → +** and name it **Log spending**.
2. Add **Ask for Input**: type *Number*, prompt *Amount (RM)*.
3. Add **List** with your categories, then **Choose from List** with the prompt *Category*.
4. Add another **List** with your accounts, then **Choose from List** with the prompt *Paid from*.
5. Add **Ask for Input**: type *Text*, prompt *Note (optional)*.
6. Add **Get Contents of URL**: paste your `/exec` URL, tap **Show More**, set **Method: POST** and **Request Body: Form**, then add the fields from the table. Use the matching outputs from steps 2–5 for `amount`, `category`, `account` and `note`, and type `expense` and the token as plain text.
7. Add **Show Notification** with the *Contents of URL*.
8. Tap the share icon, then **Add to Home Screen**. You can also say *"Hey Siri, log spending"*, or assign it to **Settings → Accessibility → Touch → Back Tap**.

Duplicate the shortcut for **Money in** (`type` = `income`, with income sources in the list) and **Move money** (`type` = `transfer`, with a second account choice sent as `destination`).

### Android (HTTP Shortcuts app)

1. Install **HTTP Shortcuts** (free, open source) from the Play Store.
2. Open **⋮ → Variables** and add:
   - `amount`: *Number input*, title *Amount (RM)*
   - `category`: *Select*, with one option per category
   - `account`: *Select*, with one option per account
   - `note`: *Text input*, title *Note (optional)*
3. Tap **+ → Regular shortcut** and name it **Log spending**.
   - **Basic request settings:** Method *POST*, URL = your `/exec` URL
   - **Request body:** *Form parameters (x-www-form-urlencoded)*. Add the fields from the table and insert the variables with the `{}` button.
   - **Response handling:** show the response as a *toast* (or a dialog)
4. Long-press the shortcut and tap **Place on home screen**, or add the HTTP Shortcuts widget. Google Assistant can open home-screen shortcuts by name too.

Duplicate the shortcut for **Money in** and **Move money** the same way as on iPhone.

**App icon shortcuts (Android):** long-press the installed My Money icon to see **Spend / Money in / Transfer**, which open the app on the entry form. Android picks up manifest changes on its own schedule. If the shortcuts don't show up after a day, remove My Money from the home screen and install it again from Chrome. iPhone doesn't support this, so use the Shortcuts app above.

For your privacy, keep the site and Sheet private. A public Apps Script web app can accept requests from anyone who knows its URL, so add your own authentication before using public access for financial data.
