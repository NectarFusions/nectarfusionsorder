import { ok, bad } from "./_square.mjs";
import { onlineCheckoutQuote } from "./_checkout-fee.mjs";

export default async (req) => {
  if (req.method !== "POST") {
    return bad("POST only", 405);
  }

  let baseCents;

  try {
    ({ baseCents } = await req.json());
  } catch {
    return bad("Bad JSON");
  }

  const amount = Number(baseCents);

  if (!Number.isFinite(amount) || amount < 0) {
    return bad("A valid checkout amount is required.");
  }

  return ok(onlineCheckoutQuote(amount));
};
