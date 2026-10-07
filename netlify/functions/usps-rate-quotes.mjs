// Admin-only, read-only USPS domestic rate quotes. NEVER buys postage or generates a label.
import { createClient } from '@supabase/supabase-js';
import { zip5, validPackage, makeRateRequest, pickComparableQuotes, STANDARD_CLASSES } from './_usps-rate-utils.mjs';

const respond = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
});

async function postToUsps(baseUrl, bearer, body) {
  const abort = new AbortController();
  const timeout = setTimeout(() => abort.abort(), 12000);
  try {
    const response = await fetch(`${baseUrl}/prices/v3/total-rates/search`, {
      method: 'POST', signal: abort.signal,
      headers: { Authorization: `Bearer ${bearer}`, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
    });
    const data = response.ok ? await response.json().catch(() => null) : null;
    return { status: response.status, data };
  } finally { clearTimeout(timeout); }
}

export default async function handler(request) {
  if (request.method !== 'POST') return respond({ error: 'POST only.' }, 405);
  const userToken = request.headers.get('authorization')?.match(/^Bearer\s+(\S+)$/i)?.[1];
  if (!userToken) return respond({ error: 'Please sign in as a NectarFusions admin.' }, 401);
  const supabaseURL = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseURL || !supabaseKey) return respond({ error: 'Server authentication is not configured.' }, 503);

  try {
    const service = createClient(supabaseURL, supabaseKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: auth, error: authError } = await service.auth.getUser(userToken);
    if (authError || !auth?.user) return respond({ error: 'Admin session expired. Sign in again.' }, 401);
    const { data: admin, error: adminError } = await service.from('admins')
      .select('user_id').eq('user_id', auth.user.id).maybeSingle();
    if (adminError || !admin) return respond({ error: 'Admin access required.' }, 403);

    const body = await request.json().catch(() => null);
    if (!body || typeof body.orderId !== 'string' || !/^[0-9a-f-]{36}$/i.test(body.orderId)) {
      return respond({ error: 'Select a valid shipping order.' }, 400);
    }
    const pkg = validPackage(body);
    const originZIPCode = zip5(body.originZIP);
    if (!originZIPCode) return respond({ error: 'Enter the five-digit ZIP where the package is mailed.' }, 400);

    // Destination is fetched from our database, not accepted from the browser.
    const { data: order, error: orderError } = await service.from('orders')
      .select('id,method,status,zip,paid,requires_prepay').eq('id', body.orderId).maybeSingle();
    if (orderError || !order || order.method !== 'ship' || order.status === 'cancelled') {
      return respond({ error: 'Shipping order not found.' }, 404);
    }
    const destinationZIPCode = zip5(order.zip);
    if (!destinationZIPCode) return respond({ error: 'The order needs a valid US destination ZIP Code.' }, 400);
    if (originZIPCode === destinationZIPCode) {
      // Same ZIP is valid for USPS domestic postage; do not reject.
    }

    const clientId = process.env.USPS_CLIENT_ID || process.env.USPS_CONSUMER_KEY;
    const clientSecret = process.env.USPS_CLIENT_SECRET || process.env.USPS_CONSUMER_SECRET;
    if (!clientId || !clientSecret) return respond({ error: 'Add USPS developer credentials in Netlify.' }, 503);
    const environment = process.env.USPS_ENVIRONMENT === 'production' ? 'production' : 'test';
    const baseUrl = environment === 'production' ? 'https://apis.usps.com' : 'https://apis-tem.usps.com';

    const tokenAbort = new AbortController();
    const tokenTimeout = setTimeout(() => tokenAbort.abort(), 12000);
    let tokenResponse;
    try {
      tokenResponse = await fetch(`${baseUrl}/oauth2/v3/token`, {
        method: 'POST', signal: tokenAbort.signal,
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, grant_type: 'client_credentials' }),
      });
    } finally { clearTimeout(tokenTimeout); }
    if (!tokenResponse.ok) return respond({ error: `USPS authentication failed (HTTP ${tokenResponse.status}).` }, 502);
    const token = await tokenResponse.json().catch(() => null);
    if (!token?.access_token || typeof token.access_token !== 'string') {
      return respond({ error: 'USPS did not issue a usable access token.' }, 502);
    }

    let reply = await postToUsps(baseUrl, token.access_token,
      makeRateRequest(originZIPCode, destinationZIPCode, pkg));
    let quotes = reply.status === 200 ? pickComparableQuotes(reply.data) : [];
    const failures = [];
    // USPS installations sometimes require a specific mailClass instead of ALL.
    // Fall back only for invalid/empty combined searches, never for auth or server failures.
    if (reply.status === 400 || (reply.status === 200 && !quotes.length)) {
      for (const mailClass of Object.keys(STANDARD_CLASSES)) {
        const single = await postToUsps(baseUrl, token.access_token,
          makeRateRequest(originZIPCode, destinationZIPCode, pkg, mailClass));
        if (single.status === 200) quotes.push(...pickComparableQuotes(single.data));
        else failures.push({ service: STANDARD_CLASSES[mailClass], status: single.status });
      }
      const bestByClass = new Map();
      for (const q of quotes) {
        if (!bestByClass.has(q.mailClass) || q.price < bestByClass.get(q.mailClass).price) bestByClass.set(q.mailClass, q);
      }
      quotes = [...bestByClass.values()].sort((a, b) => a.price - b.price);
    } else if (reply.status !== 200) {
      return respond({ error: reply.status === 401 || reply.status === 403
        ? 'USPS has not authorized Domestic Prices API access for this app/environment.'
        : `USPS rates service returned HTTP ${reply.status}.`, environment }, 502);
    }

    return respond({
      ok: true, environment, originZIP: originZIPCode, destinationZIP: destinationZIPCode,
      package: pkg, priceTypeRequested: 'COMMERCIAL',
      quotes, unavailable: Object.values(STANDARD_CLASSES).filter(s => !quotes.some(q => q.service === s)),
      notices: failures.map(({service, status}) => `${service}: USPS HTTP ${status}`),
      caveat: environment === 'test'
        ? 'USPS TESTING prices only. These are not production postage offers and cannot be purchased.'
        : 'Commercial API quotes for ordinary shipper-supplied boxes, before optional extras; final payable postage may vary. Click-N-Ship Business Rate Card prices are not included.',
    });
  } catch (error) {
    if (error?.name === 'AbortError') return respond({ error: 'USPS timed out. Try the comparison again.' }, 504);
    if (error?.message && /USPS package|Enter|length-plus-girth/i.test(error.message)) {
      return respond({ error: error.message }, 400);
    }
    return respond({ error: 'Rate comparison could not be completed. Check your inputs and try again.' }, 500);
  }
}
