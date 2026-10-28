# Google Sheets schema

> **Status:** all four tabs are live, and the script can add, rename, archive and delete accounts and categories under the [rules](#rules-the-script-enforces) below. Still to come: the app screens that use them, and dropdowns in the Sheet.

The Sheet has four tabs. Row 1 of each tab is a frozen header row. The script creates any missing tab and fills it with the defaults.

| Tab | One row per | Edited from |
|---|---|---|
| [`Transactions`](#transactions) | Entry | App, phone shortcuts, by hand |
| [`Accounts`](#accounts) | Account | By hand. Opening balances also from the app. |
| [`Categories`](#categories) | Expense category or income source | By hand |
| [`Settings`](#settings) | App-wide setting | By hand |

Secrets (`APP_TOKEN`, `SHORTCUT_TOKEN`) go in Apps Script **Script properties**, not in the Sheet. Anyone the Sheet is shared with can read its tabs.

## Transactions

| Col | Header | Format | Required | Notes |
|---|---|---|---|---|
| A | ID | Text | Yes | Unique. The app uses `crypto.randomUUID()`. Rows added by hand need any unique value. |
| B | Date | `YYYY-MM-DD` | Yes | The day the money moved. |
| C | Type | `expense`, `income` or `transfer` | Yes | Dropdown. |
| D | Account | Account ID | Yes | Dropdown from `Accounts` column A. The account the money leaves (expense, transfer) or arrives in (income). |
| E | Destination Account | Account ID | Transfers only | The receiving account. Must differ from Account. Blank for expenses and income. |
| F | Category | Text | Yes | A `Categories` name whose Type matches column C. Always `Transfer` for transfers. |
| G | Amount | Number, 2 decimals | Yes | Always positive. Type sets the direction. |
| H | Note | Text | No | Up to 90 characters when entered in the app. |
| I | Created At | ISO 8601 timestamp (UTC) | Yes | When the entry was recorded. Set automatically. |

**Examples**

| ID | Date | Type | Account | Destination Account | Category | Amount | Note | Created At |
|---|---|---|---|---|---|---|---|---|
| 3f2b8c1e-7a4d-4e9b-9c61-2d5e8f0a1b37 | 2026-10-26 | expense | tng | | Food & drinks | 12.50 | ZUS Coffee | 2026-10-26T01:14:09.000Z |
| 9d47e0a2-51c8-4f3a-b6e2-7c0f9a8d2e14 | 2026-10-27 | income | cash | | Foodpanda | 85.00 | Weekend deliveries | 2026-10-27T13:40:52.000Z |
| c81a5f63-0e9b-4d27-a4f8-5b3e6d1c9a70 | 2026-10-28 | transfer | cash | tng | Transfer | 50.00 | Top up TNG | 2026-10-28T03:05:31.000Z |

## Accounts

| Col | Header | Format | Required | Notes |
|---|---|---|---|---|
| A | ID | Lowercase text | Yes | Unique and never changes. Transactions reference this. Accounts added through the script get a slug of the name, e.g. `Touch 'n Go Card` → `touch-n-go-card`, with `-2` added if it's already taken. When adding a row by hand, pick any short unique ID. |
| B | Name | Text | Yes | Shown in the app. Rename freely. |
| C | Icon | One emoji or character | No | Blank shows the first letter of Name. |
| D | Opening Balance | Number, 2 decimals | Yes | The balance when you started tracking this account. Use a negative number for money owed, such as a credit card. |
| E | Sort | Number | Yes | Display order, lowest first. |
| F | Archived | Checkbox (`TRUE` / `FALSE`) | Yes | `TRUE` hides the account from the entry form and phone shortcuts. Its history and balance stay. |

**Examples**

| ID | Name | Icon | Opening Balance | Sort | Archived |
|---|---|---|---|---|---|
| cash | Cash | ⌑ | 120.00 | 1 | FALSE |
| tng | TNG eWallet | ◉ | 2.82 | 2 | FALSE |
| shopeepay | ShopeePay | S | 0.00 | 3 | TRUE |

**Balance** = Opening Balance + income − expenses − transfers out + transfers in.

With the example transactions above:

- **Cash:** 120.00 + 85.00 − 50.00 = **155.00**
- **TNG eWallet:** 2.82 − 12.50 + 50.00 = **40.32**

## Categories

| Col | Header | Format | Required | Notes |
|---|---|---|---|---|
| A | Name | Text | Yes | Unique within its Type. Renaming also updates every matching `Transactions` row. |
| B | Type | `expense` or `income` | Yes | Dropdown. `expense` = spending category, `income` = income source. |
| C | Sort | Number | Yes | Order within its Type, lowest first. |
| D | Archived | Checkbox (`TRUE` / `FALSE`) | Yes | `TRUE` hides it from the entry form and phone shortcuts. Past entries keep it. |

`Transfer` is reserved for transfers. Don't add it as a category.

**Examples**

| Name | Type | Sort | Archived |
|---|---|---|---|
| Food & drinks | expense | 1 | FALSE |
| Fuel & transport | expense | 2 | FALSE |
| Foodpanda | income | 2 | FALSE |

## Settings

| Col | Header | Format | Required | Notes |
|---|---|---|---|---|
| A | Key | Text | Yes | One of `currency`, `locale`, `timezone`. |
| B | Value | Text | Yes | See the examples below. |
| C | Description | Text | No | A note for people editing the Sheet. The script ignores it. |

**Examples**

| Key | Value | Description |
|---|---|---|
| currency | MYR | ISO 4217 currency code. MYR is shown as RM. |
| locale | en-MY | BCP 47 locale for number and date formatting. |
| timezone | Asia/Kuala_Lumpur | IANA time zone. Decides "today" for new entries and phone shortcuts. |

## Rules the script enforces

These apply to changes made through the script. Edits made directly in the Sheet aren't checked.

- **Accounts are archived, not deleted:** an account can be deleted only when no transaction uses it. The same goes for categories.
- **At least one stays active:** the last active account, and the last active category of each Type, can't be archived or deleted.
- **Names don't repeat:** an account name can't match another account's name or ID, ignoring case. Category names are unique within their Type.
- **Renaming a category updates history:** every `Transactions` row with the old name and the same Type gets the new name.
- **`Transfer` and `Starting balance` are reserved** and can't be used as category names.
- **Phone shortcuts accept active items only:** `quickAdd` rejects archived accounts and categories.

## Migrating from the current layout

The script runs this once when the `Accounts` tab doesn't exist yet:

1. **Accounts:** create one row per default account (`cash`, `tng`, `shopeepay`, `maybank`, `wise`), plus one for any other account ID found in `Transactions`.
2. **Opening balances:** for each account, copy the amount of its newest `Starting balance` row (highest Created At) into Opening Balance, then delete every `Starting balance` row from `Transactions`.
3. **Categories:** create rows for the default expense categories and income sources, plus any other category found in `Transactions`.
4. **Settings:** add `currency` = `MYR`, `locale` = `en-MY` and `timezone` = `Asia/Kuala_Lumpur`.

An app that hasn't updated yet may still send `Starting balance` rows. The script turns those into opening balances instead of adding them to `Transactions`.
