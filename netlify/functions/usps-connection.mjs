// NectarFusions USPS developer connection diagnostic.
// OAuth test only: NEVER creates a label, charges postage, or exposes USPS credentials.
import { createClient } from "@supabase/supabase-js";

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
});

export default async function handler(request) {
  if (request.method !== "POST") return json({ error: "POST required." }, 405);

  const accessToken = request.headers.get("authorization")?.match(/^Bearer\s+(\S+)$/i)?.[1];
  if (!accessToken) return json({ error: "Sign in to the NectarFusions Admin Back Room first." }, 401);

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseServiceKey) return json({ error: "Server authentication configuration is incomplete." }, 503);

  try {
    // Never trust the caller's user ID or any role from request data.
    const service = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: userData, error: authError } = await service.auth.getUser(accessToken);
    if (authError || !userData?.user) return json({ error: "Your admin session has expired. Please sign in again." }, 401);

    const { data: admin, error: adminError } = await service.from("admins")
      .select("user_id").eq("user_id", userData.user.id).maybeSingle();
    if (adminError || !admin) return json({ error: "Only NectarFusions admins may test the USPS connection." }, 403);

    const clientId = process.env.USPS_CLIENT_ID || process.env.USPS_CONSUMER_KEY;
    const clientSecret = process.env.USPS_CLIENT_SECRET || process.env.USPS_CONSUMER_SECRET;
    const environment = process.env.USPS_ENVIRONMENT === "production" ? "production" : "test";
    if (!clientId || !clientSecret) {
      const missing = [
        ...(!clientId ? ["USPS_CLIENT_ID"] : []),
        ...(!clientSecret ? ["USPS_CLIENT_SECRET"] : []),
      ];
      return json({ status: "setup_required", environment, missing,
        message: "Add the USPS application credentials to Netlify Environment variables and redeploy." });
    }

    const baseUrl = environment === "production" ? "https://apis.usps.com" : "https://apis-tem.usps.com";
    const abort = new AbortController();
    const timeout = setTimeout(() => abort.abort(), 12000);
    let uspsResponse;
    try {
      uspsResponse = await fetch(`${baseUrl}/oauth2/v3/token`, {
        method: "POST",
        signal: abort.signal,
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ grant_type: "client_credentials", client_id: clientId, client_secret: clientSecret }),
      });
    } catch (error) {
      return json({ status: "connection_failed", environment,
        message: error?.name === "AbortError" ? "USPS did not respond within 12 seconds." : "The USPS authentication service could not be reached." }, 502);
    } finally { clearTimeout(timeout); }

    if (!uspsResponse.ok) {
      // Don't echo USPS response bodies; they can contain credentials or token context.
      return json({ status: "connection_failed", environment, httpStatus: uspsResponse.status,
        message: uspsResponse.status === 401 || uspsResponse.status === 403
          ? "USPS rejected the application credentials or has not authorized this access. Check your app and approval status."
          : `USPS authentication returned HTTP ${uspsResponse.status}.` }, 502);
    }

    const responseBody = await uspsResponse.json().catch(() => null);
    if (typeof responseBody?.access_token !== "string" || !responseBody.access_token) {
      return json({ status: "connection_failed", environment, message: "USPS did not return a valid OAuth access token." }, 502);
    }

    // Return only nonsecret connection metadata; NEVER send the token to the browser.
    const scopes = String(responseBody.scope || "").split(/\s+/).filter(Boolean);
    return json({ status: "authenticated", environment, scopes,
      message: "USPS developer authentication succeeded. No postage was purchased.",
      note: "Successful OAuth authentication does not verify USPS Ship enrollment, Labels API approval, or your Enterprise Payment Account." });
  } catch {
    return json({ error: "Could not complete the secure USPS connection check." }, 500);
  }
}
