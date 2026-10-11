import { createClient } from '@supabase/supabase-js';

// The newsletter tables are private. Only this server-side function holds the key.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const commonHeaders = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff'
};
const reply = (status, payload) => new Response(JSON.stringify(payload), { status, headers: commonHeaders });
const accepted = () => reply(200, { ok: true, message: 'Thanks for stopping by! If this is a new address, you are in. 🐝' });

export default async function newsletterSignup(request) {
  if (request.method !== 'POST') return reply(405, { error: 'Use POST to subscribe.' });
  if (!(request.headers.get('content-type') || '').toLowerCase().includes('application/json')) {
    return reply(415, { error: 'Please send the signup form as JSON.' });
  }

  // Browser forms must submit from the site itself, not another site's page.
  const requestOrigin = new URL(request.url).origin;
  const origin = request.headers.get('origin');
  if (origin && origin !== requestOrigin) return reply(403, { error: 'Invalid form origin.' });

  let payload;
  try {
    const text = await request.text();
    if (text.length > 4096) return reply(413, { error: 'Signup details are too long.' });
    payload = JSON.parse(text);
  } catch {
    return reply(400, { error: 'Please check the form and try again.' });
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return reply(400, { error: 'Please check the form and try again.' });
  }
  // A hidden honeypot field catches basic automated form submissions.
  if (payload.website) return accepted();

  const name = typeof payload.name === 'string' ? payload.name.trim().replace(/\s+/g, ' ') : '';
  const email = typeof payload.email === 'string' ? payload.email.trim().toLowerCase() : '';
  if (!name || name.length > 150) return reply(400, { error: 'Please enter your name.' });
  if (!EMAIL_PATTERN.test(email) || email.length > 254) {
    return reply(400, { error: 'Please enter a valid email address.' });
  }
  if (payload.consent !== true) {
    return reply(400, { error: 'Please confirm that you would like to receive our emails.' });
  }

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('Beyond the Hive signup: database environment not configured.');
    return reply(503, { error: 'Signup is temporarily unavailable. Please try again soon.' });
  }

  try {
    const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    // INSERT only: never overwrite an existing subscriber or silently reactivate
    // a previously unsubscribed address. Return the same public response either way.
    const { error } = await client.from('nf_newsletter_contacts').insert({
      full_name: name,
      email,
      source: 'beyond_the_hive_web',
      consent_status: 'subscribed',
      consent_detail: 'Joined Beyond the Hive by checking the email consent box on the public Stories page.',
      consent_at: new Date().toISOString(),
      archived: false
    });
    if (error && error.code !== '23505') throw error;
    return accepted();
  } catch (error) {
    console.error('Beyond the Hive signup failed:', error?.code || 'unknown');
    return reply(503, { error: 'Signup is temporarily unavailable. Please try again soon.' });
  }
}
