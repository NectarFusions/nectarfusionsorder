import {useMemo,useState} from 'react';
import {firstAlignedRenewal,futureCycles,billingAssessment,groupDeliveryRoutes,firstZoneDelivery,nextFirstOnOrAfter} from '../lib/honeyClubBillingCalendar.mjs';
import * as api from '../lib/api'; // nf-square-billing-v14
import AdminHoneyClubRoutePlanner from './AdminHoneyClubRoutePlanner';
import AdminHoneyClubReconciliation from './AdminHoneyClubReconciliation';
import {secondWeekOptions} from '../lib/honeyClubRoutePlanner.mjs';

const asDate = d => d ? new Date(`${String(d).slice(0,10)}T12:00:00`).toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'}) : 'Not recorded';
const todayLocal=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Detroit',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const monthName = m => new Date(`${m}-01T12:00:00`).toLocaleDateString(undefined,{month:'long',year:'numeric'});
const shiftMonth=(s,delta)=> {const [y,m]=s.split('-').map(Number);const d=new Date(y,m-1+delta,1);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;};
const dateVal=value=>value?String(value).slice(0,10):'';
const followingFirst = day => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(day||''))) return '';
  const parsed = new Date(`${day}T12:00:00Z`);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0,10)!==day) return '';
  parsed.setUTCDate(parsed.getUTCDate()+1);
  return nextFirstOnOrAfter(parsed.toISOString().slice(0,10));
};

/** Read-only review; actual Square bill dates MUST be independently retrieved before any action. */
export default function AdminHoneyClubBillingCalendar({subscriptions=[],zones=[],plans=[]}) {
  const [month,setMonth]=useState(()=>{
    const today=todayLocal();
    return (subscriptions||[]).filter(s=>s.status==='active'&&dateVal(s.next_delivery_date)>=today).map(s=>dateVal(s.next_delivery_date)).sort()[0]?.slice(0,7)||today.slice(0,7);
  });
  const [filter,setFilter]=useState('all');
  const [joinDate,setJoinDate]=useState(()=>todayLocal());
  const [cadence,setCadence]=useState('2mo');
  const [selectedZone,setSelectedZone]=useState('');
  const [expanded,setExpanded]=useState('');
  const [squareReviews,setSquareReviews]=useState({});
  const [squareErrors,setSquareErrors]=useState({});
  const [squareBusy,setSquareBusy]=useState('');
  const [paidThroughDraft,setPaidThroughDraft]=useState({});
  const devPreview=import.meta.env.DEV;
  const checkSquare=async id=>{
    if(devPreview||squareBusy)return;
    setSquareBusy(id);
    setSquareErrors(previous=>({...previous,[id]:''}));
    try {const result=await api.getHoneyClubSquareBillingReview(id);setSquareReviews(previous=>({...previous,[id]:result}));}
    catch(error){setSquareErrors(previous=>({...previous,[id]:error.message||'Could not review Square.'}));}
    finally {setSquareBusy('');}
  };
  const rows=(subscriptions||[]).filter(s=>!s.archived_at);
  const proposedFirst=firstAlignedRenewal(joinDate,cadence);
  const proposedCycles=futureCycles(proposedFirst,cadence,4);
  const routes=useMemo(()=>Object.values(groupDeliveryRoutes(rows,zones,month)).sort((a,b)=>a.date.localeCompare(b.date)||a.zone.localeCompare(b.zone)),[subscriptions,zones,month]);
  const needsReview=rows.filter(s=>billingAssessment(s).length>0);
  const filtered=rows.filter(s=>filter==='all'||filter==='review'&&billingAssessment(s).length>0||filter===s.zone_id);
  const sampleZone=zones.find(z=>z.id===selectedZone);
  const buttonStyle={padding:'8px 12px',fontSize:12.5};
  return <section data-nf-billing-calendar-v13="read-only" style={{border:'2px solid #A5C5D5',borderRadius:16,padding:'clamp(14px,3vw,20px)',background:'#F7FBFD',color:'#16384A',margin:'0 0 18px'}}>
    <div style={{fontSize:11,fontWeight:900,letterSpacing:'.12em',color:'#307392'}}>HONEY CLUB · BILLING & DELIVERY CALENDAR</div>
    <h2 style={{margin:'7px 0',fontSize:24,color:'#16384A'}}>One billing date. Organized delivery routes.</h2>
    <p style={{fontSize:13,lineHeight:1.6,margin:'6px 0 12px',color:'#466475'}}>Proposed policy: initial payment at signup, followed by full-price renewals on the first eligible 1st after a complete monthly or two-month period. Proposed area routes are grouped for the second week, after payment review. <strong>Preview only — Square billing dates have not been verified or changed.</strong></p>
    <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(140px,1fr))',gap:8,margin:'12px 0 16px'}}>
      {[[rows.filter(s=>s.status==='active').length,'Active'],[rows.filter(s=>s.status==='pending').length,'Pending setup'],[needsReview.length,'To reconcile'],[routes.reduce((n,r)=>n+r.members.length,0),'Deliveries this month']].map(([count,title])=><div key={title} style={{padding:12,background:'#FFF',borderRadius:10,border:'1px solid #DBE9EE'}}><strong style={{display:'block',fontSize:24}}>{count}</strong><span style={{fontSize:11,color:'#64808B',fontWeight:800}}>{title}</span></div>)}
    </div>
    <div style={{padding:14,background:'white',border:'1px solid #D8E5EB',borderRadius:12,marginBottom:12}}>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',gap:8}}><h3 style={{margin:0,fontSize:16}}>Delivery routes · {monthName(month)}</h3><div style={{display:'flex',gap:7}}><button className="btn" style={buttonStyle} onClick={()=>setMonth(x=>shiftMonth(x,-1))} aria-label="Previous month">←</button><button className="btn" style={buttonStyle} onClick={()=>setMonth(todayLocal().slice(0,7))}>This month</button><button className="btn" style={buttonStyle} onClick={()=>setMonth(x=>shiftMonth(x,1))} aria-label="Next month">→</button></div></div>
      {routes.length===0?<p style={{fontSize:13,color:'#64808B'}}>No recorded delivery dates for this month. This is not proof that no paid boxes are due; confirm invoices and first-box fulfillment separately.</p>:<div style={{display:'grid',gap:8,marginTop:11}}>{routes.map(r=><div key={r.key} style={{display:'flex',gap:10,justifyContent:'space-between',flexWrap:'wrap',padding:11,background:'#F5FAFC',border:'1px solid #DDE9EE',borderRadius:9}}><div><strong>{asDate(r.date)}</strong><div style={{fontSize:12,color:'#587483'}}>{r.zone}</div></div><strong>{r.members.length} box{r.members.length===1?'':'es'} · {r.members.map(s=>`#${s.sub_no}`).join(', ')}</strong></div>)}</div>}
    </div>
    <AdminHoneyClubReconciliation subscriptions={rows} squareReviews={squareReviews} squareErrors={squareErrors} squareBusy={squareBusy} onCheckSquare={checkSquare} localPreview={devPreview} plans={plans} />
    <AdminHoneyClubRoutePlanner subscriptions={rows} zones={zones} month={month} squareReviews={squareReviews} />
    <div style={{padding:14,background:'white',border:'1px solid #D8E5EB',borderRadius:12,marginBottom:12}}>
      <h3 style={{margin:'0 0 5px',fontSize:16}}>Preview new enrollment dates</h3><p style={{fontSize:12,color:'#587483',lineHeight:1.5,margin:'0 0 12px'}}>Illustrative only. The first box is paid at signup. A full subscription period passes before the next first-of-month renewal. Exact billing requires matching Square plan configuration.</p>
      <div style={{display:'flex',gap:12,flexWrap:'wrap',alignItems:'end'}}><label style={{fontSize:12,fontWeight:750,display:'grid',gap:5}}>Initial paid date<input aria-label="Initial payment date" type="date" value={joinDate} onChange={e=>setJoinDate(e.target.value)} style={{padding:9,maxWidth:180,borderRadius:8,border:'1px solid #B8CED8'}} /></label><label style={{fontSize:12,fontWeight:750,display:'grid',gap:5}}>Membership frequency<select aria-label="Subscription frequency" value={cadence} onChange={e=>setCadence(e.target.value)} style={{padding:9,maxWidth:180,borderRadius:8,border:'1px solid #B8CED8'}}><option value="1mo">Monthly</option><option value="2mo">Every two months</option></select></label><label style={{fontSize:12,fontWeight:750,display:'grid',gap:5}}>Delivery region<select aria-label="Delivery region" value={selectedZone} onChange={e=>setSelectedZone(e.target.value)} style={{padding:9,maxWidth:190,borderRadius:8,border:'1px solid #B8CED8'}}><option value="">Select optional region</option>{zones.map(z=><option value={z.id} key={z.id}>{z.name}</option>)}</select></label></div>
      <div style={{marginTop:12,padding:12,borderRadius:9,background:'#FFF9E8',border:'1px solid #EADAAE',fontSize:13}}><strong>Proposed first renewal: {asDate(proposedFirst)}</strong><div style={{marginTop:6,color:'#76582F',lineHeight:1.5}}>Later renewals: {proposedCycles.slice(1).map(asDate).join(' · ')||'Choose a valid date'}</div>{sampleZone&&<div style={{marginTop:6}}>Illustrative second-week area route after first renewal: {asDate((secondWeekOptions(proposedFirst.slice(0,7),sampleZone.days||[])[0]?.day||''))} (subject to blocked dates and payment confirmation).</div>}</div>
    </div>
    <div style={{padding:14,background:'white',border:'1px solid #D8E5EB',borderRadius:12}} data-nf-billing-review-v13-1="full-local-records">
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:10,flexWrap:'wrap'}}>
        <h3 style={{margin:0,fontSize:16}}>Existing memberships · alignment review</h3>
        <select aria-label="Filter memberships" value={filter} onChange={e=>setFilter(e.target.value)} style={{fontSize:12,padding:9,borderRadius:8,border:'1px solid #B8CED8'}}>
          <option value="all">All ({rows.length})</option>
          <option value="review">Reconciliation review ({needsReview.length})</option>
          {zones.map(z=><option key={z.id} value={z.id}>{z.name}</option>)}
        </select>
      </div>
      <p style={{fontSize:12,color:'#476778',lineHeight:1.6,margin:'8px 0 12px'}}>
        The customer records and delivery details are intact. A blank local invoice field does <strong>not</strong> mean the customer failed to pay. A separate read-only Square review can check the real subscription status and paid invoices after this feature is approved for production. No billing data is edited here.
      </p>
      <div style={{display:'flex',gap:8,flexWrap:'wrap',marginBottom:12}}>
        <span style={{background:'#EDF7F1',color:'#275C45',padding:'7px 10px',borderRadius:9,fontSize:12,fontWeight:750}}>{rows.filter(s=>s.customers && (Array.isArray(s.customers)?s.customers[0]?.email:s.customers.email)).length} linked customer emails</span>
        <span style={{background:'#EFF7FA',color:'#27566B',padding:'7px 10px',borderRadius:9,fontSize:12,fontWeight:750}}>{rows.filter(s=>s.square_subscription_id).length} Square subscription connections</span>
        <span style={{background:'#FFF6E7',color:'#76531D',padding:'7px 10px',borderRadius:9,fontSize:12,fontWeight:750}}>{rows.filter(s=>s.status==='pending'&&!s.square_subscription_id).length} awaiting card setup</span>
      </div>
      {filtered.length===0&&<p>No matching memberships in this view.</p>}
      <div style={{display:'grid',gap:10}}>
        {filtered.map(s=>{
          const customer=Array.isArray(s.customers)?s.customers[0]||{}:s.customers||{};
          const plan=plans.find(p=>String(p.id)===String(s.plan_id))||{};
          const zone=zones.find(z=>z.id===s.zone_id);
          const flags=billingAssessment(s);
          const open=expanded===s.id;
          const verified=squareReviews[s.id];
          const sq=verified?.square;
          const invoice=verified?.invoices;
          const reviewError=squareErrors[s.id];
          const through=paidThroughDraft[s.id]??'';
          const proposed=followingFirst(through);
          const price=Number.isFinite(Number(plan.price_cents))?Number(plan.price_cents)/100:null;
          const fmtPrice=price===null?'Not available':new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(price);
          const emptyLabel='Not recorded in NectarFusions';
          const line=(label,value,help)=> <div style={{marginTop:5,lineHeight:1.55}}><strong>{label}:</strong> {value||emptyLabel}{help&&<span style={{display:'block',color:'#617985',fontSize:11.5}}>{help}</span>}</div>;
          return <article key={s.id} style={{padding:13,border:'1px solid #D8E5EB',borderRadius:11,background:'#FCFDFE'}}>
            <div style={{display:'flex',gap:10,justifyContent:'space-between',alignItems:'start',flexWrap:'wrap'}}>
              <div>
                <strong style={{fontSize:15}}>{customer.name||'Customer name not recorded'} · Honey Club #{s.sub_no}</strong>
                <div style={{fontSize:12.5,color:'#456C80',marginTop:4}}>{plan.name||s.plan_id||'Membership'} · {s.cadence==='1mo'?'Monthly':'Every two months'} · {zone?.name||'Zone not assigned'}</div>
                <div style={{fontSize:12,marginTop:5,fontWeight:800,color:s.status==='active'?'#2D704B':'#7A592A'}}>Membership {String(s.status||'unknown').replaceAll('_',' ')}</div>
              </div>
              <button type="button" className="btn" style={{...buttonStyle,background:open?'#F1F7FA':undefined}} onClick={()=>setExpanded(v=>v===s.id?'':s.id)} aria-expanded={open}>
                {open?'Hide full record ▲':'View full record ▼'}
              </button>
            </div>
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(150px,1fr))',gap:8,marginTop:11}}>
              {[["Next delivery",s.next_delivery_date?asDate(s.next_delivery_date):'Not scheduled'],["Last delivery",s.last_delivered_at?asDate(s.last_delivered_at):'Not recorded'],["Square account",s.square_subscription_id?'Connected':s.status==='pending'?'Setup pending':'Not linked']].map(([label,value])=><div key={label} style={{background:'#F2F7FA',padding:'9px 10px',borderRadius:8}}><div style={{fontSize:10,color:'#67818D',fontWeight:850,textTransform:'uppercase'}}>{label}</div><div style={{fontSize:12.5,fontWeight:800,marginTop:4}}>{value}</div></div>)}
            </div>
            {flags.length>0&&<div style={{fontSize:12,marginTop:10,color:'#735628',background:'#FFF9EB',borderRadius:8,padding:9}}><strong>Review items:</strong> {flags.map(flag=>{
                if(flag==='Square invoice history needs reconciliation')return 'Compare local invoice records with Square';
                if(flag==='Delivery recorded; paid-box counter is zero')return 'Match delivered box to Square payment record';
                if(flag==='Paid-box counter and delivery history need review')return 'Confirm how the counted box was fulfilled';
                if(flag==='Card setup still pending')return 'Complete recurring card setup';
                if(flag==='Future recurring start must be rechecked')return 'Confirm scheduled recurring start';
                return flag;
              }).join(' · ')}. These labels do not mean that a payment was missed.</div>}
            {open&&<div style={{marginTop:11,padding:13,background:'#F4F9FB',borderRadius:9,fontSize:12.5,lineHeight:1.7}}>
              <div style={{fontSize:12,fontWeight:900,letterSpacing:'.06em',color:'#2B6C85',marginBottom:4}}>CUSTOMER CONTACT</div>
              {line('Name',customer.name)}
              {line('Email',customer.email)}
              {line('Phone',customer.phone)}
              {line('Address',s.address)}
              {line('ZIP',s.delivery_zip)}
              {line('Delivery zone',zone?.name||s.zone_id)}
              <div style={{height:1,background:'#DAE6EB',margin:'12px 0'}} />
              <div style={{fontSize:12,fontWeight:900,letterSpacing:'.06em',color:'#2B6C85'}}>MEMBERSHIP & FULFILLMENT</div>
              {line('Plan',plan.name||s.plan_id)}
              {line('Current catalog price',fmtPrice,'Reference only. Existing Square billing price has not been verified.')}
              {line('Frequency',s.cadence==='1mo'?'Monthly':s.cadence==='2mo'?'Every two months':s.cadence)}
              {line('Fulfillment',s.method==='delivery'?'Local delivery':s.method==='market'?'Market pickup':s.method==='ship'?'Shipping':s.method)}
              {line('Signed up',asDate(s.started_at))}
              {line('Last recorded delivery',s.last_delivered_at?asDate(s.last_delivered_at):emptyLabel,'If blank, this review has no admin delivery timestamp; it is not proof that a box was not delivered.')}
              {line('Next scheduled delivery',s.next_delivery_date?asDate(s.next_delivery_date):'Not yet scheduled')}
              <div style={{height:1,background:'#DAE6EB',margin:'12px 0'}} />
              <div style={{fontSize:12,fontWeight:900,letterSpacing:'.06em',color:'#2B6C85'}}>LOCAL PAYMENT TRACKING (NOT SQUARE INVOICES)</div>
              {line('Local invoice timestamp',s.last_invoice_at?asDate(s.last_invoice_at):'No timestamp saved locally','This field can be blank even when Square has collected a payment.')}
              {line('Prepaid first box',s.prepaid_first_box_paid_at?asDate(s.prepaid_first_box_paid_at):'No separate prepaid-first-box entry','This only applies to a specially recorded prepaid-first-box workflow.')}
              {line('Recorded box counter',String(Number(s.boxes_sent||0)),'Historical records may require reconciliation; this counter is not a live Square payment ledger.')}
              {line('Square subscription',s.square_subscription_id?'Connected to Square':s.status==='pending'?'Card setup not completed':'Not linked')}
              {line('Locally scheduled recurring start',s.recurring_start_date?asDate(s.recurring_start_date):'Not separately scheduled')}
              <section data-nf-square-billing-v14="read-only" style={{background:'#EAF3F8',borderRadius:9,padding:12,marginTop:12}}>
                <strong>Square billing verification</strong>
                <p style={{fontSize:11.5,color:'#466B80',lineHeight:1.5,margin:'5px 0 9px'}}>Payment status in this panel comes from Square only after an authenticated lookup. An existing subscription connection does not by itself verify paid invoices.</p>
                {s.square_subscription_id ? <button type="button" className="btn" style={buttonStyle} disabled={devPreview||Boolean(squareBusy)} onClick={()=>checkSquare(s.id)}>{squareBusy===s.id?'Checking Square…':sq?'Refresh Square status':'Check Square billing (read only)'}</button> : <strong>Recurring card setup pending · no Square subscription linked</strong>}
                {devPreview&&<p style={{fontSize:11.5,color:'#617985',margin:'7px 0'}}>Live Square requests are disabled in local preview. This read-only checker becomes available only after the new server function is reviewed and deployed.</p>}
                {reviewError&&<p role="alert" style={{color:'#9A2D2D'}}>{reviewError}</p>}
                {sq&&<div style={{marginTop:10}}>
                  {line('Square subscription status',sq.status)}
                  {line('Square card on file',sq.hasCardOnFile?'Card connected':'No card ID returned by Square')}
                  {line('Current Square billing day',sq.billingAnchorDay?`Day ${sq.billingAnchorDay}`:'Not supplied by Square')}
                  {line('Paid through (Square)',sq.paidUntilDate?asDate(sq.paidUntilDate):'Not supplied by Square')}
                  {line('Charged through (Square)',sq.chargedThroughDate?asDate(sq.chargedThroughDate):'Not supplied by Square')}
                  {line('Paid recurring invoices found',invoice?.state==='verified'?String(invoice.paidCount):'Invoice verification unavailable or incomplete')}
                  {line('Latest PAID invoice updated',invoice?.state==='verified'&&invoice.latestPaidInvoiceUpdatedAt?asDate(invoice.latestPaidInvoiceUpdatedAt):'Not supplied')}
                  {line('Pending Square anchor change',sq.pendingAnchorDay?`Day ${sq.pendingAnchorDay} effective ${sq.pendingAnchorEffectiveOn||'date unknown'}`:'None returned')}
                  <p style={{fontSize:11.5,color:'#466B80',margin:'6px 0'}}>{invoice?.explanation}</p>
                  <p style={{fontSize:11.5,color:'#466B80',margin:'6px 0'}}>The exact next automatic charge date is not guaranteed by this Square response; verify the next invoice in Square before rescheduling.</p>
                </div>}
                {!verified&&<p style={{fontSize:11.5,color:'#466B80',margin:'8px 0 0'}}>Square next charge date and paid-through period have not been retrieved here. Your live Square Dashboard remains the billing source of truth.</p>}
              </section>
              <section style={{background:'#FFF9E8',border:'1px solid #E9D9AA',borderRadius:9,padding:12,marginTop:10}}>
                <strong>Align to the 1st · review only</strong>
                <p style={{fontSize:11.5,color:'#6C5B38',lineHeight:1.5,margin:'6px 0'}}>After checking Square, enter the last date already paid for. This calculator does not update Square or take payment. A shortened billing cycle must be approved with the customer before scheduling.</p>
                <label style={{display:'grid',gap:5,fontWeight:750,fontSize:12}}>Date currently paid through (verified in Square)
                  <input type="date" value={through} onChange={event=>setPaidThroughDraft(previous=>({...previous,[s.id]:event.target.value}))} style={{maxWidth:230,padding:8,border:'1px solid #C7B78D',borderRadius:8}} />
                </label>
                <div style={{marginTop:9,fontSize:13,fontWeight:850}}>{proposed?`Earliest proposed first-of-month renewal: ${asDate(proposed)}`:'Enter a verified paid-through date to preview the next renewal'}</div>
                {proposed&&<div style={{fontSize:12,marginTop:5}}>Following renewals ({s.cadence==='1mo'?'monthly':'every two months'}): {futureCycles(proposed,s.cadence,4).slice(1).map(asDate).join(' · ')}</div>}
                <p style={{fontSize:11.5,color:'#6C5B38',margin:'8px 0 0'}}>No Charge Now action. Scheduling a Square billing-anchor change requires a separate, explicitly approved process.</p>
              </section>
            </div>}
          </article>;
        })}
      </div>
    </div>
    <p style={{fontSize:11,color:'#587483',margin:'12px 0 0',lineHeight:1.5}}>READ-ONLY PREVIEW · No charges, billing-anchor changes, customer emails, or subscription updates. Existing Square records require individual reconciliation.</p>
  </section>;
}
