/** NectarFusions Honey Club V15: route planning only. No network, billing or database changes. */
const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const VALID_DAY = /^\d{4}-\d{2}-\d{2}$/;
const str = value => String(value ?? '').trim();

export function validDay(value) {
  const day = str(value).slice(0, 10);
  if (!VALID_DAY.test(day)) return '';
  const dt = new Date(`${day}T12:00:00Z`);
  return !Number.isNaN(dt.valueOf()) && dt.toISOString().slice(0, 10) === day ? day : '';
}
export function validMonth(value) {
  const text = str(value);
  return /^\d{4}-\d{2}$/.test(text) && validDay(`${text}-01`) ? text : '';
}
export function weekdayNumbers(days) {
  if (!Array.isArray(days)) return [];
  return [...new Set(days.map(day => {
    if (Number.isInteger(day) && day >= 0 && day <= 6) return day;
    const s = str(day).toLowerCase();
    if (/^[0-6]$/.test(s)) return Number(s);
    const i = WEEKDAY_NAMES.findIndex(name => name.toLowerCase() === s || name.slice(0,3).toLowerCase() === s);
    return i >= 0 ? i : null;
  }).filter(day => day !== null))];
}
export function secondWeekOptions(month, weekdays) {
  const m = validMonth(month);
  const allowed = weekdayNumbers(weekdays);
  if (!m || !allowed.length) return [];
  const options = [];
  for (let date = 8; date <= 14; date++) {
    const day = `${m}-${String(date).padStart(2, '0')}`;
    const weekday = new Date(`${day}T12:00:00Z`).getUTCDay();
    if (allowed.includes(weekday)) options.push({day, weekday, label: `${WEEKDAY_NAMES[weekday]}, ${day}`});
  }
  return options;
}
export function planRoutes(subscriptions = [], zones = [], month = '') {
  const m = validMonth(month);
  if (!m) return {routes:[], notScheduled:[], pending:[], month:''};
  const zoneMap = new Map((zones || []).map(z => [str(z.id), z]));
  const grouped = new Map();
  const notScheduled = [];
  const pending = [];
  for (const sub of subscriptions || []) {
    if (sub.archived_at) continue;
    if (sub.status === 'pending') { pending.push(sub); continue; }
    if (sub.status !== 'active' || sub.method !== 'delivery') continue;
    const scheduled = validDay(sub.next_delivery_date);
    if (!scheduled) {notScheduled.push(sub); continue;}
    if (!scheduled.startsWith(`${m}-`)) continue;
    const zone = zoneMap.get(str(sub.zone_id));
    const key = str(sub.zone_id) || '__unassigned__';
    if (!grouped.has(key)) grouped.set(key, {key, zoneName: str(zone?.name) || 'Unassigned area', zone, members:[], existingDates:new Set(), zipGroups:[]});
    const group = grouped.get(key);
    group.members.push(sub);
    group.existingDates.add(scheduled);
  }
  const routes = [...grouped.values()].sort((a,b) => a.zoneName.localeCompare(b.zoneName));
  const usedDates = new Set();
  for (const route of routes) {
    route.options = secondWeekOptions(m,route.zone?.days || []);
    route.suggestedDate = route.options.find(opt => !usedDates.has(opt.day))?.day || route.options[0]?.day || '';
    if (route.suggestedDate) usedDates.add(route.suggestedDate);
    route.existingDates = [...route.existingDates].sort();
    const zipMap = new Map();
    for (const sub of route.members) {
      const customer = Array.isArray(sub.customers) ? sub.customers[0] : sub.customers;
      const zip = str(sub.delivery_zip || customer?.zip || customer?.postal_code) || 'ZIP missing';
      if (!zipMap.has(zip)) zipMap.set(zip, []);
      zipMap.get(zip).push(sub);
    }
    route.zipGroups = [...zipMap].sort(([a],[b])=>a.localeCompare(b)).map(([zip,members])=>({zip,members}));
  }
  return {month:m,routes,notScheduled,pending};
}
export function squareRouteRisk(sub, review) {
  if (sub.status !== 'active') return {level:'hold',label:'Hold: membership not active'};
  if (!sub.square_subscription_id) return {level:'hold',label:'Hold: no Square subscription'};
  if (!review || !review.square) return {level:'check',label:'Check Square before fulfillment'};
  const sq = review.square;
  if (sq.status !== 'ACTIVE') return {level:'hold',label:`Hold: Square ${str(sq.status)||'not active'}`};
  if (!sq.hasCardOnFile) return {level:'hold',label:'Hold: card not confirmed'};
  const invoices = review.invoices;
  if (invoices?.state !== 'verified' || Number(invoices.paidCount || 0) < 1)
    return {level:'check',label:'Verify paid invoice before fulfillment'};
  return {level:'review',label:'Paid history found; match payment to this box'};
}
export function countsForRoute(routes, reviews = {}) {
  let holds=0, checks=0, reviewsNeeded=0, boxes=0;
  for (const route of routes) for (const member of route.members) {
    boxes += 1;
    const risk=squareRouteRisk(member,reviews[member.id]);
    if (risk.level==='hold') holds++;
    else if (risk.level==='check') checks++;
    else reviewsNeeded++;
  }
  return {holds,checks,reviewsNeeded,boxes,areaDays:routes.filter(r=>r.suggestedDate).length};
}
