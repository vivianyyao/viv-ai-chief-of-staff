import { existsSync, readFileSync, writeFileSync } from "node:fs";

const token = process.env.TWILIO_AUTH_TOKEN_INPUT;
if (!token) throw new Error("No Twilio Auth Token was provided.");

const defaultEnvUrl = new URL("../.env", import.meta.url);
const envPath = process.env.SETUP_ENV_PATH || defaultEnvUrl;
const exampleUrl = new URL("../.env.example", import.meta.url);
let env = readFileSync(existsSync(envPath) ? envPath : exampleUrl, "utf8");
const tokenLine = `TWILIO_AUTH_TOKEN=${token}`;
env = /^TWILIO_AUTH_TOKEN=.*$/m.test(env)
  ? env.replace(/^TWILIO_AUTH_TOKEN=.*$/m, tokenLine)
  : `${env.trimEnd()}\n${tokenLine}\n`;
writeFileSync(envPath, env, { mode: 0o600 });
console.log("Twilio Auth Token saved privately to .env.");
