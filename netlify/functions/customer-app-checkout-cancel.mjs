/** Customer-initiated fresh-order cancellation, disabled until explicitly enabled. */
import {createClient} from '@supabase/supabase-js';
import {cancelVerifiedAppOrder,CANCEL_ORDER_FIELDS} from './_customer-app-order-cancel.mjs';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMAIL=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const reply=(code,body)=>new Response(JSON.stringify(body),{status:code,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
export const config={rateLimit:{windowLimit:3,windowSize:60,aggregateBy:['ip']}};
export default async function handler(req){
  if(req.method!=='POST')return reply(405,{error:'POST required'});
  if(process.env.NF_CUSTOMER_APP_CANCEL_ENABLED!=='true'||process.env.NF_MIXED_BAG_ENABLED!=='true')
    return reply(503,{error:'Secure checkout cancellation is not enabled.'});
  if(Number(req.headers.get('content-length')||0)>4096)return reply(413,{error:'Request too large'});
  let input;try{input=await req.json()}catch{return reply(400,{error:'Invalid request'})}
  const id=String(input?.requestId||'');const email=String(input?.email||'').trim().toLowerCase();
  if(!UUID.test(id)||email.length>254||!EMAIL.test(email))return reply(400,{error:'Invalid checkout reference'});
  if(!process.env.SUPABASE_URL||!process.env.SUPABASE_SERVICE_ROLE_KEY)return reply(503,{error:'Service unavailable'});
  const db=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:o,error}=await db.from('orders').select(CANCEL_ORDER_FIELDS).eq('app_checkout_request_id',id).maybeSingle();
  if(error)return reply(503,{error:'Unable to verify order'});
  if(!o || String(o.email||'').trim().toLowerCase()!==email)return reply(404,{error:'Checkout not found'});
  if(o.status==='cancelled')return reply(200,{state:'cancelled',orderNumber:o.order_no});
  try{return reply(200,await cancelVerifiedAppOrder(db,o));}
  catch(e){console.warn('Customer App cancellation deferred',String(e?.message||'unverified').slice(0,120));
    return reply(409,{error:'Unable to verify safe cancellation. Original checkout is protected; please contact NectarFusions.'});}
}
