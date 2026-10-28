# My Money

My Money is a mobile-first web app for logging spending, income and transfers in a few taps, with every entry saved to a Google Sheet you own.

## Prerequisites

- **Node.js 20 or later:** runs the local server and the sync test. There is nothing to `npm install`.
- **A modern browser:** Chrome or Edge 92+, Safari 15.4+ (iOS 15.4+), or Firefox 98+.
- **A Google account** *(optional)*: needed for Sheets sync and phone shortcuts. Without one, entries stay on the device.

## Quickstart

```bash
git clone https://github.com/ADAMAMZAR/personal-fin-track.git
cd personal-fin-track
npx --yes serve dist
```

Open <http://localhost:3000>. On first launch the app asks for each account's starting balance.

- **No Node?** Run `python -m http.server 3000 --directory dist` (Python 3.7+) instead.
- **Trying it on a phone?** [Deploy it](#deploy) first. Browsers block `crypto.randomUUID` and service workers on plain-HTTP LAN addresses such as `http://192.168.1.5:3000`, so saving fails there.

## Core features

- **Three entry types:** Spend, Money in, and Transfer between your own accounts. Cash, TNG eWallet, ShopeePay, Maybank and Wise are set up to start.
- **Monthly dashboard:** total balance, money in and out, savings rate, spending by category, and per-account balances.
- **Annual insights:** yearly income, spending and savings, month-by-month spending, and income by source.
- **Offline-first PWA:** install it to your home screen. Entries save to the device first and upload when you're back online.
- **Two-way Google Sheets sync:** the Sheet is the source of truth. Edit or delete a row there and every device follows.
- **Your own accounts and categories:** add, rename, reorder, archive or delete them from the app (**Manage** next to Accounts, and **⚙ Settings → Manage categories**). Anything with entries is archived instead of deleted, so history and balances stay intact.
- **Phone shortcuts:** log an entry from the home screen, Siri or Back Tap without opening the app.
- **CSV export:** download every entry from the History tab.
- **No build step:** plain HTML, CSS and JavaScript in `dist/`, served as-is.

Accounts, categories, currency and time zone live in your Sheet, so you change them in the app or the Sheet instead of in code. The defaults are Malaysian ringgit (RM) and Malaysia time (`Asia/Kuala_Lumpur`).

## Configuration

The app has no environment variables. These five settings control it:

| Setting | Where | What it does |
|---|---|---|
| Sheet link | Apps Script | Open the script from your Sheet (**Extensions → Apps Script**) and it uses that Sheet automatically. A script created on its own needs a `SHEET_ID` script property set to the ID from your Sheet's URL: `docs.google.com/spreadsheets/d/<SHEET_ID>/edit`. |
| Web-app access | Apps Script → **Deploy** | Set **Execute as: Me** and **Who has access: Anyone**. The app calls the script without signing in, so any other access level breaks sync. |
| Apps Script URL and app token | App → **⚙ Settings** | Your deployment's `/exec` URL and your `APP_TOKEN`. They are stored per browser, so enter them once on each device. Leave the URL blank to keep data on the device only. |
| `APP_TOKEN`, `SHORTCUT_TOKEN` | Apps Script → **Project Settings → Script properties** | Two different secrets. The script refuses any app request without `APP_TOKEN`. `SHORTCUT_TOKEN` is for phone shortcuts and can only add entries. |
| `Accounts`, `Categories`, `Settings` tabs | Your Sheet | Your accounts and opening balances, expense categories and income sources, and currency, locale and time zone. The script creates them with defaults on first run. See [docs/sheets-schema.md](docs/sheets-schema.md). |

## Connect Google Sheets

1. **Create the script:** open your Sheet, go to **Extensions → Apps Script**, replace the default code with [`Code.gs`](google-apps-script/Code.gs), and save.
2. **Create the app token:** run `node -e "console.log(crypto.randomUUID())"`. In Apps Script, open **Project Settings → Script properties → Add script property**, name it `APP_TOKEN`, and paste the value.
3. **Deploy:** click **Deploy → New deployment → Web app**, set **Execute as: Me** and **Who has access: Anyone**, then authorize when prompted.
4. **Connect the app:** in **⚙ Settings**, paste the `/exec` URL and your `APP_TOKEN`, then save.

On first use the script adds the `Transactions`, `Accounts`, `Categories` and `Settings` tabs. If the Sheet already has entries, it moves each account's newest starting balance into `Accounts` as its opening balance.

**After editing `Code.gs`:** go to **Deploy → Manage deployments → ✏️ Edit → Version: New version → Deploy**. Editing the existing deployment keeps the same `/exec` URL.

### How sync works

- **On save:** the entry uploads immediately.
- **On open, return to foreground, or reconnect:** the app uploads anything still pending, then reloads every entry from the Sheet.
- **Offline:** entries stay on the device and upload automatically once you're back online.
- **Sheet wins:** edits and deletions made in the Sheet replace the device's copy on the next reload. Entries still waiting to upload are kept.
- **No duplicates:** the script skips any ID already in the Sheet. If rows ever go missing, **⚙ Settings → Resync all** sends every entry again.
- **The app never deletes from the Sheet:** **Clear local data** wipes the current device only.
- **Accounts, categories and settings:** changes made in the app go straight to the Sheet, need a connection, and show the script's answer (for example, "Cash is used by 2 entries. Archive it instead"). You can also edit the `Accounts`, `Categories` and `Settings` tabs directly. Either way, every device picks up the change on its next reload. Without a Sheet, the same changes apply to the device only.

**Sheet format:** [docs/sheets-schema.md](docs/sheets-schema.md) lists every column of every tab, with examples. Rows you add to `Transactions` by hand need a unique ID in column A, and an account ID (such as `tng`, not `TNG eWallet`) in the account columns.

## Phone shortcuts

Log an entry without opening the app. iPhone and Android shortcuts both send one POST to your `/exec` URL. The entry goes straight into the Sheet and appears in the app the next time it opens.

**One-time setup:**

1. Generate a new secret, separate from `APP_TOKEN`: `node -e "console.log(crypto.randomUUID())"`
2. In Apps Script, open **Project Settings → Script properties → Add script property**. Name it `SHORTCUT_TOKEN` and paste the secret as its value.

**Test it** (this adds a real RM12.50 entry, so delete the row afterwards):

```bash
curl -L "https://script.google.com/macros/s/<DEPLOYMENT_ID>/exec" \
  --data-urlencode "action=quickAdd" \
  --data-urlencode "token=<SHORTCUT_TOKEN>" \
  --data-urlencode "type=expense" \
  --data-urlencode "amount=12.50" \
  --data-urlencode "account=TNG eWallet" \
  --data-urlencode "category=Food & drinks"
```

<details>
<summary><b>Request format</b></summary>

Send a **POST** to your `/exec` URL with these form fields:

| Field | Required | Value |
|---|---|---|
| `action` | Yes | `quickAdd` |
| `token` | Yes | Your `SHORTCUT_TOKEN` |
| `type` | Yes | `expense`, `income` or `transfer` |
| `amount` | Yes | e.g. `12.50` |
| `account` | Yes | An account name or ID |
| `category` | Expense and income | An expense category or income source |
| `destination` | Transfer | The receiving account (name or ID), different from `account` |
| `note` | No | Free text |
| `date` | No | `YYYY-MM-DD`. Defaults to today in Malaysia time. |

`account`, `destination` and `category` must match an active (not archived) row in your `Accounts` or `Categories` tab, by name or ID, in any case. The defaults are:

- **Accounts:** `Cash` (`cash`), `TNG eWallet` (`tng`), `ShopeePay` (`shopeepay`), `Maybank` (`maybank`), `Wise` (`wise`)
- **Expense categories:** `Food & drinks`, `Fuel & transport`, `Mobile & internet`, `Bills & subscriptions`, `Family & giving`, `Social & lifestyle`, `Shopping`, `Healthcare`, `Education`, `Other`
- **Income sources:** `Salary`, `Foodpanda`, `Other income`, `Refund / reimbursement`, `Gift received`

The reply is one line of plain text, such as `Saved RM12.50 · Food & drinks · TNG eWallet` or `Error: unknown category "Fod"`. Shortcuts show it as a notification.

</details>

<details>
<summary><b>iPhone</b> (Shortcuts app)</summary>

1. Open **Shortcuts**, tap **+**, and name the shortcut **Log spending**.
2. Add **Ask for Input**. Type: *Number*. Prompt: *Amount (RM)*.
3. Add **List** with your expense categories, then **Choose from List**. Prompt: *Category*.
4. Add another **List** with your accounts, then **Choose from List**. Prompt: *Paid from*.
5. Add **Ask for Input**. Type: *Text*. Prompt: *Note (optional)*.
6. Add **Get Contents of URL** with your `/exec` URL. Tap **Show More**, set **Method: POST** and **Request Body: Form**, and add the fields from the request format. Map `amount`, `category`, `account` and `note` to the outputs of steps 2–5. Type `quickAdd`, `expense` and your token as plain text.
7. Add **Show Notification** with *Contents of URL*.
8. Tap **Share → Add to Home Screen**. You can also say *"Hey Siri, log spending"* or assign it to **Settings → Accessibility → Touch → Back Tap**.

Duplicate it for **Money in** (`type` = `income`, with income sources in the list) and **Move money** (`type` = `transfer`, with a second account choice sent as `destination`).

</details>

<details>
<summary><b>Android</b> (HTTP Shortcuts app)</summary>

1. Install **HTTP Shortcuts** (free, open source) from the Play Store.
2. Open **⋮ → Variables** and add:
   - `amount`: *Number input*, title *Amount (RM)*
   - `category`: *Select*, one option per category
   - `account`: *Select*, one option per account
   - `note`: *Text input*, title *Note (optional)*
3. Tap **+ → Regular shortcut**, name it **Log spending**, and set:
   - **Basic request settings:** Method *POST*, URL = your `/exec` URL
   - **Request body:** *Form parameters (x-www-form-urlencoded)*. Add the fields and insert variables with the `{}` button.
   - **Response handling:** show the response as a *toast* or dialog
4. Long-press the shortcut and tap **Place on home screen**, or add the HTTP Shortcuts widget. Google Assistant can open home-screen shortcuts by name.

Duplicate it for **Money in** and **Move money** as on iPhone.

**App icon shortcuts:** long-press the installed My Money icon for **Spend**, **Money in** and **Transfer**, which open the entry form directly. Android picks up manifest changes on its own schedule. If they haven't appeared after a day, remove My Money from the home screen and reinstall it from Chrome. iPhone doesn't support these.

</details>

## Test

```bash
node check-sync.js
```

Prints `sync check ok` on success. It runs `dist/app.js` against a stub DOM and a fake Sheet, then checks that:

- pending entries and opening balances upload when the app opens
- the Sheet's entries and accounts win over the device's copy
- unsent changes survive a reload
- an entry for a removed account doesn't break the totals
- old `Starting balance` rows become opening balances
- every request carries the app token, and a refused token leaves the device's data untouched
- account and category changes return the script's answer, refuse to run offline, and follow the same rules on a device with no Sheet

## Deploy

- **GitHub Pages:** every push to `main` publishes `dist/` through [`pages.yml`](.github/workflows/pages.yml). Enable it once under **Settings → Pages → Source: GitHub Actions**.
- **Any static host:** upload the contents of `dist/` and serve it over HTTPS.
- **Install on a phone:** open the deployed URL, then tap **Share → Add to Home Screen** (iPhone) or **⋮ → Install app** (Android Chrome).

The service worker fetches fresh files whenever it can, so a new deploy loads on the next reload.

## Project structure

```text
dist/                         The whole app, served as-is
├── index.html, app.js, style.css
├── sw.js                     Service worker (offline cache)
└── manifest.json             PWA metadata and Android app-icon shortcuts
google-apps-script/Code.gs    Sheets bridge: sets up the tabs, GET returns everything, POST saves entries, opening balances and quickAdd
check-sync.js                 Sync test
.github/workflows/pages.yml   Deploys dist/ to GitHub Pages
```

## Security

- **`APP_TOKEN` is the key to your data.** Without it, the `/exec` URL returns nothing and accepts nothing from the app. Anyone with both can read and change your entries, so keep the token private.
- **`SHORTCUT_TOKEN` can only add entries.** If a phone or shortcut is lost, change it in Script properties. Your data stays unreadable either way.
- **Changing a token takes effect immediately.** No redeploy is needed. Enter the new `APP_TOKEN` in **⚙ Settings** on each device.
- **Keep the Sheet private.** The script runs as you, so the Sheet doesn't need to be shared with anyone.
