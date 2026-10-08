import {useEffect, useState} from 'react';
import * as api from '../lib/api';

export default function AdminOrderDeliveryButton({order}) {
  const [state, setState] = useState('loading');
  const [sentAt, setSentAt] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const local = order.method === 'delivery';
  const paymentPending = Boolean(order.requires_prepay && !order.paid);
  const disabled = paymentPending || order.status === 'cancelled' || !order.email;

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const session = await api.session();
        if (!session?.access_token) throw new Error('Admin session expired.');
        const res = await fetch(`/.netlify/functions/order-delivery-notify?orderId=${encodeURIComponent(order.id)}`, {
          headers: {Authorization:`Bearer ${session.access_token}`},
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || 'Status unavailable.');
        if (active) {setState(data.state); setSentAt(data.sentAt || null);}
      } catch (e) {if (active) {setState('unknown'); setError(e.message || 'Status unavailable.');}}
    })();
    return () => {active = false;};
  }, [order.id]);

  const send = async () => {
    const question = local
      ? `Confirm order #${order.order_no} is physically out for local delivery now? An email will go to ${order.email}.`
      : `Confirm order #${order.order_no} has actually been handed to the shipping carrier? An email saying it has shipped will go to ${order.email}.`;
    if (!window.confirm(question)) return;
    setBusy(true);setError('');setMessage('');
    try {
      const session = await api.session();
      if (!session?.access_token) throw new Error('Please sign in again.');
      const res = await fetch('/.netlify/functions/order-delivery-notify', {
        method:'POST',
        headers:{Authorization:`Bearer ${session.access_token}`,'Content-Type':'application/json'},
        body:JSON.stringify({orderId:order.id,acknowledged:true}),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (data.state) {setState(data.state);setSentAt(data.sentAt || null);}
        throw new Error(data.error || 'Could not send email.');
      }
      setState('sent');setSentAt(data.sentAt || new Date().toISOString());
      setMessage('Email accepted for sending to the customer.');
    } catch (e) {setError(e.message || 'Could not send email.');}
    finally {setBusy(false);}
  };

  const alreadySent = state === 'sent';
  const pending = state === 'pending';
  const notReady = state === 'loading' || state === 'unknown';
  const label = local ? 'Send out-for-delivery email' : 'Send shipped email';

  return <div style={{marginTop:10,padding:'10px 12px',border:'1px solid #E2D6C4',borderRadius:10,background:'#FFFDF7',minWidth:0}}>
    <div style={{display:'flex',gap:10,alignItems:'center',justifyContent:'space-between',flexWrap:'wrap'}}>
      <div style={{fontSize:12.5,color:'#66523A',flex:'1 1 220px',minWidth:0}}>
        <strong style={{display:'block',color:'#4A3313'}}>Customer delivery update</strong>
        {alreadySent ? `Sent ${sentAt ? new Date(sentAt).toLocaleString() : ''}` :
          pending ? 'An email is processing. Avoid resending.' :
          paymentPending ? 'Available after payment is confirmed.' :
          !order.email ? 'No customer email on this order.' :
          local ? 'Send only when this order is actually out for local delivery.' :
          'Send only after USPS or another carrier has the package.'}
      </div>
      <button type="button" className="btn" onClick={send}
        disabled={busy || disabled || alreadySent || pending || notReady}
        style={{fontSize:12,padding:'9px 12px',whiteSpace:'normal',flex:'0 1 auto'}}>
        {alreadySent ? 'Email sent ✓' : busy ? 'Sending…' : state === 'loading' ? 'Checking email…' : label}
      </button>
    </div>
    {error && <div role="alert" style={{color:'#A5281A',fontSize:12,marginTop:7}}>{error}</div>}
    {message && <div role="status" style={{color:'#286132',fontSize:12,marginTop:7}}>{message}</div>}
  </div>;
}
