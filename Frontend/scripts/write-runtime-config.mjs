import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const apiBaseUrl = (process.env.API_BASE_URL ?? "").trim().replace(/\/$/, "");
if (
  apiBaseUrl &&
  !/^https:\/\//i.test(apiBaseUrl) &&
  !/^http:\/\/localhost(?::\d+)?$/i.test(apiBaseUrl)
) {
  throw new Error("API_BASE_URL deve usar HTTPS (exceto localhost).");
}
const appMode = process.env.APP_MODE ?? "demo";
if (!["demo", "real"].includes(appMode))
  throw new Error("APP_MODE deve ser demo ou real.");
await writeFile(
  resolve(root, "public/runtime-config.js"),
  `window.EPI_ERP_CONFIG = ${JSON.stringify({ apiBaseUrl, appMode })};\n`,
  "utf8",
);
