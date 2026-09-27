import { runPartnerAutomation } from "./_partner-automation-core.mjs";

export default async () => {
  try {
    const result = await runPartnerAutomation({ source: "scheduled" });
    console.log("Partner automation run complete", result);
    return Response.json(result);
  } catch (error) {
    console.error("Partner automation scheduled run failed", error);
    return Response.json({ ok: false, error: error?.message || "Partner automation failed." }, { status: 500 });
  }
};

// 13:00 UTC = 9 AM Michigan during daylight time / 8 AM during standard time.
export const config = {
  schedule: "0 13 * * *",
};
