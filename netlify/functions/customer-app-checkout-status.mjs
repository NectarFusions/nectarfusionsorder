// Read saved existing website order using original app request ID and checkout email.
import { createClient } from '@supabase/supabase-js';
const REQUEST_ID=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const reply=(status,body)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
export const config={rateLimit:{windowLimit:10,windowSize:60,aggregateBy:['ip']}};
export default async function handler(req){
  if(req.method!=='POST')return reply(405,{error:'POST required'});
  let input;try{input=await req.json()}catch{return reply(400,{error:'Invalid request'})}
  const id=String(input?.requestId||'');const email=String(input?.email||'').trim().toLowerCase();
  if(!REQUEST_ID.test(id)||email.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return reply(400,{error:'Invalid checkout lookup'});
  if(!process.env.SUPABASE_URL||!process.env.SUPABASE_SERVICE_ROLE_KEY||process.env.NF_MIXED_BAG_ENABLED!=='true')return reply(503,{error:'Checkout status unavailable'});
  const db=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:o,error}=await db.from('orders')
    .select('order_no,email,paid,status,method,requires_prepay,market_date_id,total_cents,square_link_url,square_payment_id')
    .eq('app_checkout_request_id',id).maybeSingle();
  if(error)return reply(503,{error:'Could not check order status'});
  if(!o||String(o.email||'').trim().toLowerCase()!==email)return reply(200,{state:'not_found',message:'No matching order found'});
  if(o.status==='cancelled')return reply(200,{state:'cancelled',orderNumber:o.order_no,message:'This order was cancelled'});
  if(o.method==='market' && !o.requires_prepay && o.market_date_id){
    const {data:m,error:mErr}=await db.from('market_dates')
      .select('day,where_at,hours,venues(name,where_at,hours)')
      .eq('id',o.market_date_id).maybeSingle();
    if(mErr || !m)return reply(200,{state:'needs_review',orderNumber:o.order_no,message:'Your pickup is saved. Contact NectarFusions for market details.'});
    const venue=Array.isArray(m.venues)?m.venues[0]||{}:m.venues||{};
    return reply(200,{state:'pickup_submitted',orderNumber:o.order_no,totalCents:o.total_cents,
      replayed:true,market:{day:String(m.day||''),name:String(venue.name||'NectarFusions Market'),
        address:String(m.where_at||venue.where_at||''),hours:String(m.hours||venue.hours||'')},
      message:'Your market pickup order is recorded. Pay at pickup.'});
  }
  if(o.paid)return reply(200,{state:'paid',orderNumber:o.order_no,message:'Your payment is recorded'});
  if(o.square_link_url)return reply(200,{state:'awaiting_payment',orderNumber:o.order_no,checkoutUrl:o.square_link_url,message:'Your order is awaiting payment'});
  return reply(200,{state:'payment_link_unavailable',orderNumber:o.order_no,message:'Order saved; the secure payment page is not yet available'});
}
