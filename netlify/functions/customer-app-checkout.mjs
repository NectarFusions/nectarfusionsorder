// REVIEW ONLY. Native app -> trusted website backend -> EXISTING orders/order_items + pay-link.
// No checkout tables or partner authorization. Price and inventory are server validated.
import { createClient } from '@supabase/supabase-js';
import payLinkHandler from './pay-link.mjs';

const SITE = 'https://nectar-fusions.com';
const REQUEST_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TIERS = new Set(['hive-colony-partner','hive-apiary-partner','hive-community-partner']);
const reply = (status,body) => new Response(JSON.stringify(body), {status, headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
export const config = {rateLimit:{windowLimit:5,windowSize:60,aggregateBy:['ip']}};
const clean = (x,max) => typeof x === 'string' ? x.trim().slice(0,max) : '';

function parse(body) {
  const requestId=clean(body.requestId,80);
  const items=body.items;
  const sponsorKeys=body.sponsorKeys||[];
  const c=body.customer;
  if (!REQUEST_ID.test(requestId) || !Array.isArray(items) || !Array.isArray(sponsorKeys) ||
      items.length+sponsorKeys.length<1 || items.length>50 || sponsorKeys.length>3 ||
      !sponsorKeys.every(k=>typeof k==='string'&&TIERS.has(k)) || new Set(sponsorKeys).size!==sponsorKeys.length ||
      items.some(i=>!i || typeof i!=='object' || !REQUEST_ID.test(String(i.flavor_id||'')) ||
        typeof i.size_id!=='string' || i.size_id.length>100 ||
        !['regular','spun'].includes(i.type) || !Number.isSafeInteger(i.qty) || i.qty<1 || i.qty>99) ||
      !c || typeof c!=='object' || !EMAIL.test(clean(c.email,254)) ||
      clean(c.name,200).length<1 || clean(c.phone,50).replace(/\D/g,'').length<10 ||
      !['ship','delivery'].includes(body.method)) throw new Error('Review your bag and contact details.');
  if (items.length>0 && (!clean(c.address,300) || !clean(c.city,150) || !/^\d{5}$/.test(clean(c.zip,10))))
    throw new Error('Shipping or delivery requires a complete address and five-digit ZIP.');
  if (body.method==='delivery' && items.length===0) throw new Error('Sponsorship-only orders do not require local delivery.');
  return {requestId,items,sponsorKeys,customer:c};
}

export default async function handler(request) {
  if(request.method!=='POST') return reply(405,{error:'POST required'});
  if(Number(request.headers.get('content-length')||0)>16000) return reply(413,{error:'Bag too large'});
  let body;
  try { body=await request.json(); if(!body||typeof body!=='object') throw new Error('Invalid request'); }
  catch {return reply(400,{error:'Invalid checkout request.'});}
  let data;
  try {data=parse(body);}catch(e){return reply(400,{error:e.message});}
  const url=process.env.SUPABASE_URL;
  const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url||!key||process.env.NF_MIXED_BAG_ENABLED!=='true') return reply(503,{error:'Secure checkout is not yet available.'});
  const admin=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
  const c=data.customer;
  let order;
  try {
    const result=await admin.rpc('place_customer_mixed_order_v1',{
      p_request_id:data.requestId,p_honey_items:data.items,p_sponsor_keys:data.sponsorKeys,
      p_method:data.items.length?body.method:'ship',
      p_name:clean(c.name,200),p_phone:clean(c.phone,50),p_email:clean(c.email,254).toLowerCase(),
      p_address:data.items.length?clean(c.address,300):null,p_city:data.items.length?clean(c.city,150):null,
      p_notes:clean(body.notes,500),p_zip:data.items.length?clean(c.zip,10):null,
      p_day:data.items.length && body.method==='delivery'?body.deliveryDate||null:null,
    });
    if(result.error) throw result.error;
    order=Array.isArray(result.data)?result.data[0]:result.data;
    if(!order?.token || !order?.order_no) throw new Error('Order was not confirmed');
  }catch(e){return reply(503,{error:'Order creation could not be confirmed. Check status before retrying.'});}
  // Pay-link already uses an order-ID Square idempotency key and persists the link.
  // Reuse it; do not create a second Square checkout implementation.
  const existing=await admin.from('orders').select('paid,status,square_link_url')
    .eq('token',order.token).maybeSingle();
  if(existing.error) return reply(202,{state:'payment_link_unavailable',orderNumber:order.order_no,replayed:!!order.replayed});
  if(existing.data?.paid) return reply(200,{state:'paid',orderNumber:order.order_no,replayed:true});
  if(existing.data?.status==='cancelled') return reply(200,{state:'cancelled',orderNumber:order.order_no,replayed:true});
  let checkoutUrl=existing.data?.square_link_url;
  if(!checkoutUrl) {
    try {
      const res=await payLinkHandler(new Request(`${SITE}/.netlify/functions/pay-link`,{
        method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:order.token}),
      }));
      const info=await res.json().catch(()=>({}));
      if(res.ok&&typeof info.url==='string')checkoutUrl=info.url;
    }catch { /* saved order remains idempotent; status screen can recover */ }
  }
  if(!checkoutUrl) return reply(202,{state:'payment_link_unavailable',orderNumber:order.order_no,replayed:!!order.replayed});
  return reply(200,{state:'awaiting_payment',orderNumber:order.order_no,checkoutUrl,replayed:!!order.replayed});
}
