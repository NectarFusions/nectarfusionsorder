// REVIEW ONLY: this is a separate native pickup endpoint, not a modification
// of the working Square checkout for shipping/delivery. Must be enabled only
// after migration and live safety tests are approved.
import { createClient } from '@supabase/supabase-js';
import payLinkHandler from './pay-link.mjs';
import orderEmailHandler from './order-email.mjs';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMAIL=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const reply=(status,body)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
const clean=(v,n)=>typeof v==='string'?v.trim().slice(0,n):'';
export const config={rateLimit:{windowLimit:5,windowSize:60,aggregateBy:['ip']}};

function valid(input) {
  const c=input?.customer;
  const items=input?.items;
  const sponsors=input?.sponsorKeys || [];
  if (!input || input.method!=='market' || !UUID_V4.test(String(input.requestId||'')) ||
      !UUID_V4.test(String(input.marketDateId||'')) || !Array.isArray(items) || items.length<1 || items.length>50 ||
      !Array.isArray(sponsors) || sponsors.length>0 || !c ||
      !clean(c.name,151) || clean(c.name,151).length>150 || !EMAIL.test(clean(c.email,254)) ||
      !/^(1)?\d{10}$/.test(clean(c.phone,50).replace(/\D/g,'')) ||
      items.some(item=>!item || !UUID_V4.test(String(item.flavor_id||'')) ||
        typeof item.size_id!=='string'||item.size_id.length>100 ||
        !['regular','spun'].includes(item.type)||!Number.isSafeInteger(item.qty)||item.qty<1||item.qty>99))
    throw new Error('Review your bag, market selection and contact details.');
  if (typeof input.notes==='string' && input.notes.length>500) throw new Error('Pickup notes are too long.');
  return {items,marketDateId:input.marketDateId,requestId:input.requestId,contact:c,notes:clean(input.notes,500)};
}

async function marketInfo(db,id) {
  const {data:m,error}=await db.from('market_dates')
    .select('day,where_at,hours,venues(name,where_at,hours)').eq('id',id).maybeSingle();
  if(error || !m) throw new Error('Market details unavailable');
  const venue=Array.isArray(m.venues)?m.venues[0]||{}:m.venues||{};
  return {
    day:String(m.day||''),
    name:String(venue.name||'NectarFusions Market').slice(0,150),
    address:String(m.where_at||venue.where_at||'').slice(0,250),
    hours:String(m.hours||venue.hours||'').slice(0,150),
  };
}

export default async function handler(req) {
  if(req.method!=='POST')return reply(405,{error:'POST required'});
  if(Number(req.headers.get('content-length')||0)>16000)return reply(413,{error:'Request too large'});
  let payload;
  try{payload=valid(await req.json())}catch(err){return reply(400,{error:err.message||'Invalid pickup request'})}
  if(process.env.NF_MIXED_BAG_ENABLED!=='true' || process.env.NF_MARKET_PICKUP_ENABLED!=='true'
    || !process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY)
    return reply(503,{error:'Market pickup submissions are not enabled yet.'});
  const db=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,
    {auth:{persistSession:false,autoRefreshToken:false}});
  let saved;
  try {
    const {data,error}=await db.rpc('place_customer_market_pickup_v1',{
      p_request_id:payload.requestId,p_honey_items:payload.items,
      p_market_date_id:payload.marketDateId,p_name:clean(payload.contact.name,150),
      p_phone:clean(payload.contact.phone,50),p_email:clean(payload.contact.email,254).toLowerCase(),
      p_notes:payload.notes,
    });
    if(error)throw error;
    saved=Array.isArray(data)?data[0]:data;
    if(!saved?.token || !saved?.order_no)throw new Error('Order reference missing');
  } catch(err) {
    console.error('Market pickup order unavailable:',err.message);
    return reply(503,{error:'Order submission could not be confirmed. Please check its status before retrying.'});
  }
  // Match the website's existing order-confirmation service. It emails the
  // customer and owner, with stable idempotency keys shared with the webhook.
  // Email delivery is independent of the saved order: never create another
  // order, or claim the first order failed, when email delivery is delayed.
  try {
    const emailResult = await orderEmailHandler(new Request(
      'https://nectar-fusions.com/.netlify/functions/order-email',
      {method:'POST',headers:{'Content-Type':'application/json'},
       body:JSON.stringify({token:saved.token})}));
    if (!emailResult.ok) console.warn('Market pickup order saved; confirmation email requires follow-up:', emailResult.status);
  } catch (emailError) {
    console.warn('Market pickup order saved; confirmation email delayed:', emailError?.message || emailError);
  }
  // Read from the existing orders table before confirming. Admin uses these
  // same rows. Never mark unpaid pickup orders as paid.
  const {data:o,error:orderErr}=await db.from('orders')
    .select('paid,status,method,market_date_id,requires_prepay,total_cents,square_link_url')
    .eq('token',saved.token).maybeSingle();
  if(orderErr || !o || o.method!=='market')return reply(202,{state:'needs_review',orderNumber:saved.order_no});
  if(o.status==='cancelled')return reply(200,{state:'cancelled',orderNumber:saved.order_no,replayed:true});
  if(o.market_date_id!==payload.marketDateId)return reply(409,{error:'Market selection changed. Contact NectarFusions.'});
  if(!o.requires_prepay){
    let market;
    try{market=await marketInfo(db,o.market_date_id)}catch{return reply(202,{state:'needs_review',orderNumber:saved.order_no})}
    return reply(200,{state:'pickup_submitted',orderNumber:saved.order_no,
      replayed:!!saved.replayed,totalCents:o.total_cents,market});
  }
  if(o.paid)return reply(200,{state:'paid',orderNumber:saved.order_no,replayed:true});
  let checkoutUrl=o.square_link_url;
  if(!checkoutUrl){
    try{
      const res=await payLinkHandler(new Request('https://nectar-fusions.com/.netlify/functions/pay-link',{
        method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:saved.token})
      }));
      const data=await res.json().catch(()=>({}));
      if(res.ok && typeof data.url==='string')checkoutUrl=data.url;
    } catch(err){console.error('Market prepay Square link unavailable:',err.message)}
  }
  if(!checkoutUrl)return reply(202,{state:'payment_link_unavailable',orderNumber:saved.order_no,replayed:!!saved.replayed});
  return reply(200,{state:'awaiting_payment',orderNumber:saved.order_no,replayed:!!saved.replayed,checkoutUrl});
}
