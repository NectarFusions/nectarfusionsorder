// An authenticated admin may manually send ONE fulfillment notice per order/event.
// All customer/order details are retrieved server-side. No storefront access.
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';

const FROM = 'NectarFusions <orders@nectar-fusions.com>';
const PHONE = '(989) 941-6385';
const esc = value => String(value ?? '').replace(/[<>&"]/g, char => ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;'}[char]));
const response = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: {'Content-Type':'application/json','Cache-Control':'no-store'},
});
const isUuid = value => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(value || ''));

function htmlEmail(order, kind) {
  const localDelivery = kind === 'out_for_delivery';
  const heading = localDelivery ? 'Your honey is out for delivery!' : 'Your honey is on its way!';
  const message = localDelivery
    ? `Your NectarFusions order <strong>#${esc(order.order_no)}</strong> is out for local delivery. Our team is on its way to you!`
    : `Your NectarFusions order <strong>#${esc(order.order_no)}</strong> has shipped and is on its way to you!`;
  return `<div style="background:#F5EFE7;padding:28px 14px;font-family:Arial,Helvetica,sans-serif;color:#1B1005">
    <div style="max-width:560px;margin:auto;background:#FFFFFF;border:1px solid #E7DCC9;border-radius:14px;overflow:hidden">
      <div style="padding:26px 24px;text-align:center;border-bottom:2px solid #F2C94C">
        <div style="font-size:12px;font-weight:800;letter-spacing:.12em;color:#926214;text-transform:uppercase">NectarFusions · Nature's Happiness</div>
        <h1 style="margin:12px 0 0;font-size:27px;line-height:1.25;color:#4A3313">${heading}</h1>
      </div>
      <div style="padding:26px 24px;font-size:16px;line-height:1.7">
        <p style="margin-top:0">Hello ${esc(String(order.name || 'there').trim().split(/\s+/)[0])},</p>
        <p>${message}</p>
        <p>If you have any questions, please call or text NectarFusions at <a style="font-weight:bold;color:#174A68;white-space:nowrap" href="tel:+19899416385">${PHONE}</a>.</p>
        <p style="margin-bottom:0">Thank you for supporting NectarFusions! 🐝</p>
      </div>
      <div style="padding:17px 24px;background:#FBF7F1;text-align:center;color:#74644D;font-size:13px">NectarFusions · Coleman, Michigan</div>
    </div>
  </div>`;
}

export default async function handler(req) {
  if (!['GET', 'POST'].includes(req.method)) return response({error:'GET or POST only.'}, 405);
  const accessToken = req.headers.get('authorization')?.match(/^Bearer\s+(\S+)$/i)?.[1];
  if (!accessToken) return response({error:'Sign in to Admin Back Room.'}, 401);
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return response({error:'Server authentication is not configured.'}, 503);
  }

  try {
    const supa = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: {persistSession:false,autoRefreshToken:false},
    });
    const {data: auth, error: authErr} = await supa.auth.getUser(accessToken);
    if (authErr || !auth?.user) return response({error:'Admin session expired. Sign in again.'}, 401);
    const {data: admin, error: adminErr} = await supa.from('admins')
      .select('user_id').eq('user_id', auth.user.id).maybeSingle();
    if (adminErr || !admin) return response({error:'Admin access required.'}, 403);

    const payload = req.method === 'POST' ? await req.json().catch(() => null) : null;
    const orderId = req.method === 'GET' ? new URL(req.url).searchParams.get('orderId') : payload?.orderId;
    if (!isUuid(orderId)) return response({error:'Valid order ID required.'}, 400);

    const {data: order, error: orderErr} = await supa.from('orders')
      .select('id,order_no,method,status,requires_prepay,paid,email,name')
      .eq('id', orderId).maybeSingle();
    if (orderErr || !order || !['ship','delivery'].includes(order.method)) {
      return response({error:'Eligible shipping or delivery order not found.'}, 404);
    }
    const kind = order.method === 'delivery' ? 'out_for_delivery' : 'shipped';
    const {data: existing, error: checkErr} = await supa.from('order_delivery_notifications')
      .select('id,state,sent_at').eq('order_id', order.id).eq('kind', kind).maybeSingle();
    if (checkErr) return response({error:'Could not check notification history.'}, 503);
    if (req.method === 'GET') return response({kind, state:existing?.state || 'not_sent', sentAt:existing?.sent_at || null});

    if (payload?.acknowledged !== true) return response({error:'Confirm that this order is actually being sent before notifying the customer.'}, 400);
    if (order.status === 'cancelled' || (order.requires_prepay && !order.paid)) {
      return response({error:'Cannot send a delivery notification for a cancelled or unpaid order.'}, 409);
    }
    if (!order.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(order.email.trim())) {
      return response({error:'This order needs a valid customer email.'}, 400);
    }
    if (existing) return response({error: existing.state === 'sent' ? 'Delivery email was already sent for this order.' : 'A delivery email is already processing for this order.', kind, state:existing.state, sentAt:existing.sent_at}, 409);
    if (!process.env.RESEND_API_KEY) return response({error:'Email sending is not configured.'}, 503);

    // The unique (order_id, kind) database constraint prevents accidental double sends.
    const recipient = order.email.trim();
    const {data: claimed, error: claimError} = await supa.from('order_delivery_notifications')
      .insert({order_id:order.id,kind,state:'pending',recipient})
      .select('id').single();
    if (claimError) {
      const duplicate = claimError.code === '23505';
      return response({error:duplicate ? 'This notice was already sent or is processing. Refresh its status.' : 'Could not reserve notification. Please retry.'}, duplicate ? 409 : 503);
    }

    const localDelivery = kind === 'out_for_delivery';
    const subject = localDelivery
      ? `Your NectarFusions order #${order.order_no} is out for delivery!`
      : `Your NectarFusions order #${order.order_no} has shipped!`;
    let sent;
    try {
      const result = await new Resend(process.env.RESEND_API_KEY).emails.send({
        from:FROM,
        to:recipient,
        subject,
        html:htmlEmail(order,kind),
      }, {idempotencyKey:`nf-fulfillment/${order.id}/${kind}`});
      if (result?.error || !result?.data?.id) throw new Error(result?.error?.message || 'Email provider did not accept the message.');
      sent = result.data;
    } catch (sendErr) {
      console.error('Delivery notification provider error:', sendErr?.message);
      // Release unsuccessful attempts. Resend idempotency protects retries if a response was lost.
      await supa.from('order_delivery_notifications').delete().eq('id',claimed.id).eq('state','pending');
      return response({error:'The email service could not accept the message. Please retry.'}, 502);
    }

    const sentAt = new Date().toISOString();
    const {error: saveErr} = await supa.from('order_delivery_notifications')
      .update({state:'sent',sent_at:sentAt,provider_id:sent.id})
      .eq('id',claimed.id).eq('state','pending');
    if (saveErr) {
      console.error('Delivery notification accepted but audit update failed:',saveErr.message);
      return response({error:'Email provider accepted the message, but saving confirmation failed. Do not resend until reviewed.'}, 503);
    }
    return response({ok:true,kind,state:'sent',sentAt});
  } catch (e) {
    console.error('Delivery notification error:',e?.message);
    return response({error:'Could not process the delivery notification.'}, 500);
  }
}
