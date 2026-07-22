import "dotenv/config";
import { createServer } from "node:http";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { google } from "googleapis";

const clientId = process.env.GOOGLE_CLIENT_ID;
const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
if (!clientId || !clientSecret) throw new Error("Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env first");
const redirectUri = "http://localhost:3333/oauth2callback";
const oauth = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
const url = oauth.generateAuthUrl({
  access_type: "offline", prompt: "consent",
  scope: ["https://www.googleapis.com/auth/calendar.freebusy"]
});
console.log(`Open this URL in your browser:\n\n${url}\n`);

const server = createServer(async (req, res) => {
  if (!req.url?.startsWith("/oauth2callback")) return;
  try {
    const code = new URL(req.url, redirectUri).searchParams.get("code");
    if (!code) throw new Error("Missing authorization code");
    const { tokens } = await oauth.getToken(code);
    if (!tokens.refresh_token) throw new Error("Google did not return a refresh token. Remove the app from your Google Account connections, then try again.");
    const envUrl = new URL("../.env", import.meta.url);
    const exampleUrl = new URL("../.env.example", import.meta.url);
    let env = readFileSync(existsSync(envUrl) ? envUrl : exampleUrl, "utf8");
    const tokenLine = `GOOGLE_REFRESH_TOKEN=${tokens.refresh_token}`;
    env = /^GOOGLE_REFRESH_TOKEN=.*$/m.test(env)
      ? env.replace(/^GOOGLE_REFRESH_TOKEN=.*$/m, tokenLine)
      : `${env.trimEnd()}\n${tokenLine}\n`;
    writeFileSync(envUrl, env, { mode: 0o600 });
    res.end("Google Calendar connected. You can close this tab.");
    console.log("\nGoogle Calendar connected. The private token was saved directly to .env.");
  } catch (error) {
    res.statusCode = 500; res.end("Authorization failed"); console.error(error);
  } finally { server.close(); }
});
server.listen(3333);
