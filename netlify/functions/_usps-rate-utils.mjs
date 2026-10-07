// USPS rate-quote helpers. No customer data or secrets are written to storage.
export const STANDARD_CLASSES = Object.freeze({
  USPS_GROUND_ADVANTAGE: 'USPS Ground Advantage',
  PRIORITY_MAIL: 'USPS Priority Mail',
  PRIORITY_MAIL_EXPRESS: 'USPS Priority Mail Express',
});

const standardIndicators = new Set(['SP', 'DR']); // Single-piece or rectangular dimensional box.

export function zip5(value) {
  const match = String(value ?? '').trim().match(/^(\d{5})(?:[- ]?\d{4})?$/);
  return match?.[1] || '';
}

export function validPackage(input) {
  const lbs = Number(input?.pounds ?? 0);
  const oz = Number(input?.ounces ?? 0);
  const dims = [input?.length, input?.width, input?.height].map(Number);
  if (![lbs, oz, ...dims].every(Number.isFinite) || lbs < 0 || !Number.isInteger(lbs) || oz < 0 || oz >= 16) {
    throw new Error('Enter whole pounds and ounces from 0 through 15.9.');
  }
  const weight = Number((lbs + oz / 16).toFixed(4));
  if (weight <= 0 || weight > 70) throw new Error('USPS package weight must be above 0 and at most 70 lb.');
  if (dims.some(n => n <= 0 || n > 100)) throw new Error('Enter all three package dimensions in inches (greater than 0 and at most 100).');
  const sorted = [...dims].sort((a, b) => b - a);
  if (sorted[0] + 2 * (sorted[1] + sorted[2]) > 130) {
    throw new Error('This box exceeds the 130-inch length-plus-girth limit. Use a smaller package or contact USPS.');
  }
  return { weight, length: sorted[0], width: sorted[1], height: sorted[2] };
}

export function makeRateRequest(originZIPCode, destinationZIPCode, pkg, mailClass = 'ALL') {
  return {
    originZIPCode,
    destinationZIPCode,
    weight: pkg.weight,
    length: pkg.length,
    width: pkg.width,
    height: pkg.height,
    mailClass,
    priceType: 'COMMERCIAL',
    extraServices: [], // No signature, insurance, or other optional add-ons requested.
    // Intentionally exclude EPS number, insurance, COD, and extra services.
    // This returns published commercial prices, not a promised negotiated account rate.
  };
}

const dollarValue = (v) => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : null;
};

export function pickComparableQuotes(payload) {
  const options = Array.isArray(payload?.rateOptions)
    ? payload.rateOptions
    : Array.isArray(payload?.rates) ? [{ rates: payload.rates, totalBasePrice: payload.totalBasePrice }] : [];
  const quotes = [];
  for (const option of options) {
    if (!Array.isArray(option?.rates)) continue;
    // Multi-rate options may bundle other services. Do not misrepresent a bundled total as one service.
    if (option.rates.length !== 1) continue;
    const rate = option.rates[0];
    if (!Object.hasOwn(STANDARD_CLASSES, rate.mailClass)) continue;
    const indicator = String(rate.rateIndicator || '').toUpperCase();
    // Only shipper-supplied rectangular box and ordinary single-piece quotes.
    // Flat-rate packaging, entry discounts, Media Mail, and other special products are excluded.
    if (indicator && !standardIndicators.has(indicator)) continue;
    if (/flat[ -]?rate|envelope|padded/i.test(String(rate.description || ''))) continue;
    const entry = String(rate.destinationEntryFacilityType || 'NONE').toUpperCase();
    if (entry !== 'NONE') continue;
    if (rate.priceType === 'RETAIL' || rate.priceType === 'NSA' || rate.priceType === 'CONTRACT') continue;
    const total = dollarValue(option.totalPrice) ?? dollarValue(option.totalBasePrice) ?? dollarValue(rate.price);
    if (total === null) continue;
    quotes.push({
      mailClass: rate.mailClass,
      service: STANDARD_CLASSES[rate.mailClass],
      price: total,
      priceType: String(rate.priceType || 'UNSPECIFIED'),
      description: String(rate.description || '').slice(0,140),
      rateIndicator: indicator || null,
      zone: String(rate.zone || ''),
      warnings: Array.isArray(rate.warnings) ? rate.warnings.slice(0, 3).map(w => typeof w === 'string' ? w : (w.warningDescription || w.message || '')).filter(Boolean).map(w => String(w).slice(0,140)) : [],
    });
  }
  const bestByClass = new Map();
  for (const quote of quotes) {
    if (!bestByClass.has(quote.mailClass) || quote.price < bestByClass.get(quote.mailClass).price) {
      bestByClass.set(quote.mailClass, quote);
    }
  }
  return [...bestByClass.values()].sort((a, b) => a.price - b.price);
}
