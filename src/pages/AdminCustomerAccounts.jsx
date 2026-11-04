/* nf-my-accounts-v11: admin-only customer account overview. No passwords. */
import { useCallback, useEffect, useState } from 'react';
import * as api from '../lib/api';
const fmt = v => v ? new Date(v).toLocaleDateString() : '—';
export default function AdminCustomerAccounts() {
  const [rows,setRows] = useState([]);
  const [search,setSearch] = useState('');
  const [page,setPage] = useState(0);
  const [count,setCount] = useState(0);
  const [loading,setLoading] = useState(false);
  const [error,setError] = useState('');
  const refresh = useCallback(async () => {
    if(import.meta.env.DEV) return;
    setLoading(true);setError('');
    try {
      const session=await api.session();
      if(!session?.access_token)throw new Error('Please sign in again.');
      const response=await fetch(`/.netlify/functions/admin-customer-accounts?page=${page}&search=${encodeURIComponent(search)}`,{headers:{Authorization:`Bearer ${session.access_token}`}});
      const data=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(data.error||'Accounts unavailable.');
      setRows(data.accounts||[]);setCount(data.total||0);
    }catch(e){setError(e?.message||'Could not load customer accounts.');}
    finally{setLoading(false);}
  },[page,search]);
  useEffect(()=>{refresh();},[refresh]);
  return <section className="card" style={{padding:18,marginBottom:26}}>
    <div className="eyebrow">Customer account directory</div>
    <h2 style={{margin:'6px 0',color:'#4A3313'}}>My NectarFusions Users</h2>
    <p style={{fontSize:13,lineHeight:1.6,color:'#74644D'}}>Registered accounts and contact details. Passwords are securely managed by the authentication service and cannot be viewed by anyone, including administrators. Guest order records are not sign-in accounts.</p>
    {import.meta.env.DEV ? <div style={{padding:16,border:'1px solid #E2B62F',borderRadius:10,background:'#FFF9E8'}}>Preview only: customer directory is intentionally disabled here to avoid exposing private customer information in the local demo. Its authenticated, admin-only server endpoint is included for deployment after approval.</div> : <>
      <div style={{display:'flex',gap:8,marginBottom:15}}><input placeholder="Search email, phone, or name" aria-label="Search customer accounts" value={search} onChange={e=>{setPage(0);setSearch(e.target.value);}}/><button className="btn" onClick={refresh}>Refresh</button></div>
      {loading && <p>Loading registered accounts…</p>}
      {error && <p role="alert" className="err">{error}</p>}
      {!loading && !error && <><div style={{fontSize:12,color:'#74644D',marginBottom:9}}>{count} registered account{count===1?'':'s'}</div>
        <div style={{overflowX:'auto'}}><table style={{width:'100%',borderCollapse:'collapse',fontSize:12.5,textAlign:'left'}}><thead><tr>{['Customer','Email','Phone on file','Account security','Review','Joined'].map(x=><th key={x} style={{padding:10,borderBottom:'2px solid #DED2BF'}}>{x}</th>)}</tr></thead><tbody>{rows.map(x=><tr key={x.id}>
          <td style={{padding:10,borderBottom:'1px solid #E7DCC9'}}>{x.name||'—'}</td><td style={{padding:10,borderBottom:'1px solid #E7DCC9'}}>{x.email}</td><td style={{padding:10,borderBottom:'1px solid #E7DCC9'}}>{x.phone||'—'}</td>
          <td style={{padding:10,borderBottom:'1px solid #E7DCC9'}}>Password private</td><td style={{padding:10,borderBottom:'1px solid #E7DCC9',color:x.possibleDuplicate?'#9B4C12':'#4A7057'}}>{x.possibleDuplicate?'Possible duplicate phone — review':'No duplicates detected'}</td><td style={{padding:10,borderBottom:'1px solid #E7DCC9'}}>{fmt(x.created_at)}</td></tr>)}</tbody></table></div>
        {!rows.length && <p>No matching registered accounts.</p>}
        <div style={{display:'flex',gap:8,marginTop:12}}><button className="btn" disabled={page===0} onClick={()=>setPage(x=>Math.max(0,x-1))}>Previous</button><button className="btn" disabled={(page+1)*50>=count} onClick={()=>setPage(x=>x+1)}>Next</button></div></>}
    </>}
    <p style={{fontSize:12,color:'#74644D'}}>A matching phone is only a possible duplicate; it does not automatically merge or block two people. Email is the unique account identifier. Phone numbers saved in a profile are not proof of phone ownership.</p>
  </section>;
}
