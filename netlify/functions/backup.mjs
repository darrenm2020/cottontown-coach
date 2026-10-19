import { getStore } from "@netlify/blobs";
import { takeBackup } from "../lib/core.mjs";

// Nightly snapshot of all club data (see takeBackup). Admins can download a backup or restore one game from it.
export default async () => {
  const date = await takeBackup(getStore({ name: "cottontown", consistency: "strong" }));
  return new Response("backup " + date);
};

export const config = { schedule: "@daily" };
