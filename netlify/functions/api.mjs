import { getStore } from "@netlify/blobs";
import { handle } from "../lib/core.mjs";

// All of the app's data goes through /api/state (see lib/core.mjs for what each request does).
const env = () => {
  const get = (k) => globalThis.Netlify?.env?.get?.(k) ?? process.env[k] ?? "";
  return Object.fromEntries(["COACH_CODE", "AUTH_REQUIRED", "RESEND_API_KEY", "MAIL_FROM", "SITE_URL", "DEV_SHOW_LINK"].map((k) => [k, get(k)]));
};

export default async (req) => handle(req, { store: getStore({ name: "cottontown", consistency: "strong" }), env: env() });

export const config = { path: "/api/state" };
