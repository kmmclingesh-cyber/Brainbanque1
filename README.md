# Brainbanque Office Manager

In-house office software for daily tasks, development tracking, client management, and document records.

This project is a static browser app backed by Google Sheets and Google Drive through Google Apps Script.

## What It Includes

- Daily task board
- Development/project tracker
- Client management
- Document collection register
- CSV export downloads
- Optional Google Sheets sync through an Apps Script Web App
- Optional Google Drive document upload support through Apps Script

## Quick Start

Open `index.html` in your browser.

## Connected Google Links

- Google Sheet: `https://docs.google.com/spreadsheets/d/1l9TuPj5p0s0LM-8tkF5pytBEsQscoF7mQQiOijgrhVU/edit?gid=0#gid=0`
- Google Drive database folder: `https://drive.google.com/drive/folders/1QaJy5Zz9yDimQ1MfiRPD-Rp_HG9WNFx0`
- Apps Script project: `https://script.google.com/u/0/home/projects/1iYDGQR0dfWf9HXAd57EAKHJH-r8Sd3fqrqx2y_xmAIUKBQzmZVqi2C8w/edit`
- Apps Script Web App: `https://script.google.com/macros/s/AKfycbyIU-9t4Q9mGdNiwRye5QzK9CuT0fxmXmjfESDu6dGm9Qgsn2TmRpMmXyadkbboYSTo/exec`

The app works locally first using browser storage. To connect Google Sheets and Drive:

1. Create a Google Sheet.
2. Create four tabs named:
   - `Tasks`
   - `Development`
   - `Clients`
   - `Documents`
3. Create a Google Drive folder for collected documents.
4. Open Google Apps Script from the Google Sheet.
5. Paste the code from `google-apps-script/Code.gs`.
6. Optional: set these script properties if you want to override the built-in defaults:
   - `SPREADSHEET_ID`: your Google Sheet ID
   - `DRIVE_FOLDER_ID`: your Google Drive folder ID
7. Deploy as a Web App.
   - Execute as: `Me`
   - Who has access: choose based on your office policy
8. Copy the Web App URL into the app settings.

## Suggested Sheet Columns

The Apps Script creates and maintains the expected headers automatically if the sheets exist.

## Notes

For private office data, restrict the Apps Script Web App to your Google Workspace users where possible.
