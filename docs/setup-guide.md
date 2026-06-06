# Fontana Stock System - Setup Guide

Step-by-step guide to configure the full stock management system: Google Sheet, n8n workflows, Telegram bot, and web form.

---

## 1. Google Sheet Setup

### 1.1 Create the Sheet

1. Go to [Google Sheets](https://sheets.google.com) and create a new blank spreadsheet.
2. Rename it to **"Fontana - Control de Stock"** (or any name you prefer).

### 1.2 Run the Setup Script

The Apps Script creates all the required sheets (Stock, Movimientos, Pedidos, Usuarios_Autorizados, Formulas_BOM, Proveedores, Config, Dashboard) with their headers, formatting, and conditional formatting rules.

1. Open your new Google Sheet.
2. Go to **Extensions > Apps Script**.
3. Delete any default code in the editor.
4. Paste the contents of the `sheets-setup/setup-sheets.gs` script.
5. Click **Run** and select the function **`setupStockSystem`**.
6. The first time, Google will ask you to authorize the script. Click **Review Permissions**, choose your Google account, and click **Allow**.
7. Wait for the script to finish. You should see all the tabs created with their headers and formatting.

### 1.3 Copy the Sheet ID

You will need the Sheet ID for n8n configuration.

1. Look at the URL of your Google Sheet. It follows this pattern:
   ```
   https://docs.google.com/spreadsheets/d/XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX/edit
   ```
2. The **Sheet ID** is the long alphanumeric string between `/d/` and `/edit`.
3. Copy it and save it somewhere accessible. You will use it multiple times in the next section.

### 1.4 Initial Data

After running the setup script:

- Go to the **"Config"** sheet and set your email address in the `ALERTA_EMAIL` row.
- Go to the **"Usuarios_Autorizados"** sheet and add at least one row with your Telegram ID, name, role (`ADMIN`), and `TRUE` in the ACTIVO column.
- Optionally, add your suppliers in the **"Proveedores"** sheet.
- The **"Stock"** sheet is ready for you to start adding your inventory items.

---

## 2. n8n Workflow Configuration

The 5 workflows are already loaded in n8n with the following IDs:

| Workflow | ID | Purpose |
|---|---|---|
| Alerta stock bajo | `ZG6FzguqWV4ZYjfx` | Sends email alerts when stock drops below minimum |
| Calcular materiales (BOM) | `gOSSBXlULF40Kzle` | Subflow: calculates materials needed for a furniture order |
| Formulario web webhook | `gTpBGBCY41KyyHlx` | Receives requests from the web form |
| Reporte programado | `s41vF8tWhGW4HhFM` | Sends periodic stock reports via email |
| Bot Telegram | `DorrTQwkg0gTh30x` | Telegram bot: main entry point for all bot interactions |

### 2.1 Google Sheets Credentials

All workflows read from and write to the same Google Sheet. You need to create a single OAuth2 credential and assign it everywhere.

1. In n8n, go to **Settings > Credentials > Add Credential**.
2. Search for **Google Sheets OAuth2 API**.
3. Follow the n8n documentation to create OAuth2 credentials:
   - Create a project in [Google Cloud Console](https://console.cloud.google.com/).
   - Enable the **Google Sheets API** and **Google Drive API**.
   - Create OAuth2 credentials (Web application type).
   - Set the redirect URI that n8n provides.
   - Copy the Client ID and Client Secret into n8n.
   - Click **Connect** and authorize with your Google account.
4. Once created, go to **each of the 5 workflows** and assign this credential to **every Google Sheets node**.

### 2.2 Sheet ID

In every workflow, replace the placeholder `SHEET_ID_PRINCIPAL` with the actual Sheet ID you copied in step 1.3.

To do this efficiently:

1. Open each workflow in the n8n editor.
2. Click on each **Google Sheets node** (there are several per workflow).
3. In the node configuration, find the **Document ID** or **Sheet ID** field.
4. Replace `SHEET_ID_PRINCIPAL` with your actual Sheet ID.
5. Save the workflow.

Repeat for all 5 workflows. Every Google Sheets node must point to your sheet.

### 2.3 Telegram Bot Credential

This is only needed for the **Bot Telegram** workflow (`DorrTQwkg0gTh30x`).

1. Open Telegram and search for **@BotFather**.
2. Send `/newbot` and follow the instructions to create a new bot.
3. BotFather will give you a **bot token** (a long string like `123456789:ABCdefGHIjklMNOpqrsTUVwxyz`).
4. In n8n, go to **Settings > Credentials > Add Credential**.
5. Search for **Telegram API**.
6. Paste the bot token.
7. Open the **Bot Telegram** workflow and assign this credential to all Telegram nodes.

### 2.4 Gmail Credential

Needed for the **Alerta stock bajo** and **Reporte programado** workflows.

1. In n8n, go to **Settings > Credentials > Add Credential**.
2. Search for **Gmail OAuth2 API**.
3. Follow the same Google Cloud Console process as above, but enable the **Gmail API**.
4. Connect and authorize.
5. Assign this credential to all Gmail/Email nodes in:
   - Alerta stock bajo (`ZG6FzguqWV4ZYjfx`)
   - Reporte programado (`s41vF8tWhGW4HhFM`)

### 2.5 Subflow Linking (Execute Workflow Nodes)

Two workflows call the **Calcular materiales (BOM)** subflow. You need to tell them which workflow ID to execute.

1. Open the **Bot Telegram** workflow (`DorrTQwkg0gTh30x`).
   - Find the **Execute Workflow** node named "Calcular materiales BOM" (or similar).
   - Set the **Workflow ID** to `gOSSBXlULF40Kzle`.

2. Open the **Formulario web webhook** workflow (`gTpBGBCY41KyyHlx`).
   - Find the **Execute Workflow** node named "Calcular materiales BOM" (or similar).
   - Set the **Workflow ID** to `gOSSBXlULF40Kzle`.

3. Save both workflows.

---

## 3. Telegram Bot Setup

### 3.1 Set the Webhook

Once the **Bot Telegram** workflow is active in n8n, it exposes a webhook URL for Telegram.

1. In n8n, open the **Bot Telegram** workflow.
2. Click on the **Telegram Trigger** node to see its webhook URL. It will look something like:
   ```
   https://your-n8n-domain.com/webhook/xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
   ```
3. Set this URL as the bot's webhook by opening this URL in your browser (replace the values):
   ```
   https://api.telegram.org/bot<YOUR_BOT_TOKEN>/setWebhook?url=<YOUR_WEBHOOK_URL>
   ```
4. You should see a response: `{"ok":true,"result":true,"description":"Webhook was set"}`.

### 3.2 Authorize Users

Only users listed in the **"Usuarios_Autorizados"** sheet can use the bot.

1. Get your Telegram user ID. You can use the bot [@userinfobot](https://t.me/userinfobot) -- send it any message and it replies with your ID.
2. Open the Google Sheet, go to the **"Usuarios_Autorizados"** tab.
3. Add a row:
   | TELEGRAM_ID | NOMBRE | ROL | ACTIVO |
   |---|---|---|---|
   | `your_id` | Your Name | ADMIN | TRUE |
4. Repeat for each person who should have access.

### 3.3 Test the Bot

1. Open Telegram and search for your bot by the name you gave it in BotFather.
2. Send `/start` or any message.
3. You should see the main menu with all options.

---

## 4. Web Form Deployment

The web form is a static site (HTML + CSS + JS) located in the `web-form/` folder. It connects to n8n via the Formulario webhook workflow.

### 4.1 Configure the Webhook URL

Before deploying, you need to set the n8n webhook URL in the form's code.

1. Open the **Formulario web webhook** workflow (`gTpBGBCY41KyyHlx`) in n8n.
2. Click on the **Webhook** trigger node and copy its production URL.
3. Open `web-form/app.js` and find the `WEBHOOK_URL` variable near the top of the file.
4. Replace the placeholder value with your actual webhook URL:
   ```js
   const WEBHOOK_URL = 'https://your-n8n-domain.com/webhook/xxxxxxxx';
   ```
5. Save the file.

### 4.2 Deploy

Choose one of the following options:

#### Option A: Netlify (recommended for simplicity)

1. Go to [Netlify](https://www.netlify.com/) and create a free account.
2. From the dashboard, click **"Add new site" > "Deploy manually"**.
3. Drag and drop the entire `web-form/` folder onto the upload area.
4. Netlify assigns a random URL (e.g., `https://random-name.netlify.app`). Your form is live.
5. Optionally, rename the site in **Site settings > Site name**.

#### Option B: Vercel

1. Go to [Vercel](https://vercel.com/) and create a free account.
2. Install the Vercel CLI: `npm i -g vercel`.
3. Navigate to the `web-form/` folder in your terminal.
4. Run `vercel` and follow the prompts.
5. Your site will be deployed with a `.vercel.app` URL.

#### Option C: GitHub Pages

1. Create a new GitHub repository.
2. Push the contents of `web-form/` to the repository.
3. Go to **Settings > Pages**.
4. Set the source to the `main` branch and root directory.
5. Your form will be live at `https://username.github.io/repo-name/`.

### 4.3 Verify

1. Open the deployed URL in your browser.
2. Enter the system PIN (configured in your n8n workflow or sheet).
3. Try each section (stock query, register purchase, etc.) to confirm connectivity.

---

## 5. Activating Workflows

Activate the workflows in this specific order to avoid dependency errors:

1. **Calcular materiales (BOM)** (`gOSSBXlULF40Kzle`) -- activate first, since other workflows call it as a subflow.
2. **Alerta stock bajo** (`ZG6FzguqWV4ZYjfx`) -- activate second.
3. **Reporte programado** (`s41vF8tWhGW4HhFM`).
4. **Formulario web webhook** (`gTpBGBCY41KyyHlx`).
5. **Bot Telegram** (`DorrTQwkg0gTh30x`) -- activate last.

### 5.1 Verification Checklist

After activating all workflows, run through these tests:

- [ ] **Telegram bot**: send `/start` to the bot. Confirm you see the main menu.
- [ ] **Stock query**: use the bot to query stock. It should return data from your Google Sheet (even if empty).
- [ ] **Register a test purchase**: register a purchase of 1 unit of any item. Confirm the stock updates in the Sheet.
- [ ] **Web form**: open the form, enter the PIN, and try a stock query.
- [ ] **Alert check**: if you have items with stock below the minimum, verify you receive an email alert.
- [ ] **Report**: manually trigger the Reporte programado workflow to confirm the email arrives.

### 5.2 Troubleshooting

| Problem | Likely cause | Solution |
|---|---|---|
| Bot does not respond | Webhook not set or workflow inactive | Check step 3.1, confirm workflow is active |
| "Not authorized" message | Telegram ID not in Usuarios_Autorizados | Check step 3.2, ensure ACTIVO = TRUE |
| Google Sheets errors in n8n | Missing credentials or wrong Sheet ID | Check steps 2.1 and 2.2 |
| Web form shows connection error | Wrong webhook URL or workflow inactive | Check steps 4.1 and 4.2, confirm workflow is active |
| No email alerts | Gmail credential missing or wrong email in Config | Check step 2.4, verify ALERTA_EMAIL in Config sheet |
| Subflow errors ("workflow not found") | Execute Workflow node pointing to wrong ID | Check step 2.5 |

---

## Summary of Required Credentials in n8n

| Credential | Type | Used by workflows |
|---|---|---|
| Google Sheets OAuth2 | Google Sheets OAuth2 API | All 5 workflows |
| Telegram Bot | Telegram API | Bot Telegram |
| Gmail | Gmail OAuth2 API | Alerta stock bajo, Reporte programado |

---

## Workflow Quick Reference

| Workflow | ID | Trigger | Description |
|---|---|---|---|
| Calcular materiales (BOM) | `gOSSBXlULF40Kzle` | Called by other workflows | Calculates materials needed for a furniture order |
| Alerta stock bajo | `ZG6FzguqWV4ZYjfx` | After stock consumption | Sends email if stock drops below minimum |
| Reporte programado | `s41vF8tWhGW4HhFM` | Cron (configurable) | Periodic stock report via email |
| Formulario web webhook | `gTpBGBCY41KyyHlx` | HTTP Webhook | Handles web form requests |
| Bot Telegram | `DorrTQwkg0gTh30x` | Telegram Webhook | Handles all Telegram bot interactions |
