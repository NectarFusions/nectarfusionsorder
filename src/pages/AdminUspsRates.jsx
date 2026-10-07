import { useState } from 'react';
import * as api from '../lib/api';

const money = n => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(n));
const inputStyle = { display: 'block', width: '100%', marginTop: 5 };

export default function AdminUspsRates({ order, disabled = false }) {
  const [expanded, setExpanded] = useState(false);
  const [originZIP, setOriginZIP] = useState('48618');
  const [pounds, setPounds] = useState('1');
  const [ounces, setOunces] = useState('0');
  const [length, setLength] = useState('10');
  const [width, setWidth] = useState('8');
  const [height, setHeight] = useState('6');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const [choice, setChoice] = useState('');

  const invalidate = setter => e => { setter(e.target.value); setResult(null); setChoice(''); };

  const compare = async (event) => {
    event.preventDefault();
    if (busy || disabled) return;
    setBusy(true);
    setError(''); setResult(null); setChoice('');
    try {
      const session = await api.session();
      if (!session?.access_token) throw new Error('Please sign in to the Admin Back Room again.');
      const response = await fetch('/.netlify/functions/usps-rate-quotes', {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId: order.id, originZIP, pounds, ounces, length, width, height }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'USPS prices could not be retrieved.');
      setResult(data);
    } catch (err) { setError(err?.message || 'USPS prices could not be retrieved.'); }
    finally { setBusy(false); }
  };

  return (
    <div style={{ marginTop: 13, borderTop: '1px solid #E2D6C4', paddingTop: 12 }}>
      <button type="button" className="btn ghost" disabled={disabled} onClick={() => setExpanded(!expanded)} style={{ fontSize: 12 }}>
        {expanded ? 'Hide USPS rate comparison' : 'Compare USPS shipping prices'}
      </button>
      {expanded && (
        <div style={{ paddingTop: 10 }}>
          <div style={{ fontSize: 13, lineHeight: 1.5, color: '#66523A', marginBottom: 10 }}>
            Find the lowest eligible USPS rate for one standard shipping box. Destination ZIP: <strong>{order.zip || 'Missing'}</strong>.
            Rates come from USPS, not a saved price list. No postage will be purchased.
          </div>
          <form onSubmit={compare}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(115px,1fr))', gap: 10 }}>
              <label style={{ fontSize: 12 }}>Ships from ZIP<input required value={originZIP} onChange={invalidate(setOriginZIP)} inputMode="numeric" pattern="[0-9]{5}" maxLength={5} style={inputStyle}/></label>
              <label style={{ fontSize: 12 }}>Pounds<input required type="number" min="0" max="70" step="1" value={pounds} onChange={invalidate(setPounds)} style={inputStyle}/></label>
              <label style={{ fontSize: 12 }}>Ounces<input required type="number" min="0" max="15.9" step="0.1" value={ounces} onChange={invalidate(setOunces)} style={inputStyle}/></label>
              <label style={{ fontSize: 12 }}>Length (in)<input required type="number" min="0.1" max="100" step="any" value={length} onChange={invalidate(setLength)} style={inputStyle}/></label>
              <label style={{ fontSize: 12 }}>Width (in)<input required type="number" min="0.1" max="100" step="any" value={width} onChange={invalidate(setWidth)} style={inputStyle}/></label>
              <label style={{ fontSize: 12 }}>Height (in)<input required type="number" min="0.1" max="100" step="any" value={height} onChange={invalidate(setHeight)} style={inputStyle}/></label>
            </div>
            <button className="btn solid" type="submit" disabled={busy || !order.zip} style={{ marginTop: 12, padding: '10px 14px', fontSize: 12 }}>
              {busy ? 'Checking USPS prices…' : 'Compare USPS rates'}
            </button>
          </form>
          {error && <div role="alert" style={{ color: '#A5281A', marginTop: 10, fontSize: 13 }}>{error}</div>}
          {result && (
            <div role="status" style={{ paddingTop: 12 }}>
              <strong style={{ fontSize: 15 }}>USPS services, lowest price first</strong>
              <p style={{ margin: '5px 0 10px', fontSize: 12, lineHeight: 1.5, color: result.environment === 'test' ? '#91521F' : '#66523A' }}>
                {result.caveat}
              </p>
              {!result.quotes?.length && <p style={{ fontSize: 13 }}>No comparable standard-box prices returned. Adjust package details or check USPS API permissions.</p>}
              <div role="radiogroup" aria-label="USPS shipping service prices" style={{ display: 'grid', gap: 10 }}>
                {(result.quotes || []).map((quote, index) => (
                  <label
                    key={quote.mailClass}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '20px minmax(0, 1fr) auto',
                      alignItems: 'center',
                      columnGap: 14,
                      width: '100%',
                      minWidth: 0,
                      boxSizing: 'border-box',
                      padding: '15px 16px',
                      cursor: 'pointer',
                      border: choice === quote.mailClass ? '2px solid #BD850F' : '1px solid #E2D6C4',
                      borderRadius: 12,
                      background: index === 0 ? '#FFF8E5' : '#FFF',
                    }}
                  >
                    <input
                      type="radio"
                      name={`usps-quote-${order.id}`}
                      value={quote.mailClass}
                      checked={choice === quote.mailClass}
                      onChange={() => setChoice(quote.mailClass)}
                      aria-label={`Select ${quote.service} for ${money(quote.price)}`}
                      style={{
                        appearance: 'auto',
                        WebkitAppearance: 'radio',
                        display: 'block',
                        width: 20,
                        minWidth: 20,
                        maxWidth: 20,
                        height: 20,
                        minHeight: 20,
                        maxHeight: 20,
                        padding: 0,
                        margin: 0,
                        background: 'transparent',
                        boxShadow: 'none',
                        borderRadius: '50%',
                        accentColor: '#A36E00',
                      }}
                    />
                    <span style={{ display: 'block', minWidth: 0, maxWidth: '100%' }}>
                      <strong style={{ display: 'block', fontSize: 15, lineHeight: 1.45, overflowWrap: 'break-word' }}>
                        {quote.service}
                      </strong>
                      {index === 0 && (
                        <span style={{ display: 'inline-block', marginTop: 5, color: '#6C5014', fontSize: 12, fontWeight: 700 }}>
                          Lowest returned price
                        </span>
                      )}
                      <span style={{ display: 'block', marginTop: 5, color: '#74644D', fontSize: 12, lineHeight: 1.45, overflowWrap: 'break-word' }}>
                        {quote.priceType.replaceAll('_', ' ')}{quote.description ? ` · ${quote.description}` : ''}
                      </span>
                      {quote.warnings?.length > 0 && (
                        <span style={{ display: 'block', marginTop: 4, color: '#9B5D15', fontSize: 12, lineHeight: 1.45, overflowWrap: 'break-word' }}>
                          {quote.warnings.join('; ')}
                        </span>
                      )}
                    </span>
                    <span style={{ display: 'block', minWidth: 80, textAlign: 'right', alignSelf: 'center' }}>
                      <strong style={{ display: 'block', fontSize: 20, lineHeight: 1.25, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                        {money(quote.price)}
                      </strong>
                      <span style={{ display: 'block', marginTop: 5, fontSize: 11, lineHeight: 1.3, color: '#74644D' }}>
                        {result.environment === 'test' ? 'Test price' : 'USPS quote'}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
              {result.unavailable?.length > 0 && <p style={{ fontSize: 12, color: '#74644D' }}>No eligible quote returned for: {result.unavailable.join(', ')}.</p>}
              {result.notices?.length > 0 && <p style={{ fontSize: 12, color: '#74644D' }}>USPS did not price some services: {result.notices.join(' · ')}.</p>}
              {choice && <p style={{ fontSize: 12, color: '#66523A' }}>Selected: {result.quotes.find(q => q.mailClass === choice)?.service}. Selection is only a preview; buying postage is not yet enabled.</p>}
              <p style={{ fontSize: 12, color: '#74644D', marginTop: 10 }}>
                Rates exclude Click-N-Ship Business Rate Card comparisons, optional services, and USPS flat-rate packaging. Use the official USPS label link above to purchase postage while the Labels API is pending approval.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
