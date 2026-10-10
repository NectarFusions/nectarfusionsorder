import { createClient } from '@supabase/supabase-js';

const esc=(v)=>String(v||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const page=(title,copy,button='')=>new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(title)} | NectarFusions</title></head><body style="background:#F5EFE7;color:#17384B;font:16px Arial,sans-serif;padding:60px 20px"><main style="max-width:530px;margin:auto;background:white;border:1px solid #D8E7ED;border-radius:18px;padding:28px"><p style="color:#C28A00;font-size:12px;font-weight:800;letter-spacing:2px">NECTARFUSIONS</p><h1>${esc(title)}</h1><p style="line-height:1.7">${esc(copy)}</p>${button}</main></body></html>`, {status:200,headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Robots-Tag':'noindex, nofollow'}});
export default async (req)=>{
  const token=new URL(req.url).searchParams.get('token') || '';
  if(!/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(token)) return page('Link unavailable','This unsubscribe link is invalid. Email info@nectar-fusions.com for help.');
  if(req.method==='GET') return page('Unsubscribe from honey updates','You can stop NectarFusions newsletter emails below. Order confirmations and other necessary transaction emails are separate.', `<form method="POST"><button type="submit" style="background:#14384B;color:white;border:0;padding:13px 18px;border-radius:8px;font-weight:700;cursor:pointer">Unsubscribe me</button></form>`);
  if(req.method!=='POST') return new Response('Method not allowed',{status:405});
  try {
    const db=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
    const {data,error}=await db.from('nf_newsletter_contacts').update({consent_status:'unsubscribed',unsubscribed_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq('unsubscribe_token',token).select('id').maybeSingle();
    if(error) throw error;
    return data ? page('You are unsubscribed','You will no longer receive NectarFusions newsletter emails. Thank you for being part of our hive.') : page('Link unavailable','We could not find that contact. Email info@nectar-fusions.com for help.');
  } catch(err) {
    console.error('Newsletter unsubscribe failed:',err);
    return new Response('Could not update your email preference. Contact info@nectar-fusions.com.',{status:503,headers:{'Content-Type':'text/plain'}});
  }
};
