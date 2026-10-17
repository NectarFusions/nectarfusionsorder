/** REVIEW-ONLY Netlify function for NectarFusions app partnership inquiries.
 * Deploy only after reviewing the live website source and Resend config.
 * No Supabase writes. Netlify per-IP rate limiting and Resend 24h idempotency.
 */
import { createHash } from 'node:crypto';
const OPTIONS = new Set(['retail','foodservice','business_gifting','hive_partners']);
const LABELS = { retail:'Retail',foodservice:'Foodservice',business_gifting:'Business Gifting',hive_partners:'Hive Partners' };
const DESTINATION = 'info@nectar-fusions.com';
const SENDER = 'NectarFusions <orders@nectar-fusions.com>';
const reply = (status, data) => new Response(JSON.stringify(data), {status, headers:{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const clean = x => typeof x==='string' ? x.trim() : '';
export const config = {
  path: '/.netlify/functions/customer-partner-interest',
  rateLimit: {windowLimit:5, windowSize:60, aggregateBy:['ip']},
};
export default async function handler(request) {
  if (request.method !== 'POST') return reply(405,{ok:false,notified:false,error:'POST required.'});
  const type=request.headers.get('content-type') || '';
  if (!type.toLowerCase().startsWith('application/json')) return reply(415,{ok:false,notified:false,error:'JSON required.'});
  if (Number(request.headers.get('content-length')||0)>6000) return reply(413,{ok:false,notified:false,error:'Message too large.'});
  let data;
  try { const raw=await request.text(); if (raw.length>6000)throw new Error('Too large'); data=JSON.parse(raw); }
  catch { return reply(400,{ok:false,notified:false,error:'Invalid inquiry.'}); }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return reply(400,{ok:false,notified:false,error:'Invalid inquiry.'});
  if (clean(data.website)!=='') return reply(400,{ok:false,notified:false,error:'Invalid inquiry.'}); // honeypot
  const elapsed=Date.now()-Number(data.formStartedAt);
  if (!Number.isFinite(elapsed)||elapsed<1500||elapsed>24*3600*1000) return reply(400,{ok:false,notified:false,error:'Please reopen the form and try again.'});
  const firstName=clean(data.firstName),lastName=clean(data.lastName),phone=clean(data.phone),email=clean(data.email).toLowerCase();
  const keys=data.programKeys;
  if (!firstName||firstName.length>80||!lastName||lastName.length>80 || !/^[+()\-\d.\s]{7,35}$/.test(phone) || phone.replace(/\D/g,'').length<10 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254 || !Array.isArray(keys)||keys.length<1||keys.length>4 || new Set(keys).size!==keys.length || keys.some(k=>!OPTIONS.has(k)))
    return reply(400,{ok:false,notified:false,error:'Please check the form details and try again.'});
  const apiKey=process.env.RESEND_API_KEY || '';
  if (!apiKey) return reply(503,{ok:false,notified:false,error:'Partnership inquiries are temporarily unavailable.'});
  const windowId=Math.floor(Date.now()/(15*60*1000));
  const idempotencyKey='nf-partner-'+createHash('sha256').update(JSON.stringify([firstName.toLowerCase(),lastName.toLowerCase(),email,phone,[...keys].sort(),windowId])).digest('hex');
  const name=firstName+' '+lastName;
  const plain=['New NectarFusions partnership inquiry','',`Name: ${name}`,`Phone: ${phone}`,`Email: ${email}`,'Programs: '+keys.map(k=>LABELS[k]).join(', ')].join('\n');
  let provider;
  try { provider=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json','Idempotency-Key':idempotencyKey},body:JSON.stringify({from:SENDER,to:[DESTINATION],reply_to:email,subject:'NectarFusions partnership inquiry',text:plain}),signal:AbortSignal.timeout(12000)}); }
  catch { return reply(503,{ok:false,notified:false,error:'Email service is temporarily unavailable. Please try again.'}); }
  const response=await provider.json().catch(()=>({}));
  if (!provider.ok || !response || typeof response.id!=='string' || response.id.length<8) return reply(503,{ok:false,notified:false,error:'Your request was not confirmed. Please try again later.'});
  // Provider accepted; does not prove inbox delivery.
  return reply(200,{ok:true,notified:true});
}
