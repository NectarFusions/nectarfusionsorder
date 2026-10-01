import { createClient } from "@supabase/supabase-js";

const SITE_URL = () => String(process.env.SITE_URL || "https://nectar-fusions.com").replace(/\/$/, "");
const APP_URL = () => `${SITE_URL()}/admin/operations?setup=password`;

const esc = (value) =>
  String(value ?? "").replace(/[<>&"]/g, (ch) => ({
    "<": "&lt;",
    ">": "&gt;",
    "&": "&amp;",
    '"': "&quot;",
  })[ch]);

const sha256Hex = async (value) => {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
};

const page = ({ title, body, form = "" }, status = 200) =>
  new Response(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="robots" content="noindex,nofollow,noarchive">
  <title>${esc(title)} · NectarFusions NFOS</title>
</head>
<body style="margin:0;background:#f5efe7;font-family:Arial,Helvetica,sans-serif;color:#17383d">
  <main style="min-height:100vh;display:grid;place-items:center;padding:24px">
    <section style="width:min(100%,520px);background:#fff;border:1px solid #e4ddd2;border-radius:16px;padding:28px;box-sizing:border-box">
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:22px">
        <div style="width:48px;height:48px;border-radius:50%;background:#e69b00;display:grid;place-items:center;font-weight:800;color:#17383d">NF</div>
        <div>
          <div style="font-weight:800;letter-spacing:.04em">NECTARFUSIONS</div>
          <div style="font-size:13px;color:#647477">Operations System</div>
        </div>
      </div>
      <h1 style="font-size:28px;margin:0 0 12px">${esc(title)}</h1>
      <div style="font-size:15px;line-height:1.7;color:#46585c">${body}</div>
      ${form}
    </section>
  </main>
</body>
</html>`, {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex, nofollow, noarchive",
      "Referrer-Policy": "no-referrer",
    },
  });

const getAdmin = () => {
  const url = String(process.env.SUPABASE_URL || "").trim();
  const serviceKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  if (!url || !serviceKey) return null;
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
};

const validateSetup = async (db, uid, token) => {
  if (!uid || !token) return { error: "This setup link is incomplete." };

  const { data, error } = await db.auth.admin.getUserById(uid);
  const user = data?.user;
  if (error || !user) return { error: "This NFOS setup link is no longer available." };

  const setup = user.app_metadata?.nfos_setup;
  if (!setup?.hash || !setup?.expires_at) {
    return { error: "This NFOS setup link has already been used or replaced." };
  }

  const expires = new Date(setup.expires_at).getTime();
  if (!Number.isFinite(expires) || expires <= Date.now()) {
    return { error: "This NFOS setup link has expired. Ask NectarFusions to send another setup email." };
  }

  const incomingHash = await sha256Hex(token);
  if (incomingHash !== setup.hash) return { error: "This NFOS setup link is invalid." };

  return { user };
};

export default async (request) => {
  const db = getAdmin();
  if (!db) {
    return page({
      title: "NFOS setup unavailable",
      body: "NectarFusions account setup is temporarily unavailable. Please contact your NFOS administrator.",
    }, 500);
  }

  if (request.method === "GET") {
    const url = new URL(request.url);
    const uid = String(url.searchParams.get("uid") || "").trim();
    const token = String(url.searchParams.get("token") || "").trim();
    const validation = await validateSetup(db, uid, token);

    if (validation.error) {
      return page({ title: "Setup link unavailable", body: esc(validation.error) }, 400);
    }

    return page({
      title: "Finish setting up NFOS",
      body: "Your secure setup link is ready. Press the button below to continue. This step protects your one-time sign-in link from email security scanners and link previews.",
      form: `
        <form method="post" action="/.netlify/functions/nfos-team-setup" style="margin-top:22px">
          <input type="hidden" name="uid" value="${esc(uid)}">
          <input type="hidden" name="token" value="${esc(token)}">
          <button type="submit" style="width:100%;border:0;border-radius:9px;background:#17383d;color:#fff;padding:13px 18px;font-size:16px;font-weight:700;cursor:pointer">
            Continue to NFOS
          </button>
        </form>
        <p style="font-size:12px;color:#758285;line-height:1.6;margin:14px 0 0">
          The next screen will ask you to create the password you&rsquo;ll use for future NFOS sign-ins.
        </p>`,
    });
  }

  if (request.method !== "POST") {
    return page({ title: "Method not allowed", body: "Use the secure setup button from your NectarFusions email." }, 405);
  }

  let uid = "";
  let token = "";
  const contentType = String(request.headers.get("content-type") || "");

  if (contentType.includes("application/json")) {
    const body = await request.json().catch(() => ({}));
    uid = String(body?.uid || "").trim();
    token = String(body?.token || "").trim();
  } else {
    const form = await request.formData();
    uid = String(form.get("uid") || "").trim();
    token = String(form.get("token") || "").trim();
  }

  const validation = await validateSetup(db, uid, token);
  if (validation.error) {
    return page({ title: "Setup link unavailable", body: esc(validation.error) }, 400);
  }

  const user = validation.user;
  if (!user.email) {
    return page({ title: "NFOS setup unavailable", body: "This account does not have an email address." }, 400);
  }

  const linkType = user.email_confirmed_at ? "recovery" : "magiclink";
  const { data: linkData, error: linkError } = await db.auth.admin.generateLink({
    type: linkType,
    email: user.email,
    options: {
      redirectTo: APP_URL(),
      data: { ...(user.user_metadata || {}), nfos_invited: true },
    },
  });

  const actionLink = linkData?.properties?.action_link;
  if (linkError || !actionLink) {
    return page({
      title: "Could not continue",
      body: esc(linkError?.message || "A fresh NFOS sign-in link could not be created. Ask NectarFusions to resend your setup email."),
    }, 400);
  }

  await db.auth.admin.updateUserById(user.id, {
    app_metadata: { ...(user.app_metadata || {}), nfos_setup: null },
  });

  return new Response(null, {
    status: 303,
    headers: {
      Location: actionLink,
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
    },
  });
};
