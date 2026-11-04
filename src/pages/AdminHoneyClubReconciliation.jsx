import {useMemo,useState} from 'react';
import {reconcileHoneyClubMembership} from '../lib/honeyClubReconciliation.mjs';

const fmt = value => {
  if (!value) return 'Not recorded';
  const date = new Date(String(value).length === 10 ? `${value}T12:00:00` : String(value));
  return Number.isNaN(date.valueOf()) ? 'Not recorded' : date.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});
};
const palette = {dark:'#17394C',light:'#F2F8FB',border:'#CADDE6',muted:'#587482',warning:'#FFF5E4'};

/** Read-only; evidence is only session state and is never used to release a box. */
export default function AdminHoneyClubReconciliation({subscriptions=[],squareReviews={},squareErrors={},squareBusy='',onCheckSquare,localPreview=false,plans=[]}) {
  const [open,setOpen] = useState('');
  const [filter,setFilter] = useState('all');
  const items = useMemo(() => subscriptions.filter(s=>!s.archived_at).map(s=>({s,result:reconcileHoneyClubMembership(s,squareReviews[s.id])})),[subscriptions,squareReviews]);
  const shown = items.filter(item=>filter==='all'||item.result.disposition===filter);
  const counts = {
    checked: items.filter(({s})=>Boolean(squareReviews[s.id])).length,
    hold:items.filter(({result})=>result.disposition==='hold').length,
    setup:items.filter(({result})=>result.disposition==='setup').length,
    awaiting:items.filter(({result})=>result.disposition==='review').length,
  };
  return <section data-nf-honeyclub-reconciliation-v18="evidence-only" style={{background:'#F7FBFD',border:'2px solid #A7C5D2',borderRadius:12,padding:15,margin:'0 0 12px',color:palette.dark}}>
    <div style={{fontSize:11,fontWeight:900,letterSpacing:'.1em',color:'#33748B'}}>HONEY CLUB · PAYMENT & BOX RECONCILIATION</div>
    <h3 style={{fontSize:19,margin:'6px 0'}}>Match payments to actual boxes</h3>
    <p style={{fontSize:12.5,lineHeight:1.6,color:palette.muted}}>Compare paid Square invoices with local paid-box events and delivery history. A Square payment does <strong>not</strong> automatically prove that a particular box is covered. This report cannot clear, charge, schedule, or deliver any box.</p>
    <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(125px,1fr))',gap:8,margin:'12px 0'}}>
      {[[items.length,'Memberships'],[counts.checked,'Square checks this session'],[counts.checked===items.filter(({s})=>Boolean(s.square_subscription_id)).length?counts.hold:'Not fully checked','Square status holds'],[counts.setup,'Card setup to review']].map(([value,label])=><div key={label} style={{background:'#FFF',padding:10,border:`1px solid ${palette.border}`,borderRadius:9}}><strong style={{fontSize:21,display:'block'}}>{value}</strong><span style={{fontSize:11,color:palette.muted}}>{label}</span></div>)}
    </div>
    <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',gap:10,marginBottom:10}}>
      <strong style={{fontSize:13}}>Individual reconciliation queue</strong>
      <label style={{fontSize:12}}>Show <select aria-label="Filter reconciliation queue" value={filter} onChange={e=>setFilter(e.target.value)} style={{padding:7,borderRadius:7,marginLeft:5,border:`1px solid ${palette.border}`}}><option value="all">All</option><option value="review">Needs evidence review</option><option value="hold">Status holds</option><option value="setup">Setup incomplete</option></select></label>
    </div>
    {shown.length===0&&<p style={{fontSize:12,color:palette.muted}}>No memberships in this category.</p>}
    <div style={{display:'grid',gap:8}}>
      {shown.map(({s,result})=>{
        const expanded=open===s.id;
        const response=squareReviews[s.id];
        return <article key={s.id} style={{background:'#FFF',border:`1px solid ${palette.border}`,borderRadius:9,padding:12}}>
          <div style={{display:'flex',flexWrap:'wrap',gap:9,justifyContent:'space-between',alignItems:'center'}}>
            <div><strong>#{s.sub_no} · {s.plan_id || 'Honey Club'}</strong><div style={{fontSize:12,color:result.disposition==='hold'?'#9B4334':'#785C2C',fontWeight:750,marginTop:3}}>{result.label}</div></div>
            <div style={{display:'flex',gap:7,flexWrap:'wrap'}}>
              <button type="button" className="btn" style={{padding:'7px 10px',fontSize:12}} onClick={()=>setOpen(expanded?'':s.id)} aria-expanded={expanded}>{expanded?'Hide evidence':'Review evidence'}</button>
              {<button type="button" className="btn" disabled={localPreview||Boolean(squareBusy)} title={localPreview?'Local preview cannot call Square.':'Admin-authenticated read-only lookup'} style={{padding:'7px 10px',fontSize:12}} onClick={()=>onCheckSquare?.(s.id)}>{squareBusy===s.id?'Checking…':s.square_subscription_id?'Check Square (read only)':'Check local evidence'}</button>}
            </div>
          </div>
          {expanded&&<div style={{marginTop:12,borderTop:`1px solid ${palette.border}`,paddingTop:10,fontSize:12.5,lineHeight:1.7}}>
            <div>Saved next delivery: <strong>{fmt(s.next_delivery_date)}</strong> · Last saved delivery: <strong>{fmt(s.last_delivered_at)}</strong></div>
            <div>Legacy box counter: <strong>{Number(s.boxes_sent||0)}</strong> · Initial prepaid first box: <strong>{s.prepaid_first_box_paid_at?fmt(s.prepaid_first_box_paid_at):'Not recorded separately'}</strong></div>
            <div>Square status: <strong>{result.squareStatus||'Not checked this session'}</strong> · Paid invoices found: <strong>{response?.invoices?.state==='verified'?result.paidInvoices:'Not verified'}</strong></div>
            <div>Local history: <strong>{result.localHistoryState}</strong> · Verified invoice/event links: <strong>{response?.localEvidence?.state==='verified'&&response?.invoices?.state==='verified'?result.invoiceLinks:'Not verified'}</strong> · Recorded deliveries: <strong>{response?.localEvidence?.state==='verified'?result.deliveredCount:'Not loaded'}</strong></div>
            
            {squareErrors[s.id]&&<p role="alert" style={{color:'#9B4334'}}>{squareErrors[s.id]}</p>}
            {localPreview&&<p style={{color:palette.muted}}>Live Square checks are intentionally disabled in this local browse-only preview.</p>}
            {result.warnings.map((warning,i)=><p key={`${i}-${warning}`} style={{margin:'6px 0',padding:'6px 9px',background:palette.warning,borderRadius:6}}>{warning}</p>)}
            {result.paidInvoiceRows.length>0&&<div style={{overflowX:'auto',marginTop:10}}><strong>PAID Square invoices (not exact payment timestamps)</strong><table style={{fontSize:11.5,width:'100%',borderCollapse:'collapse',marginTop:5}}><thead><tr>{['Invoice','Created','Last updated','Local box link'].map(label=><th scope="col" key={label} style={{padding:6,textAlign:'left',borderBottom:`1px solid ${palette.border}`}}>{label}</th>)}</tr></thead><tbody>{result.paidInvoiceRows.map(row=><tr key={row.id}><td style={{padding:6}}>{row.number||row.id.slice(0,12)}</td><td style={{padding:6}}>{fmt(row.createdAt)}</td><td style={{padding:6}}>{fmt(row.updatedAt)}</td><td style={{padding:6}}>{result.boxEventRows.some(e=>e.squareInvoiceId===row.id)?'Linked':'Not linked'}</td></tr>)}</tbody></table></div>}
            {result.boxEventRows.length>0&&<div style={{overflowX:'auto',marginTop:10}}><strong>Local box-payment events (not automatic box clearance)</strong><table style={{fontSize:11.5,width:'100%',borderCollapse:'collapse',marginTop:5}}><thead><tr>{['Box #','Paid event date','Square invoice link','PAID invoice match'].map(label=><th key={label} scope="col" style={{padding:6,textAlign:'left',borderBottom:`1px solid ${palette.border}`}}>{label}</th>)}</tr></thead><tbody>{result.boxEventRows.map(row=><tr key={row.id}><td style={{padding:6}}>{row.boxNumber??'Unknown'}</td><td style={{padding:6}}>{fmt(row.paidAt)}</td><td style={{padding:6}}>{row.squareInvoiceId?`${row.squareInvoiceId.slice(0,12)}…`:'No invoice ID recorded'}</td><td style={{padding:6}}>{result.paidInvoiceRows.some(inv=>inv.id===row.squareInvoiceId)?'Matched PAID invoice':'Check separately'}</td></tr>)}</tbody></table></div>}
            {result.deliveryRows.length>0&&<div style={{marginTop:10}}><strong>Saved delivery events</strong>{result.deliveryRows.map(row=><div key={row.id} style={{fontSize:11.5,padding:'4px 0'}}>Scheduled {fmt(row.scheduledFor)} · {row.deliveredAt?`Delivered ${fmt(row.deliveredAt)}`:'No completion timestamp'}</div>)}</div>}
            <p style={{color:'#7D5830',background:palette.warning,borderRadius:7,padding:9,marginTop:10}}>Manual decision required: identify which paid invoice (or separately prepaid first box) covers the next scheduled delivery. No automatic fulfillment permission is granted by this screen.</p>
          </div>}
        </article>;
      })}
    </div>
    <p style={{fontSize:11,color:palette.muted,margin:'10px 0 0'}}>Read only. No billing alignment, subscription changes, database writes, emails or fulfillment release. Square records and local payment events must be reconciled individually.</p>
  </section>;
}
