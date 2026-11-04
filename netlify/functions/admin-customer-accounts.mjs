/* nf-my-accounts-v11: strictly authenticated/admin-only read access; never returns password hashes */
import { createClient } from '@supabase/supabase-js';
const respond=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
const phoneKey=x=>{const n=String(x||'').replace(/\D/g,'');return n.length===11&&n.startsWith('1')?n.slice(1):n;};
export default async function handler(req) {
  if(req.method!=='GET')return respond({error:'GET only'},405);
  const jwt=req.headers.get('authorization')?.match(/^Bearer\s+(\S+)$/i)?.[1];
  if(!jwt)return respond({error:'Sign in first'},401);
  if(!process.env.SUPABASE_URL||!process.env.SUPABASE_SERVICE_ROLE_KEY)return respond({error:'Not configured'},503);
  try{
    const admin=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{autoRefreshToken:false,persistSession:false}});
    const {data:auth,error:authErr}=await admin.auth.getUser(jwt);
    if(authErr||!auth?.user)return respond({error:'Session expired'},401);
    const {data:allowed,error:adminErr}=await admin.from('admins').select('user_id').eq('user_id',auth.user.id).maybeSingle();
    if(adminErr||!allowed)return respond({error:'Administrator access required'},403);
    const u=new URL(req.url);const page=Math.min(1000,Math.max(0,Number.parseInt(u.searchParams.get('page')||'0',10)||0));
    const search=String(u.searchParams.get('search')||'').trim().slice(0,90).replace(/[^a-zA-Z0-9@._ +\-]/g,'');
    let query=admin.from('customer_accounts').select('id,email,name,phone,created_at',{count:'exact'}).order('created_at',{ascending:false}).range(page*50,page*50+49);
    if(search) query=query.or(`email.ilike.%${search}%,name.ilike.%${search}%,phone.ilike.%${search}%`);
    const [{data:rows,error,count},{data:phoneRows,error:phoneErr}]=await Promise.all([query,admin.from('customer_accounts').select('id,phone').limit(5000)]);
    if(error||phoneErr)return respond({error:'Could not load account directory'},503);
    const counts=new Map();
    (phoneRows||[]).forEach(a=>{const k=phoneKey(a.phone);if(k.length>=10)counts.set(k,(counts.get(k)||0)+1);});
    const accounts=(rows||[]).map(r=>({...r,possibleDuplicate:(counts.get(phoneKey(r.phone))||0)>1}));
    return respond({accounts,total:count||0,page});
  }catch(e){console.error('Customer directory failed:',e?.message);return respond({error:'Could not load account directory'},500);}
}
