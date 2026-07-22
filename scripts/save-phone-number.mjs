import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";

const prompt = createInterface({ input: stdin, output: stdout });
const phone = (await prompt.question("enter your phone number with country code (example: +14155550123): ")).trim();
prompt.close();
if (!/^\+[1-9]\d{7,14}$/.test(phone)) {
  console.error("that number is not in the expected format. include + and the country code.");
  process.exit(1);
}

const defaultEnvUrl = new URL("../.env", import.meta.url);
const envPath = process.env.SETUP_ENV_PATH || defaultEnvUrl;
const exampleUrl = new URL("../.env.example", import.meta.url);
let env = readFileSync(existsSync(envPath) ? envPath : exampleUrl, "utf8");
const phoneLine = `ALLOWED_PHONE_NUMBER=${phone}`;
env = /^ALLOWED_PHONE_NUMBER=.*$/m.test(env)
  ? env.replace(/^ALLOWED_PHONE_NUMBER=.*$/m, phoneLine)
  : `${env.trimEnd()}\n${phoneLine}\n`;
writeFileSync(envPath, env, { mode: 0o600 });
console.log("your phone number was saved privately to .env.");
