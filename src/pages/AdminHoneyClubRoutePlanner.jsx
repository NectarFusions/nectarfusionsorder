import {useMemo,useState} from 'react';
import {planRoutes,squareRouteRisk,countsForRoute} from '../lib/honeyClubRoutePlanner.mjs';

const palette={text:'#17394C',muted:'#5A7482',border:'#D8E6EC',blue:'#EDF6FA',amber:'#FFF7E4',green:'#EAF4EF'};
const dateLabel = day => day ? new Date(`${day}T12:00:00`).toLocaleDateString('en-US',{weekday:'long',month:'short',day:'numeric'}) : 'No weekday configured';
const checkStyle = risk => ({fontSize:11,fontWeight:750,color:risk.level==='hold'?'#983C34':risk.level==='review'?'#805F23':'#375F75'});
const card = {padding:14,border:'1px solid #D8E6EC',borderRadius:12,background:'#FFF'};

/** Completely session-local planner. All existing delivery dates remain unchanged. */
export default function AdminHoneyClubRoutePlanner({subscriptions=[],zones=[],month='',squareReviews={}}) {
  const [choices,setChoices]=useState({});
  const result=useMemo(()=>planRoutes(subscriptions,zones,month),[subscriptions,zones,month]);
  const totals=useMemo(()=>countsForRoute(result.routes,squareReviews),[result,squareReviews]);
  const displayedDates=result.routes.map(route=>choices[`${month}:${route.key}`]||route.suggestedDate).filter(Boolean);
  const duplicatedDays=displayedDates.filter((day,i)=>displayedDates.indexOf(day)!==i);
  return <section data-nf-route-planner-v15="read-only" style={{...card,marginBottom:12,border:'2px solid #9CC5D1',background:'#F4FAFC',color:palette.text}}>
    <div style={{fontSize:11,letterSpacing:'.12em',fontWeight:900,color:'#34768E'}}>HONEY CLUB · ROUTE-FIRST PLANNER</div>
    <h3 style={{margin:'6px 0',fontSize:19}}>One area. One delivery day.</h3>
    <p style={{fontSize:12.5,color:palette.muted,lineHeight:1.6,margin:'4px 0 12px'}}>Planning only: show the existing deliveries for the calendar month above, group by area and ZIP, and suggest one allowed route day in the second week. All proposed dates stay in this browser session. Nothing is saved or sent to customers.</p>
    <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(115px,1fr))',gap:8,margin:'0 0 12px'}}>
      {[[result.routes.length,'Delivery areas'],[totals.boxes,'Scheduled boxes'],[totals.areaDays,'Proposed area days'],[totals.holds+totals.checks+totals.reviewsNeeded,'Payment checks pending']].map(([count,label])=><div key={label} style={{background:'#FFF',border:`1px solid ${palette.border}`,borderRadius:9,padding:10}}><strong style={{fontSize:22,display:'block'}}>{count}</strong><span style={{fontSize:11,color:palette.muted}}>{label}</span></div>)}
    </div>
    {result.routes.length===0 && <div style={{...card,fontSize:13,color:palette.muted}}>No active local-delivery memberships have a recorded next delivery in this month. No future renewals have been invented.</div>}
    <div style={{display:'grid',gap:10}}>
      {result.routes.map(route=>{
        const prefKey=`${month}:${route.key}`;
        const selection=route.options.some(opt=>opt.day===choices[prefKey])?choices[prefKey]:route.suggestedDate;
        return <article key={route.key} style={card}>
          <div style={{display:'flex',justifyContent:'space-between',gap:10,flexWrap:'wrap',alignItems:'flex-start'}}>
            <div><strong style={{fontSize:16}}>{route.zoneName}</strong><div style={{fontSize:12,color:palette.muted,marginTop:4}}>{route.members.length} box{route.members.length!==1?'es':''} · {route.zipGroups.length} ZIP group{route.zipGroups.length!==1?'s':''}</div></div>
            <label style={{display:'grid',gap:5,fontSize:12,fontWeight:750}}>Proposed area delivery day
              <select aria-label={`Proposed delivery day for ${route.zoneName}`} value={selection} disabled={!route.options.length} onChange={e=>setChoices(old=>({...old,[prefKey]:e.target.value}))} style={{minWidth:180,maxWidth:'100%',padding:8,borderRadius:8,border:'1px solid #B4CAD4',background:'#FFF',color:palette.text}}>
                {route.options.length ? route.options.map(option=><option key={option.day} value={option.day}>{dateLabel(option.day)}</option>) : <option value="">Delivery weekdays unavailable</option>}
              </select>
            </label>
          </div>
          <p style={{fontSize:11.5,color:palette.muted,margin:'8px 0'}}>Existing saved delivery date{route.existingDates.length===1?'':'s'}: {route.existingDates.join(', ')}. <strong>Proposed: {selection?dateLabel(selection):'not available'}</strong>. Neither has been changed.</p>
          {route.members.length===1&&<p style={{fontSize:11.5,background:palette.amber,borderRadius:8,padding:8,margin:'8px 0'}}>Only one membership in this area this month. Review travel cost or agree on pickup or an alternative with the customer.</p>}
          {!selection&&<p style={{fontSize:11.5,background:palette.amber,padding:8,borderRadius:8}}>No delivery weekdays configured for this area. Choose an approved route rule before assigning a date.</p>}
          <div style={{display:'grid',gap:7}}>
            {route.zipGroups.map(group=><div key={group.zip} style={{background:palette.blue,padding:'9px 10px',borderRadius:8}}>
              <strong style={{fontSize:12}}>ZIP {group.zip} · {group.members.length} box{group.members.length!==1?'es':''}</strong>
              {group.members.map(member=>{const risk=squareRouteRisk(member,squareReviews[member.id]);return <div key={member.id} style={{display:'flex',justifyContent:'space-between',gap:8,flexWrap:'wrap',paddingTop:5,fontSize:12}}><span><strong>#{member.sub_no}</strong> · {member.cadence==='1mo'?'Monthly':member.cadence==='2mo'?'Every two months':'Cadence unknown'}</span><span style={checkStyle(risk)}>{risk.label}</span></div>;})}
            </div>)}
          </div>
        </article>;
      })}
    </div>
    {duplicatedDays.length>0&&<p style={{padding:10,background:palette.amber,borderRadius:8,fontSize:12}}>More than one delivery area is proposed on {Array.from(new Set(duplicatedDays)).map(dateLabel).join(', ')}. Check driving capacity or select another allowed date.</p>}
    {(result.pending.length>0||result.notScheduled.length>0)&&<p style={{fontSize:12,margin:'10px 0',color:palette.muted}}><strong>Excluded from proposed routes:</strong> {result.pending.length} pending setup; {result.notScheduled.length} active delivery memberships without a recorded next date. Review them separately.</p>}
    <div style={{fontSize:11.5,color:'#705B39',background:palette.amber,border:'1px solid #EADAB6',borderRadius:9,padding:10,marginTop:11,lineHeight:1.55}}><strong>Payment and fulfillment safeguard:</strong> Square payment history alone does not prove a particular box is covered. Check exact invoice, billing period and customer entitlement before delivery. A paused subscription is always on hold. New every-two-month enrollments can eventually follow the November/January/March cycle, but this planner does not migrate anyone, charge cards, schedule deliveries, or optimize driving order. Proposed dates also require holiday, inventory and customer confirmation.</div>
  </section>;
}
