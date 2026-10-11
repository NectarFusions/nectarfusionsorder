import { createClient } from '@supabase/supabase-js';

const TABLE_CONTACTS = 'nf_newsletter_contacts';
const TABLE_ISSUES = 'nf_newsletter_issues';
const TABLE_SENDS = 'nf_newsletter_deliveries';
const TOPICS = [
  'From the Hive: the story behind NectarFusions',
  'Honey 101: useful, everyday honey knowledge',
  'Flavor spotlight: simple ideas for using infused honey',
  'A look behind the scenes: Michigan makers, bees, and what is next',
];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i;
const json = (body, status=200) => new Response(JSON.stringify(body), {
  status, headers: {'Content-Type':'application/json','Cache-Control':'no-store'},
});
const clean = (v, max=4000) => String(v ?? '').trim().slice(0,max);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (x) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]));
const env = (key) => clean(process.env[key]);
const database = () => createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), {
  auth:{persistSession:false,autoRefreshToken:false},
});
const dbError = (r) => {if(r.error) throw new Error(r.error.message);return r.data;};

async function requireAdmin(req, db) {
  const token = clean(req.headers.get('authorization')).replace(/^Bearer\s+/i,'');
  if(!token) return null;
  const client = createClient(env('SUPABASE_URL'), env('VITE_SUPABASE_ANON_KEY') || env('SUPABASE_ANON_KEY'), {
    auth:{persistSession:false,autoRefreshToken:false},
  });
  const {data, error} = await client.auth.getUser(token);
  if(error || !data?.user) return null;
  const row = await db.from('admins').select('user_id').eq('user_id',data.user.id).maybeSingle();
  if(row.error || !row.data) return null;
  return data.user;
}

function parseModelJson(response) {
  const parts = response?.output?.flatMap(item => (item.content || [])
    .filter(entry => entry.type === 'output_text').map(entry => entry.text || '')) || [];
  const raw = (response.output_text || parts.join('\n')).trim();
  try { return JSON.parse(raw); }
  catch { return JSON.parse(raw.replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'')); }
}

async function useAI(inputs, schema, instructions) {
  if(!env('OPENAI_API_KEY')) throw new Error('Set OPENAI_API_KEY in Netlify before using photo scan or newsletter generation.');
  const response = await fetch('https://api.openai.com/v1/responses', {
    method:'POST',
    headers:{Authorization:`Bearer ${env('OPENAI_API_KEY')}`,'Content-Type':'application/json'},
    body:JSON.stringify({
      model:env('NEWSLETTER_AI_MODEL') || 'gpt-4.1-mini',
      store:false,
      instructions,
      input:[{role:'user',content:inputs}],
      text:{format:{type:'json_schema',name:schema.name,strict:true,schema:schema.structure}},
    }),
  });
  const out = await response.json().catch(() => ({}));
  if(!response.ok) throw new Error(out.error?.message || `AI request failed (${response.status}).`);
  return parseModelJson(out);
}

const scanSchema = {
  name:'contacts_from_sheet',
  structure:{type:'object',additionalProperties:false,properties:{
    contacts:{type:'array',items:{type:'object',additionalProperties:false,properties:{
      full_name:{type:'string'},email:{type:'string'},phone:{type:'string'},
    },required:['full_name','email','phone']}},
  },required:['contacts']},
};
const issueSchema = {
  name:'nectarfusions_newsletter',
  structure:{type:'object',additionalProperties:false,properties:{
    subject:{type:'string'},preheader:{type:'string'},title:{type:'string'},body:{type:'string'},
  },required:['subject','preheader','title','body']},
};

function normalizeContact(p) {
  const full_name = clean(p.full_name,150);
  const email = clean(p.email,254).toLowerCase() || null;
  const phone = clean(p.phone,40) || null;
  if(email && !EMAIL_RE.test(email)) throw new Error(`Invalid email: ${email}`);
  if(!full_name && !email && !phone) throw new Error('Enter at least a name, email, or phone.');
  return {full_name,email,phone};
}

async function saveContact(db, body) {
  const input = normalizeContact(body);
  const requestedConsent = clean(body.consent_status);
  const consent_detail = clean(body.consent_detail,500) || null;
  const now = new Date().toISOString();
  if(!['needs_permission','subscribed','unsubscribed'].includes(requestedConsent)) throw new Error('Select a contact permission status.');
  if(requestedConsent === 'subscribed' && (!body.permission_confirmed || !consent_detail || consent_detail.length < 8)) {
    throw new Error('Confirm the customer expressly requested newsletter emails and record where and when.');
  }
  let previous = null;
  if(body.id) {
    if(!UUID_RE.test(body.id)) throw new Error('Invalid contact ID.');
    previous = dbError(await db.from(TABLE_CONTACTS).select('*').eq('id',body.id).maybeSingle());
    if(!previous) throw new Error('Contact not found.');
  } else if(input.email) {
    previous = dbError(await db.from(TABLE_CONTACTS).select('*').eq('email',input.email).maybeSingle());
  }
  // An unsubscribed person cannot be silently reactivated by scanning a sheet.
  if(previous?.consent_status === 'unsubscribed' && requestedConsent !== 'unsubscribed') {
    throw new Error('This contact previously unsubscribed. Obtain a new direct opt-in before adding them again.');
  }
  const retainedOptIn = !body.id && previous?.consent_status === 'subscribed' && requestedConsent === 'needs_permission';
  const effectiveConsent = retainedOptIn ? 'subscribed' : requestedConsent;
  const row = {
    ...input,
    source:clean(body.source,100) || previous?.source || 'manual',
    consent_status:effectiveConsent,
    consent_detail:effectiveConsent === 'subscribed' ? (consent_detail || previous?.consent_detail) : (previous?.consent_detail || consent_detail),
    consent_at:effectiveConsent === 'subscribed' ? (previous?.consent_at || now) : null,
    unsubscribed_at:effectiveConsent === 'unsubscribed' ? (previous?.unsubscribed_at || now) : null,
    updated_at:now,
    archived:false,
  };
  if(previous) dbError(await db.from(TABLE_CONTACTS).update(row).eq('id',previous.id));
  else dbError(await db.from(TABLE_CONTACTS).insert(row));
  return {saved:true};
}

async function listState(db) {
  const [contacts,issues] = await Promise.all([
    db.from(TABLE_CONTACTS).select('id,full_name,email,phone,source,consent_status,consent_detail,consent_at,unsubscribed_at,archived,created_at').eq('archived',false).order('created_at',{ascending:false}).limit(2000),
    db.from(TABLE_ISSUES).select('*').order('created_at',{ascending:false}).limit(60),
  ]);
  return {contacts:dbError(contacts),issues:dbError(issues),topics:TOPICS};
}

function newsletterHtml(issue, contact, origin, postal) {
  const paragraphs = clean(issue.body,16000).split(/\n\s*\n/).filter(Boolean)
    .map(p=>`<p style="margin:0 0 16px;line-height:1.75">${esc(p).replace(/\n/g,'<br>')}</p>`).join('');
  const first = clean(contact.full_name,80).split(/\s+/)[0] || 'friend';
  const unsubscribe = `${origin}/.netlify/functions/newsletter-unsubscribe?token=${encodeURIComponent(contact.unsubscribe_token)}`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body style="margin:0;background:#F5EFE7;padding:22px 12px;font:15px Arial,sans-serif;color:#17384B">
  <div style="display:none;max-height:0;overflow:hidden">${esc(issue.preheader)}</div>
  <div style="max-width:590px;margin:auto;border-radius:18px;overflow:hidden;background:#fff;border:1px solid #D8E7ED">
  <div style="background:#14384B;color:#fff;padding:23px"><div style="color:#F7C41C;font-weight:800;letter-spacing:2px;font-size:12px">NECTARFUSIONS · NATURE'S HAPPINESS</div><h1 style="font-size:32px;line-height:1.15;margin:12px 0 0">${esc(issue.title)}</h1></div>
  <div style="padding:27px 25px"><p style="margin:0 0 17px">Hi ${esc(first)},</p>${paragraphs}<p style="margin:20px 0 0">With gratitude,<br><strong>The NectarFusions Hive</strong></p>
  <a href="${origin}" style="display:inline-block;background:#F7C41C;color:#17384B;padding:13px 20px;border-radius:8px;text-decoration:none;font-weight:800;margin-top:25px">Explore our honey</a></div>
  <div style="border-top:1px solid #E2E9ED;background:#FAFCFD;padding:21px 25px;font-size:12px;line-height:1.65;color:#536B76">
  NectarFusions · ${esc(postal)}<br>You received this email because you signed up for NectarFusions updates.<br>
  <a href="${unsubscribe}" style="color:#285E79">Unsubscribe from newsletter emails</a> · <a href="mailto:info@nectar-fusions.com">Contact us</a></div></div></body></html>`;
}

async function sendBatch(db, issueId) {
  if(!UUID_RE.test(issueId)) throw new Error('Select a valid issue.');
  if(!env('RESEND_API_KEY') || !env('NEWSLETTER_POSTAL_ADDRESS') || !env('SITE_URL')) {
    throw new Error('Sending requires RESEND_API_KEY, SITE_URL and a valid NEWSLETTER_POSTAL_ADDRESS in Netlify environment settings.');
  }
  const issue = dbError(await db.from(TABLE_ISSUES).select('*').eq('id',issueId).maybeSingle());
  if(!issue || !['approved','sending'].includes(issue.status)) throw new Error('Approve this draft before sending, or select an unfinished send.');
  const contacts = dbError(await db.from(TABLE_CONTACTS)
    .select('id,full_name,email,unsubscribe_token').eq('consent_status','subscribed').eq('archived',false).not('email','is',null).order('created_at',{ascending:true}).limit(2000));
  const deliveries = dbError(await db.from(TABLE_SENDS).select('contact_id,status').eq('issue_id',issueId).limit(2000));
  const sent = new Set(deliveries.filter(d=>d.status==='sent').map(d=>d.contact_id));
  const eligible = contacts.filter(c=>c.email && !sent.has(c.id));
  const batch = eligible.slice(0,5);
  const origin = env('SITE_URL').replace(/\/$/,'');
  if(!/^https:\/\//.test(origin)) throw new Error('SITE_URL must be a secure https URL.');
  let successful=0;
  const failed=[];
  for(const contact of batch) {
    try {
      const record = dbError(await db.from(TABLE_CONTACTS).select('consent_status,archived').eq('id',contact.id).single());
      if(record.consent_status !== 'subscribed' || record.archived) continue;
      dbError(await db.from(TABLE_SENDS).upsert({issue_id:issueId,contact_id:contact.id,status:'sending',updated_at:new Date().toISOString()}, {onConflict:'issue_id,contact_id'}));
      const unsubscribe = `${origin}/.netlify/functions/newsletter-unsubscribe?token=${encodeURIComponent(contact.unsubscribe_token)}`;
      const response = await fetch('https://api.resend.com/emails', {
        method:'POST',
        headers:{'Content-Type':'application/json',Authorization:`Bearer ${env('RESEND_API_KEY')}`,
          'Idempotency-Key':`nf-newsletter/${issue.id}/${contact.id}`},
        body:JSON.stringify({
          from:env('NEWSLETTER_FROM_EMAIL') || 'NectarFusions <info@nectar-fusions.com>', to:[contact.email], reply_to:'info@nectar-fusions.com',
          subject:issue.subject, html:newsletterHtml(issue,contact,origin,env('NEWSLETTER_POSTAL_ADDRESS')),
          headers:{'List-Unsubscribe':`<${unsubscribe}>`,'List-Unsubscribe-Post':'List-Unsubscribe=One-Click'},
        }),
      });
      const payload = await response.json().catch(()=>({}));
      if(!response.ok || !payload.id) throw new Error(payload.message || payload.error?.message || `Email provider error ${response.status}`);
      dbError(await db.from(TABLE_SENDS).update({status:'sent',provider_message_id:payload.id,sent_at:new Date().toISOString(),error_text:null,updated_at:new Date().toISOString()}).eq('issue_id',issueId).eq('contact_id',contact.id));
      successful++;
      await new Promise(resolve=>setTimeout(resolve,600)); // Respect Resend's default request rate limit.
    } catch(err) {
      failed.push({contact:contact.email,error:clean(err.message,150)});
      await db.from(TABLE_SENDS).upsert({issue_id:issueId,contact_id:contact.id,status:'failed',error_text:clean(err.message,400),updated_at:new Date().toISOString()}, {onConflict:'issue_id,contact_id'});
    }
  }
  const completed = dbError(await db.from(TABLE_SENDS).select('contact_id').eq('issue_id',issueId).eq('status','sent').limit(2000));
  const ids = new Set(completed.map(r=>r.contact_id));
  const remaining = contacts.filter(c=>c.email && !ids.has(c.id)).length;
  dbError(await db.from(TABLE_ISSUES).update({
    status:remaining===0?'sent':'sending',sent_count:ids.size,
    sent_at:remaining===0?new Date().toISOString():null,updated_at:new Date().toISOString(),
  }).eq('id',issueId));
  return {successful,total_sent:ids.size,remaining,failed};
}

export default async (req) => {
  if(!['GET','POST'].includes(req.method)) return json({error:'GET or POST required.'},405);
  try {
    if(!env('SUPABASE_URL') || !env('SUPABASE_SERVICE_ROLE_KEY')) throw new Error('Server database environment is missing.');
    const db = database();
    if(!await requireAdmin(req,db)) return json({error:'Back Room administrator sign-in required.'},401);
    if(req.method==='GET') return json(await listState(db));
    const body = await req.json();
    const action = clean(body.action);
    if(action==='scan') {
      const image = clean(body.imageData,7_000_000);
      if(!/^data:image\/(jpeg|png|webp);base64,[a-z0-9+/=]+$/i.test(image) || image.length>7_000_000) {
        return json({error:'Upload a JPG, PNG or WebP photo, up to about 5 MB.'},400);
      }
      const out = await useAI([
        {type:'input_text',text:'Extract each distinct handwritten or printed person on this sign-up sheet. Return only clearly visible name, email and phone. Never invent missing letters, digits or permission to receive marketing emails. Use empty strings for missing or illegible fields. Do not treat headers as contacts.'},
        {type:'input_image',image_url:image,detail:'high'},
      ],scanSchema,'You read handwritten contact sheets conservatively. You do not infer newsletter opt-in.');
      const contacts = (out.contacts || []).slice(0,120).map(row=>({
        full_name:clean(row.full_name,150),email:clean(row.email,254),phone:clean(row.phone,40),
      })).filter(c=>c.full_name||c.email||c.phone);
      return json({contacts});
    }
    if(action==='save_contact') return json(await saveContact(db,body));
    if(action==='archive_contact') {
      if(!UUID_RE.test(clean(body.id))) return json({error:'Invalid contact ID.'},400);
      dbError(await db.from(TABLE_CONTACTS).update({archived:true,updated_at:new Date().toISOString()}).eq('id',body.id));
      return json({archived:true});
    }
    if(action==='generate') {
      const month = clean(body.month,7);
      const week = Number(body.week);
      if(!/^\d{4}-\d{2}$/.test(month) || !(week>=1&&week<=4)) return json({error:'Choose a month and week 1–4.'},400);
      const keywords=clean(body.keywords,1000);
      const funFact=clean(body.funFact,750);
      const topic=TOPICS[week-1];
      const out = await useAI([{type:'input_text',text:`Write the newsletter edition for NectarFusions Michigan honey. Month: ${month}; Week: ${week}; editorial topic: ${topic}. User supplied keywords: ${keywords||'none'}. User confirmed fun information: ${funFact||'none'}. Format body as 3-5 short paragraphs separated by blank lines, 160-240 words total. Use genuine human language, warm but not corny. Never invent promotions, pricing, recipes that require unmentioned ingredients, event dates, stock, testimonials, sourcing claims, health benefits, or specific company news. Distinguish creative suggestions from factual claims. Avoid em dashes and hyphen-heavy copy.`}],issueSchema,
        'You draft brand-specific email newsletters. Output subject under 80 characters, preheader under 140 characters, title under 90 characters, and body plain text. Follow the verified facts supplied.');
      const issue={month_key:month,week_number:week,topic,keywords,fun_fact:funFact,
        subject:clean(out.subject,160),preheader:clean(out.preheader,200),title:clean(out.title,160),body:clean(out.body,12000),status:'draft'};
      if(!issue.subject||!issue.body) throw new Error('The generated draft was incomplete. Please try again.');
      const saved=dbError(await db.from(TABLE_ISSUES).insert(issue).select('*').single());
      return json({issue:saved});
    }
    if(action==='save_issue') {
      const id=clean(body.id);
      const before=dbError(await db.from(TABLE_ISSUES).select('status').eq('id',id).maybeSingle());
      if(!before || !['draft','approved'].includes(before.status)) return json({error:'Sent or sending newsletters cannot be edited.'},400);
      const patch={subject:clean(body.subject,160),preheader:clean(body.preheader,200),title:clean(body.title,160),body:clean(body.body,12000),status:'draft',approved_at:null,updated_at:new Date().toISOString()};
      if(!patch.subject||!patch.body) return json({error:'Add a subject and newsletter body.'},400);
      dbError(await db.from(TABLE_ISSUES).update(patch).eq('id',id));
      return json({saved:true});
    }
    if(action==='approve') {
      const before=dbError(await db.from(TABLE_ISSUES).select('status,subject,body').eq('id',body.id).maybeSingle());
      if(!before||!['draft','approved'].includes(before.status)||!before.subject||!before.body) return json({error:'Save a complete draft before approving it.'},400);
      dbError(await db.from(TABLE_ISSUES).update({status:'approved',approved_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq('id',body.id));
      return json({approved:true});
    }
    if(action==='send') return json(await sendBatch(db,clean(body.id)));
    return json({error:'Unknown newsletter action.'},400);
  } catch(err) {
    console.error('Newsletter admin:',err);
    return json({error:clean(err.message || 'Newsletter request failed.',600)},500);
  }
};
