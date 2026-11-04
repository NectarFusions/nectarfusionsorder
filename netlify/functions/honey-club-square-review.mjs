/* NectarFusions Honey Club V14: ADMIN-ONLY, READ-ONLY Square reconciliation.
   No Supabase writes. No Square writes. No emails, card actions, or billing changes. */
import { square, db, ok, bad } from './_square.mjs';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const rowOf=v=>Array.isArray(v)?(v[0]||{}):(v||{});
const cleanDate=v=>/^\d{4}-\d{2}-\d{2}$/.test(String(v||''))?v:null;

async function requireAdmin(req) {
  const match=String(req.headers.get('authorization')||'').match(/^Bearer\s+(.+)$/i);
  if(!match) return false;
  const client=db();
  const {data,error}=await client.auth.getUser(match[1]);
  if(error||!data?.user?.id)return false;
  const result=await client.from('admins').select('user_id').eq('user_id',data.user.id).maybeSingle();
  if(result.error)throw result.error;
  return Boolean(result.data?.user_id);
}

async function readLocalEvidence(client, subId) {
  // Admin already authenticated above. These two SELECTs are the existing
  // subscription-specific box-payment and delivery ledgers; NO mutations.
  const [boxesResult, deliveriesResult] = await Promise.all([
    client.from('subscription_box_events')
      .select('id,square_invoice_id,box_number,paid_at,created_at')
      .eq('subscription_id', subId).order('created_at',{ascending:false}).limit(101),
    client.from('subscription_delivery_history')
      .select('id,scheduled_for,delivered_at,created_at')
      .eq('subscription_id', subId).order('created_at',{ascending:false}).limit(101),
  ]);
  if(boxesResult.error || deliveriesResult.error) throw boxesResult.error || deliveriesResult.error;
  const rawBoxes=boxesResult.data||[];
  const rawDeliveries=deliveriesResult.data||[];
  if(rawBoxes.length>100 || rawDeliveries.length>100) {
    return {state:'incomplete',boxEvents:[],deliveries:[],explanation:'More than 100 historical events exist. Reconciliation is incomplete; do not rely on counts.'};
  }
  return {
    state:'verified',
    boxEvents:rawBoxes.map(row=>({id:row.id,squareInvoiceId:row.square_invoice_id||null,boxNumber:row.box_number||null,paidAt:row.paid_at||null,createdAt:row.created_at||null})),
    deliveries:rawDeliveries.map(row=>({id:row.id,scheduledFor:row.scheduled_for||null,deliveredAt:row.delivered_at||null,createdAt:row.created_at||null})),
    explanation:'Retrieved existing box events and delivery history, not a final entitlement decision.'
  };
}

async function findPaidInvoices(subscription) {
  if(!subscription.customer_id||!subscription.location_id) {
    return {state:'not_available',paidCount:null,latestPaidInvoiceUpdatedAt:null,paidInvoices:[],explanation:'Square did not provide the customer and location identifiers needed to search invoices.'};
  }
  const filtered=[];
  let cursor=null;
  for(let page=0;page<5;page++) {
    const result=await square('/v2/invoices/search',{
      method:'POST', // Square SEARCH endpoint: read-only despite its POST method
      body:{query:{filter:{location_ids:[subscription.location_id],customer_ids:[subscription.customer_id]}},limit:100,...(cursor?{cursor}:{})}
    });
    for(const invoice of result.invoices||[]) {
      if(invoice.subscription_id===subscription.id && invoice.status==='PAID') filtered.push(invoice);
    }
    cursor=result.cursor||null;
    if(!cursor)break;
  }
  if(cursor) return {state:'incomplete',paidCount:null,latestPaidInvoiceUpdatedAt:null,paidInvoices:[],explanation:'Invoice search was not exhaustive. Do not use these counts to reconcile.'};
  const latest=filtered.map(i=>i.updated_at||i.created_at||'').filter(Boolean).sort().at(-1)||null;
  return {
    state:'verified',paidCount:filtered.length,latestPaidInvoiceUpdatedAt:latest,
    paidInvoices:filtered.map(i=>({id:i.id,number:i.invoice_number||null,createdAt:i.created_at||null,updatedAt:i.updated_at||null})),
    explanation:filtered.length?'Square returned PAID recurring invoices for this exact subscription. Invoice updated_at is not proof of the payment timestamp or a specific box entitlement.':'No PAID recurring invoices were returned by this search; check Square for separately prepaid signup orders.'
  };
}

export default async function handler(req) {
  if(req.method!=='POST')return bad('POST only',405);
  try {
    if(!await requireAdmin(req))return bad('Admin access is required.',403);
    const body=await req.json().catch(()=>null);
    if(!UUID.test(String(body?.subId||'')))return bad('Valid subscription ID is required.',400);
    const client=db();
    const {data:local,error}=await client.from('subscriptions')
      .select('id,status,method,cadence,plan_id,square_subscription_id,square_customer_id,square_plan_variation_id,plans!subscriptions_plan_id_fkey(square_var_1mo,square_var_2mo)')
      .eq('id',body.subId).maybeSingle();
    if(error)throw error;
    if(!local)return bad('Membership not found.',404);
    let localEvidence;
    try { localEvidence=await readLocalEvidence(client,local.id); }
    catch(error) {
      console.error('Read-only local ledger review unavailable:',error.message);
      localEvidence={state:'unavailable',boxEvents:[],deliveries:[],explanation:'Local history could not be retrieved; no entitlement conclusion is possible.'};
    }
    if(!local.square_subscription_id)return ok({connected:false,square:null,invoices:null,localEvidence,message:'Square recurring setup is not completed for this membership. No charge was attempted.'});

    const response=await square(`/v2/subscriptions/${encodeURIComponent(local.square_subscription_id)}?include=actions`,{method:'GET'});
    const subscription=response.subscription;
    if(!subscription||subscription.id!==local.square_subscription_id)return bad('Square subscription could not be verified.',409);
    const plan=rowOf(local.plans);
    const expectedVariation=local.cadence==='1mo'?plan.square_var_1mo:plan.square_var_2mo;
    if((local.square_customer_id&&subscription.customer_id!==local.square_customer_id)||
       (expectedVariation&&subscription.plan_variation_id!==expectedVariation)) {
      return bad('Square customer or plan does not match NectarFusions. Stop and review before updating billing.',409);
    }
    let invoices;
    try { invoices=await findPaidInvoices(subscription); }
    catch(err) {
      console.error('Read-only Square invoice review unavailable:',err.message);
      invoices={state:'unavailable',paidCount:null,latestPaidInvoiceUpdatedAt:null,explanation:'Square invoice lookup is unavailable. Subscription status was retrieved, but payment history is unverified.'};
    }
    const pendingAnchor=(subscription.actions||[]).find(a=>a.type==='CHANGE_BILLING_ANCHOR_DATE')||null;
    return ok({
      connected:true,
      checkedAt:new Date().toISOString(),
      square:{
        status:String(subscription.status||'UNKNOWN'),
        hasCardOnFile:Boolean(subscription.card_id),
        startedOn:cleanDate(subscription.start_date),
        billingAnchorDay:Number.isInteger(subscription.monthly_billing_anchor_date)?subscription.monthly_billing_anchor_date:null,
        chargedThroughDate:cleanDate(subscription.charged_through_date),
        paidUntilDate:cleanDate(subscription.paid_until_date),
        pendingAnchorDay:Number.isInteger(pendingAnchor?.monthly_billing_anchor_date)?pendingAnchor.monthly_billing_anchor_date:null,
        pendingAnchorEffectiveOn:cleanDate(pendingAnchor?.effective_date),
        nextChargeDate:null, // Square RetrieveSubscription does not guarantee a precise next-invoice date
      },
      invoices,
      localEvidence,
      message:'Square and local evidence reviewed read-only. No subscription, invoice, box, or card was changed.'
    });
  } catch(error) {
    console.error('Honey Club Square read-only review failed:',error.message);
    return bad('Square billing review could not be completed. No changes were made.',500);
  }
}
