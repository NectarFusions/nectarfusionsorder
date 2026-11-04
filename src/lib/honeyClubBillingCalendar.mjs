/** Honey Club calendar projections. Read-only: never charge or modify a subscription. */
const DATE = /^\d{4}-\d{2}-\d{2}$/;
export function asDay(value) {
  const s = String(value || '').slice(0, 10);
  if (!DATE.test(s)) return '';
  const t = new Date(`${s}T12:00:00Z`);
  return !Number.isNaN(t.valueOf()) && t.toISOString().slice(0,10)===s ? s : '';
}
export function addMonths(day, count) {
  const s=asDay(day); if (!s) return '';
  const [y,m,d]=s.split('-').map(Number);
  const monthIdx=y*12+m-1+count;
  const year=Math.floor(monthIdx/12), mon=monthIdx%12+1;
  const last=new Date(Date.UTC(year,mon,0)).getUTCDate();
  return `${year}-${String(mon).padStart(2,'0')}-${String(Math.min(d,last)).padStart(2,'0')}`;
}
export function nextFirstOnOrAfter(day) {
  const s=asDay(day); if (!s)return '';
  return s.endsWith('-01')?s:addMonths(`${s.slice(0,7)}-01`,1);
}
export function monthsForCadence(cadence) {
  return cadence==='1mo'?1:cadence==='2mo'?2:0;
}
export function firstAlignedRenewal(initialPaidOn,cadence) {
  const months=monthsForCadence(cadence);
  return months?nextFirstOnOrAfter(addMonths(initialPaidOn,months)):'';
}
export function futureCycles(start,cadence,count=4) {
  const months=monthsForCadence(cadence);
  if (!months || !asDay(start))return [];
  return Array.from({length:Math.max(0,Math.min(12,count))},(_,i)=>addMonths(start,i*months));
}
export function firstZoneDelivery(monthDay,weekdays,blocked=[]) {
  const day=asDay(monthDay); if (!day||!Array.isArray(weekdays)||weekdays.length===0)return '';
  const first=`${day.slice(0,7)}-01`;
  const y=Number(day.slice(0,4)),m=Number(day.slice(5,7))-1;
  for(let offset=0;offset<14;offset++){
    const d=new Date(Date.UTC(y,m,1+offset));
    if(d.getUTCMonth()!==m)break;
    const current=d.toISOString().slice(0,10);
    if(weekdays.includes(d.getUTCDay())&&!blocked.includes(current))return current;
  }
  return '';
}
export function billingAssessment(s) {
  const flags=[];
  if(s.status==='pending'&&!s.square_subscription_id) flags.push('Card setup still pending');
  if(s.status==='active'&&!s.square_subscription_id) flags.push('Active membership lacks Square subscription');
  if(s.status==='active'&&s.square_subscription_id&&!s.last_invoice_at) flags.push('Square invoice history needs reconciliation');
  if(s.status==='active'&&s.last_delivered_at&&Number(s.boxes_sent||0)===0) flags.push('Delivery recorded; paid-box counter is zero');
  if(s.status==='active'&&!s.last_delivered_at&&Number(s.boxes_sent||0)>0) flags.push('Paid-box counter and delivery history need review');
  if(s.recurring_start_date&&!s.square_subscription_id) flags.push('Future recurring start must be rechecked');
  if(!s.next_delivery_date&&s.status==='active'&&s.method==='delivery'&&s.last_delivered_at) flags.push('Next delivery date missing');
  return flags;
}
export function groupDeliveryRoutes(subs,zones,fromMonth) {
  const month=String(fromMonth||'').slice(0,7);
  return (subs||[]).filter(s=>s.status==='active'&&asDay(s.next_delivery_date).startsWith(month))
    .reduce((acc,s)=>{
      const z=(zones||[]).find(zone=>zone.id===s.zone_id);
      const key=`${s.next_delivery_date}|${s.zone_id||'unknown'}`;
      if(!acc[key])acc[key]={key,date:s.next_delivery_date,zone:z?.name||s.zone_id||'No zone',members:[]};
      acc[key].members.push(s); return acc;
    },{});
}
