import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const password = process.env.VIV_ACCESS_PASSWORD_INPUT ?? "";
if (password.length < 10) {
  console.error("please choose a password with at least 10 characters.");
  process.exit(1);
}

const envPath = process.env.SETUP_ENV_PATH || new URL("../.env", import.meta.url);
const examplePath = new URL("../.env.example", import.meta.url);
let env = readFileSync(existsSync(envPath) ? envPath : examplePath, "utf8");

const values = {
  VIV_ACCESS_PASSWORD: JSON.stringify(password),
  VIV_SESSION_SECRET: randomBytes(32).toString("hex"),
  VIV_SESSION_DAYS: "30"
};

for (const [name, value] of Object.entries(values)) {
  const line = `${name}=${value}`;
  const pattern = new RegExp(`^${name}=.*$`, "m");
  env = pattern.test(env) ? env.replace(pattern, line) : `${env.trimEnd()}\n${line}\n`;
}

writeFileSync(envPath, env, { mode: 0o600 });
console.log("your private web password was saved securely to .env.");
