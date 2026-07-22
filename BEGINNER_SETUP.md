# Beginner setup guide

This guide assumes you have never used developer tools. You do not need to understand the code. Follow one section at a time and stop at each checkpoint.

## A few plain-English definitions

- **Terminal**: a Mac app where you type a command instead of clicking a button.
- **API key**: a secret password that lets this app use another company's service.
- **Environment variable**: a labeled box for a setting or secret, such as `ANTHROPIC_API_KEY`.
- **Webhook**: the public web address Twilio contacts when your phone number receives a text.
- **OAuth**: Google's permission screen that lets you approve read-only calendar access without giving the app your Google password.
- **Hosting**: a computer on the internet that keeps the app running so Twilio can reach it.

Never paste a key, secret, token, or password into GitHub, a screenshot, an email, or a chat message.

## What the app currently does

When the real app is connected, the path is:

1. You text a task to your Twilio number.
2. Twilio passes the text to this app.
3. Claude interprets the title, length, and any timing clues.
4. Google Calendar reports which times are busy.
5. The app chooses the first suitable open weekday time.
6. Twilio returns a text containing that suggestion.

The app reads availability only. It never creates a calendar event.

## What it does not do

It does not book events, send reminders, store task history, handle several users, manage several calendars, or carry on a confirmation conversation. The local experience uses sample reasoning and a sample schedule. It does not contact Claude, Google, or Twilio.

## Accounts you will eventually need

You do **not** need any of these for the local Viv experience.

| Account | Website | Why it is needed | Possible cost |
|---|---|---|---|
| Anthropic Console | https://console.anthropic.com | Claude interprets each text | API usage requires prepaid credits |
| Twilio | https://www.twilio.com/try-twilio | Provides the phone number and texts | Phone number and messaging can cost money |
| Google account / Google Cloud | https://console.cloud.google.com | Gives read-only access to your Google Calendar | Usually no charge for this small MVP |
| GitHub | https://github.com/signup | Holds the app so Render can access it | Free account is sufficient |
| Render | https://dashboard.render.com/register | Keeps the app online for Twilio | Plans and free-tier availability can change |

Do not buy, deploy, or connect anything until you have tried Viv locally.

# Phase 1 — try Viv locally

## Step 1: open Terminal

1. On your Mac, press **Command + Space**.
2. Type `Terminal`.
3. Click the **Terminal** app in the results.

You will see a small window with a blinking cursor. That means it worked.

## Step 2: open the project folder in Terminal

Copy the entire line below:

```bash
cd "/Users/vivianyao/Documents/ai daily planner"
```

Click the Terminal window, paste with **Command + V**, and press **Return**.

How to confirm: Terminal should show another prompt and no red error text.

## Step 3: start Viv

Copy and run:

```bash
npm run demo
```

What should happen: Terminal shows `Viv is ready`. Open Safari and paste `http://127.0.0.1:3000` into the address bar. The page is titled **Viv · Your AI Chief of Staff**.

On the page, leave the sample task in place and click **Find a time**.

How to confirm: click **Find a time** and watch Viv think through the request. You should see **How Viv Thought** and a recommendation with confidence, reasons, and preview-only action buttons. No outside service was contacted.

To stop Viv, return to Terminal, hold **Control**, and press **C** once.

# Phase 2 — prepare the accounts later

Only continue after Viv works locally. These instructions prepare the real app; they do not ask you to deploy or send a text yet.

## Step 4: create the private settings file

Open Terminal, return to the project folder using the `cd` command from Step 2, then run:

```bash
cp .env.example .env && open -e .env
```

This creates a private `.env` settings file and opens it in TextEdit. The `.gitignore` file blocks `.env`, Google credential files, tokens, private keys, installed packages, and built files from GitHub.

How to confirm: TextEdit opens a file containing labels such as `ANTHROPIC_API_KEY=`. Leave it open. You will paste values there later. Do not change `.env.example`.

## Step 5: create an Anthropic API key

Website: https://console.anthropic.com

1. Click **Sign up** if you do not have an account, or **Log in**.
2. Complete the email and phone verification shown by Anthropic.
3. In the left menu, click **Settings**, then **API Keys**.
4. Click **Create Key**.
5. Name it `text-to-timeblock` and click **Create Key**.
6. Click **Copy Key** immediately. This is the only value you need from this screen.
7. In the `.env` file open in TextEdit, find `ANTHROPIC_API_KEY=your_anthropic_api_key_here`.
8. Replace only `your_anthropic_api_key_here` with the copied key. Keep `ANTHROPIC_API_KEY=` in place.
9. Press **Command + S**.

Anthropic currently requires API usage credits. In the Console, open **Settings → Billing**, click **Buy credits**, and review the amount before making any future purchase. Do not purchase anything as part of this setup pass.

How to confirm later: the API Keys page lists `text-to-timeblock`. Never paste the key into this guide or GitHub.

## Step 6: create a Google Cloud project

Website: https://console.cloud.google.com

1. Sign in with the Google account whose calendar you eventually want the app to read.
2. At the very top, click the current project name, then click **New Project**.
3. In **Project name**, type `Text to Timeblock`.
4. Click **Create**.
5. Wait for the notification, then use the top project picker to select **Text to Timeblock**.

How to confirm: the top bar shows **Text to Timeblock** as the selected project.

## Step 7: enable Google Calendar API

Website: https://console.cloud.google.com/apis/library/calendar-json.googleapis.com

1. Confirm **Text to Timeblock** appears in the top project picker.
2. Click **Enable**.

How to confirm: the page changes to show **Manage** instead of **Enable**.

## Step 8: configure Google's permission screen

Website: https://console.cloud.google.com/auth/branding

1. If you see **Get started**, click it.
2. For **App name**, enter `Text to Timeblock`.
3. For **User support email**, choose your own email address.
4. Click **Next**.
5. Choose **External** for the audience, then click **Next**.
6. Enter your email under **Contact information**, accept Google's policy checkbox, and click **Create**.
7. In the left menu, click **Audience**. Under **Test users**, click **Add users**, enter the same Google email, then click **Save**.

How to confirm: the Branding page shows the app name, and the Audience page lists your email as a test user.

## Step 9: create Google OAuth credentials

Website: https://console.cloud.google.com/auth/clients

1. Click **Create Client**.
2. For **Application type**, choose **Desktop app**.
3. For **Name**, enter `Text to Timeblock local setup`.
4. Click **Create**.
5. Copy the displayed **Client ID**.
6. In `.env`, replace `your_google_oauth_client_id_here` after `GOOGLE_CLIENT_ID=` with that value.
7. Return to Google, copy **Client secret**.
8. In `.env`, replace `your_google_oauth_client_secret_here` after `GOOGLE_CLIENT_SECRET=` with that value.
9. Save the file with **Command + S**.

How to confirm: Google Auth Platform → **Clients** lists `Text to Timeblock local setup`, and both Google lines in `.env` no longer contain `your_..._here`.

## Step 10: approve read-only calendar access

In Terminal, from the project folder, run:

```bash
npm run google:auth
```

1. Terminal prints a long web address beginning with `https://accounts.google.com`. Copy the entire address and paste it into Safari.
2. Choose the same Google account you added as a test user.
3. Google may say the app has not been verified. Click **Advanced**, then **Go to Text to Timeblock (unsafe)**. This warning is expected for your private test app.
4. Review the calendar availability permission and click **Continue** or **Allow**.
5. The browser should say **Google Calendar connected**.
6. Return to Terminal. Copy only the value printed after `GOOGLE_REFRESH_TOKEN=`.
7. In `.env`, replace `your_google_refresh_token_here` with that copied value, then save.

How to confirm: the browser says the calendar is connected and your `.env` has a long refresh-token value. The permission is limited to free/busy availability; it cannot create calendar events.

## Step 11: create a Twilio account without buying yet

Website: https://www.twilio.com/try-twilio

1. Enter your name, email, and a new password, then click **Start your free trial** or the equivalent sign-up button.
2. Verify your email and phone number when prompted.
3. In the Twilio Console, scroll to **Account Info** on the dashboard.
4. Find **Auth Token**, click **Show**, then click the copy icon.
5. In `.env`, replace `your_twilio_auth_token_here` after `TWILIO_AUTH_TOKEN=` with this copied value and save.

How to confirm: the Twilio Console dashboard opens and your `.env` has a value after `TWILIO_AUTH_TOKEN=`. Do not buy a phone number yet.

Later, after hosting is ready, Twilio's usual number path is **Phone Numbers → Manage → Buy a number**. Choose a number with **SMS** capability and review all costs and local messaging rules before purchase.

## Step 12: create GitHub and Render accounts without deploying

GitHub website: https://github.com/signup

1. Enter your email, create a password and username, and complete verification.
2. Confirm the verification email from GitHub.

How to confirm: https://github.com shows your avatar in the upper-right corner.

Render website: https://dashboard.render.com/register

1. Click **GitHub** to sign up with your GitHub account.
2. On GitHub's permission screen, review the request and click **Authorize Render**.
3. Return to Render when authorization finishes.

How to confirm: you see the Render dashboard. Stop here—do not click **New Web Service** yet.

# Phase 3 — hosting and real texting, intentionally postponed

Do not perform this phase yet. It will make the app public and may lead to charges.

When you explicitly decide to continue, the remaining actions will be:

1. Put the project into a private GitHub repository.
2. In Render, choose **New → Web Service**, connect that repository, use `npm install && npm run build` as the build command and `npm start` as the start command.
3. In Render's **Environment** page, use **Add from .env** to add the private values; never upload `.env` to GitHub.
4. Copy the resulting `https://...onrender.com` address into `PUBLIC_BASE_URL` in Render.
5. Buy an SMS-capable Twilio number only after reviewing its price and applicable messaging-registration rules.
6. In Twilio, open **Phone Numbers → Manage → Active numbers → your number → Messaging**. Under **A message comes in**, choose **Webhook**, paste `https://YOUR-RENDER-ADDRESS/sms`, choose **HTTP POST**, and click **Save configuration**.
7. Send one controlled test text and check the Twilio and Render logs.

No part of the current app creates Google Calendar events.

## Complete environment-variable checklist

The checked-in `.env.example` contains every setting:

- `ANTHROPIC_API_KEY`: secret copied from Anthropic Console.
- `ANTHROPIC_MODEL`: Claude model name; a default is supplied.
- `GOOGLE_CLIENT_ID`: copied from the Google OAuth client.
- `GOOGLE_CLIENT_SECRET`: copied from the Google OAuth client.
- `GOOGLE_REFRESH_TOKEN`: printed by `npm run google:auth` after approval.
- `GOOGLE_CALENDAR_ID`: `primary` means your main Google Calendar.
- `TIME_ZONE`: the calendar and scheduling timezone.
- `WORKDAY_START`: earliest suggested time, using 24-hour time.
- `WORKDAY_END`: latest end time, using 24-hour time.
- `SEARCH_DAYS`: how many days to search.
- `TWILIO_AUTH_TOKEN`: copied from Twilio Account Info; used to verify real webhooks.
- `PUBLIC_BASE_URL`: the future Render address, with no slash at the end.
- `PORT`: local web-server number; Render supplies its own value.

## If Viv does not start

- If Terminal says `command not found: npm`, Node.js is not installed. Open https://nodejs.org/en/download, choose **macOS Installer (.pkg)** under the **LTS** version, open the downloaded installer, click **Continue → Continue → Agree → Install**, then close and reopen Terminal. Confirm by running `node --version`; it should print a version rather than an error.
- If Terminal says port 3000 is already in use, close other Terminal windows that may be running Viv, or restart the Mac and try again.
- If the page is blank, refresh Safari once and confirm Terminal still says `Viv is ready`.
