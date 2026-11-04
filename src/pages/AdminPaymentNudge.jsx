/* Backroom 2026-11-03: deliberately manual-only until payment reminder schema+permissions are reviewed. */
import { useState } from 'react';
import { eligibleForNudge, paymentNudgeText } from '../lib/paymentNudgeText.mjs';
export default function AdminPaymentNudge({ order }) {
  const [showText, setShowText] = useState(false);
  const [status, setStatus] = useState('');
  if (!order || order.status !== 'open' || !order.requires_prepay || order.paid || order.archived_at) return null;
  const canCopy = eligibleForNudge(order);
  const note = paymentNudgeText(order);
  const copy = async () => {
    if (!canCopy || !note) return;
    try { await navigator.clipboard.writeText(note); setStatus('Copied. Nothing was sent.'); }
    catch { setShowText(true); setStatus('Copy manually from the text below. Nothing was sent.'); }
  };
  return <section aria-label="Payment reminder preview" style={{marginTop:12,padding:13,border:'1px solid #DDB75C',borderRadius:12,background:'#FFFCF0'}}>
    <strong style={{color:'#6E4914'}}>Unpaid order · Manual reminder draft</strong>
    <p style={{fontSize:12.5,lineHeight:1.55}}>Email reminders are disabled pending database and delivery-history checks. Verify in Square that payment is still outstanding before contacting the customer. Copying this draft never sends a message.</p>
    {!canCopy&&<p role="alert" style={{fontSize:12,color:'#A52C20'}}>An eligible unpaid order and valid live Square checkout URL are required.</p>}
    <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
      <button type="button" className="btn" disabled={!canCopy} onClick={copy}>Copy reminder draft</button>
      <button type="button" className="btn ghost" disabled={!canCopy} onClick={()=>setShowText(x=>!x)}>{showText?'Hide draft':'Preview draft'}</button>
    </div>
    {showText&&<textarea aria-label="Manual reminder draft" readOnly value={note} rows={5} style={{width:'100%',marginTop:10,fontSize:12,padding:9}} onFocus={e=>e.currentTarget.select()}/>}
    {status&&<p role="status" style={{fontSize:12}}>{status}</p>}
    <p style={{fontSize:11}}>Text reminders must be sent manually only when the customer has agreed to receive them. Confirm payment before contacting them.</p>
  </section>;
}
