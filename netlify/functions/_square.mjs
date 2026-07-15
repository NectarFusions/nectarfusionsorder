/* Shared bits for every Square function.
   Raw fetch, not the SDK — fewer moving parts, and the SDK's
   BigInt money handling causes more trouble than it saves. */

import { createClient } from "@supabase/supabase-js";

export const SQUARE_VERSION = "2026-05-20";

export const squareBase = () =>
  process.env.SQUARE_ENV === "production"
    ? "https://connect.squareup.com"
    : "https://connect.squareupsandbox.com";

export async function square(path, { method = "POST", body } = {}) {
  const res = await fetch(`${squareBase()}${path}`, {
    method,
    headers: {
      "Square-Version": SQUARE_VERSION,
      Authorization: `Bearer ${process.env.SQUARE_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  let json;
  try { json = text ? JSON.parse(text) : {}; } catch { json = { raw: text }; }

  if (!res.ok) {
    const token = process.env.SQUARE_ACCESS_TOKEN || "";
    console.error("Square request diagnostics:", {
      square_env: process.env.SQUARE_ENV ?? "(missing)",
      square_base: squareBase(),
      token_length: token.length,
      token_suffix: token ? token.slice(-4) : "(missing)",
      path,
      status: res.status,
    });

    const detail = json?.errors?.map((e) => `${e.code}: ${e.detail}`).join("; ") || text;
    throw new Error(`Square ${res.status} — ${detail}`);
  }
  return json;
}

export const db = () =>
  createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

export const idem = () => crypto.randomUUID();

export const site = () => (process.env.SITE_URL || "").replace(/\/$/, "");

export const ok = (b) => new Response(JSON.stringify(b), {
  status: 200, headers: { "Content-Type": "application/json" },
});

export const bad = (msg, status = 400) => new Response(JSON.stringify({ error: msg }), {
  status, headers: { "Content-Type": "application/json" },
});
