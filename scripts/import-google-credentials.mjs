import { readFileSync, writeFileSync, existsSync } from "node:fs";

const credentialPath = process.argv[2];
if (!credentialPath) throw new Error("A Google credential JSON path is required.");

const json = JSON.parse(readFileSync(credentialPath, "utf8"));
const credential = json.installed ?? json.web;
if (!credential?.client_id || !credential?.client_secret) {
  throw new Error("That file does not contain a Google OAuth client ID and secret.");
}

const envPath = new URL("../.env", import.meta.url);
const examplePath = new URL("../.env.example", import.meta.url);
let env = readFileSync(existsSync(envPath) ? envPath : examplePath, "utf8");

function setValue(name, value) {
  const line = `${name}=${value}`;
  const matcher = new RegExp(`^${name}=.*$`, "m");
  env = matcher.test(env) ? env.replace(matcher, line) : `${env.trimEnd()}\n${line}\n`;
}

setValue("GOOGLE_CLIENT_ID", credential.client_id);
setValue("GOOGLE_CLIENT_SECRET", credential.client_secret);
writeFileSync(envPath, env, { mode: 0o600 });
console.log("Google client ID and secret were added to the private .env file.");
