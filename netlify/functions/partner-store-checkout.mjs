import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import { square, site } from "./_square.mjs";

const FROM = "NectarFusions <orders@nectar-fusions.com>";
const OWNER = "info@nectar-fusions.com";
const PICKUP_ADDRESS = "122 E Railway St, Coleman, MI 48618";
const PROCESSING_RATE = 0.04;

const json = (status, body) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

const clean = (value, max = 5000) => {
  const text = String(value ?? "").trim();
  return text ? text.slice(0, max) : null;
};

const normalize = (value) => String(value ?? "").trim().toLowerCase();
const int = (value) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) ? parsed : null;
};
const money = (cents) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(Number(cents || 0) / 100);
const esc = (value) =>
  String(value ?? "").replace(/[<>&"]/g, (character) => ({
    "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;",
  })[character]);

const allowedRelationshipStatuses = new Set([
  "approved","onboarding","active_opening","active_ongoing","optimize",
]);

const allowedGiftFlavorNames = new Set([
  "peach","blueberry","thai hot pepper","madagascar vanilla","vanilla","cinnamon","lemon",
]);

const bulkPrices = {
  half_gallon:{label:"1/2 Gallon",natural:5500,infused:6500},
  one_gallon:{label:"1 Gallon",natural:10000,infused:12000},
  five_gallon:{label:"5 Gallon",natural:45000,infused:55000},
};

const giftContainer = {
  bear:{label:"2 oz Plastic Bear",normal:400,bulk:300},
  hex:{label:"2 oz Glass Hexagon",normal:475,bulk:325},
};

const giftAddon = {
  dipper:"Wood honey dipper",
  thank_you_tag:"Thank You tag",
  bee_charm:"Bee charm",
};

const itemName = (item) => {
  if (item.category === "retail") {
    return `${item.size_label} ${item.texture === "spun" ? "Spun" : "Regular"} — ${item.flavor_name}`;
  }
  if (item.category === "bulk") {
    return item.details?.honey_type === "natural"
      ? `${item.size_label} Natural Raw Honey`
      : `${item.size_label} Infused — ${item.flavor_name}`;
  }
  if (item.category === "gift") {
    return `${item.details?.container_label || "Gift container"} — ${item.flavor_name}`;
  }
  if (item.category === "gift_addon") {
    return `Gift add-on — ${giftAddon[item.product_key] || item.product_key}`;
  }
  if (item.category === "custom_label") {
    return "Custom design + printing & labeling";
  }
  return item.product_key;
};

const uniqueOrderNo = () =>
  `NF-P-${Date.now().toString(36).toUpperCase()}-${crypto.randomUUID().slice(0,4).toUpperCase()}`;

async function buildValidatedOrder({ admin, account, body }) {
  const rawItems = Array.isArray(body.items) ? body.items.slice(0, 200) : [];
  if (!rawItems.length) throw new Error("Your cart is empty.");

  const fulfillment = clean(body.fulfillmentMethod, 20);
  if (!["pickup","delivery"].includes(fulfillment)) {
    throw new Error("Choose Coleman Pickup or Local Delivery.");
  }

  const neededBy = clean(body.neededBy, 10);
  const preferredDeliveryDays = Array.isArray(body.preferredDeliveryDays)
    ? body.preferredDeliveryDays.map(normalize).filter((day) =>
        ["monday","tuesday","wednesday","thursday","friday","saturday","sunday"].includes(day)
      ).slice(0,7)
    : [];

  const retailItems = rawItems.filter((item) => item?.category === "retail");
  const bulkItems = rawItems.filter((item) => item?.category === "bulk");
  const giftItems = rawItems.filter((item) => item?.category === "gift");
  const addonItems = rawItems.filter((item) => item?.category === "gift_addon");
  const customLabelItems = rawItems.filter((item) => item?.category === "custom_label");

  const flavorIds = [
    ...retailItems.map((i)=>clean(i.flavorId,50)),
    ...bulkItems.filter((i)=>i.honeyType==="infused").map((i)=>clean(i.flavorId,50)),
    ...giftItems.map((i)=>clean(i.flavorId,50)),
  ].filter(Boolean);

  const flavorMap = new Map();
  if (flavorIds.length) {
    const { data: flavors, error } = await admin
      .from("flavors")
      .select("id,name,active")
      .in("id",[...new Set(flavorIds)]);
    if (error) throw error;
    for (const flavor of flavors || []) flavorMap.set(String(flavor.id),flavor);
  }

  const stockMap = new Map();
  if (retailItems.length) {
    const ids = [...new Set(retailItems.map((i)=>clean(i.flavorId,50)).filter(Boolean))];
    const { data: stock, error } = await admin
      .from("stock")
      .select("flavor_id,size_id,type,in_stock")
      .in("flavor_id",ids);
    if (error) throw error;
    for (const row of stock || []) {
      stockMap.set(`${row.flavor_id}|${row.size_id}|${row.type}`,row.in_stock===true);
    }
  }

  let spunEnabled = false;
  if (retailItems.some((i)=>i.texture==="spun")) {
    const { data: setting } = await admin
      .from("settings")
      .select("value")
      .eq("key","spun_availability")
      .maybeSingle();
    spunEnabled = setting?.value?.enabled === true;
  }

  const giftTotals = { bear:0, hex:0 };
  for (const raw of giftItems) {
    const containerType = clean(raw.containerType,20);
    const quantity = int(raw.quantity);
    if (!giftContainer[containerType]) throw new Error("A gift container selection is invalid.");
    if (!quantity || quantity < 1 || quantity > 999) throw new Error("Gift quantities must be between 1 and 999.");
    giftTotals[containerType] += quantity;
  }

  const finalItems = [];
  let retailJarTotal = 0;

  for (const raw of retailItems) {
    const flavorId = clean(raw.flavorId,50);
    const sizeId = clean(raw.sizeId,30);
    const texture = clean(raw.texture,20) || "regular";
    const quantity = int(raw.quantity);
    const flavor = flavorMap.get(flavorId);

    if (!flavor?.active) throw new Error("A retail flavor is no longer available.");
    if (!["7oz","1lb"].includes(sizeId)) throw new Error("Retailer Replenishment is limited to 7 oz and 1 lb jars.");
    if (!["regular","spun"].includes(texture)) throw new Error("Choose Regular or Spun honey.");
    if (texture === "spun" && !spunEnabled) throw new Error("Spun honey is currently unavailable.");
    if (!quantity || quantity < 6 || quantity > 996 || quantity % 6 !== 0) {
      throw new Error("Retailer Replenishment quantities must be ordered in six-jar increments.");
    }
    if (!stockMap.get(`${flavorId}|${sizeId}|${texture}`)) {
      throw new Error(`${flavor.name} ${sizeId} ${texture} is no longer available.`);
    }

    const unit = sizeId === "7oz" ? 725 : 1200;
    retailJarTotal += quantity;
    finalItems.push({
      category:"retail",
      product_key:`${sizeId}-${texture}`,
      flavor_id:flavor.id,
      flavor_name:flavor.name,
      size_id:sizeId,
      size_label:sizeId==="7oz"?"7 oz":"1 lb",
      texture,
      quantity,
      unit_price_cents:unit,
      line_total_cents:unit*quantity,
      details:{notes:clean(raw.notes,1000)},
    });
  }

  if (retailItems.length && retailJarTotal < 12) {
    throw new Error("Retailer Replenishment requires at least 12 jars. Wholesale and gift items do not count toward that 12-jar minimum.");
  }

  for (const raw of bulkItems) {
    const honeyType = clean(raw.honeyType,20);
    const sizeId = clean(raw.sizeId,30);
    const quantity = int(raw.quantity);
    const pricing = bulkPrices[sizeId];

    if (!pricing) throw new Error("A wholesale container size is invalid.");
    if (!["natural","infused"].includes(honeyType)) throw new Error("Choose Natural or Infused wholesale honey.");
    if (!quantity || quantity < 1 || quantity > 999) throw new Error("Wholesale quantities must be between 1 and 999.");

    let flavor = null;
    if (honeyType === "infused") {
      flavor = flavorMap.get(clean(raw.flavorId,50));
      if (!flavor?.active) throw new Error("A wholesale infused flavor is no longer available.");
    }

    const unit = pricing[honeyType];
    finalItems.push({
      category:"bulk",
      product_key:`${sizeId}-${honeyType}`,
      flavor_id:flavor?.id||null,
      flavor_name:flavor?.name||null,
      size_id:sizeId,
      size_label:pricing.label,
      texture:null,
      quantity,
      unit_price_cents:unit,
      line_total_cents:unit*quantity,
      details:{honey_type:honeyType,notes:clean(raw.notes,1000)},
    });
  }

  for (const raw of giftItems) {
    const containerType = clean(raw.containerType,20);
    const quantity = int(raw.quantity);
    const config = giftContainer[containerType];
    const flavor = flavorMap.get(clean(raw.flavorId,50));

    if (!config) throw new Error("A gift container selection is invalid.");
    if (!flavor?.active || !allowedGiftFlavorNames.has(normalize(flavor.name))) {
      throw new Error("Gift Sets are limited to the six offered gift flavors.");
    }
    if (!quantity || quantity < 1 || quantity > 999) throw new Error("Gift flavor quantities must be between 1 and 999.");

    const unit = giftTotals[containerType] >= 50 ? config.bulk : config.normal;
    finalItems.push({
      category:"gift",
      product_key:containerType,
      flavor_id:flavor.id,
      flavor_name:flavor.name,
      size_id:"2oz",
      size_label:config.label,
      texture:null,
      quantity,
      unit_price_cents:unit,
      line_total_cents:unit*quantity,
      details:{
        container_type:containerType,
        container_label:config.label,
        lid_color:containerType==="bear"?clean(raw.lidColor,120):null,
        custom_details:clean(raw.customDetails,1000),
      },
    });
  }

  for (const raw of addonItems) {
    const addonType = clean(raw.addonType,40);
    const quantity = int(raw.quantity);
    const containerType = clean(raw.containerType,20);

    if (!giftAddon[addonType]) throw new Error("A gift add-on is invalid.");
    if (!quantity || quantity < 1 || quantity > 999) throw new Error("Gift add-on quantities must be between 1 and 999.");

    finalItems.push({
      category:"gift_addon",
      product_key:addonType,
      flavor_id:null,
      flavor_name:null,
      size_id:null,
      size_label:giftAddon[addonType],
      texture:null,
      quantity,
      unit_price_cents:100,
      line_total_cents:quantity*100,
      details:{container_type:giftContainer[containerType]?containerType:null},
    });
  }

  if (customLabelItems.length > 1) throw new Error("Only one custom-label setup charge can be added per order.");
  if (customLabelItems.length === 1) {
    const raw = customLabelItems[0];
    const examples = Array.isArray(raw.labelExamples)
      ? raw.labelExamples.slice(0,5).map((example)=>({
          file_name:clean(example?.file_name,160),
          storage_path:clean(example?.storage_path,500),
        }))
      : [];
    finalItems.push({
      category:"custom_label",
      product_key:"custom_label_setup",
      flavor_id:null,
      flavor_name:null,
      size_id:null,
      size_label:"Custom Labels",
      texture:null,
      quantity:1,
      unit_price_cents:3000,
      line_total_cents:3000,
      details:{notes:clean(raw.notes,3000),label_examples:examples},
    });
  }

  if (!finalItems.length) throw new Error("Your cart does not contain any valid products.");

  const subtotalCents = finalItems.reduce((sum,item)=>sum+item.line_total_cents,0);

  const profile = {
    business_name:clean(body.deliveryProfile?.businessName,200)||account.business_name,
    contact_name:account.contact_name,
    email:account.email,
    phone:clean(body.deliveryProfile?.phone,40)||account.phone,
    address_line1:clean(body.deliveryProfile?.addressLine1,250)||account.address_line1,
    address_line2:clean(body.deliveryProfile?.addressLine2,250)||account.address_line2,
    city:clean(body.deliveryProfile?.city,120)||account.city,
    state:(clean(body.deliveryProfile?.state,2)||account.state||"").toUpperCase(),
    zip:String(clean(body.deliveryProfile?.zip,12)||account.zip||"").replace(/\D/g,"").slice(0,5),
    delivery_notes:clean(body.deliveryProfile?.deliveryNotes,2000)||account.delivery_notes,
  };

  let deliveryFeeCents = 0;
  let deliveryZone = null;

  if (fulfillment === "delivery") {
    if (!profile.business_name || !profile.phone || !profile.address_line1 || !profile.city || !/^[A-Z]{2}$/.test(profile.state) || !/^\d{5}$/.test(profile.zip)) {
      throw new Error("Complete the business name, phone, street address, city, state, and ZIP for Local Delivery.");
    }

    const { data: zones, error } = await admin
      .from("zones")
      .select("id,name,zips,fee_cents,minimum_cents");
    if (error) throw error;

    deliveryZone = (zones||[]).find((zone)=>Array.isArray(zone.zips)&&zone.zips.includes(profile.zip));
    if (!deliveryZone) throw new Error("That ZIP is outside the current local delivery area. Choose Coleman Pickup or contact NectarFusions.");
    if (subtotalCents < Number(deliveryZone.minimum_cents||0)) {
      throw new Error(`This delivery zone requires at least ${money(deliveryZone.minimum_cents)} in merchandise.`);
    }
    deliveryFeeCents = Number(deliveryZone.fee_cents||0);
  }

  const processingFeeCents = Math.round((subtotalCents + deliveryFeeCents) * PROCESSING_RATE);
  const totalCents = subtotalCents + deliveryFeeCents + processingFeeCents;

  return {
    finalItems,fulfillment,neededBy,
    preferredDeliveryDays:fulfillment==="delivery"?preferredDeliveryDays:[],
    currentInventoryNotes:clean(body.currentInventoryNotes,5000),
    requestNotes:clean(body.requestNotes,5000),
    profile,subtotalCents,deliveryFeeCents,processingFeeCents,totalCents,deliveryZone,
  };
}

const ownerEmail = ({ account, order, items }) => {
  const rows = items.map((item) => {
    const details = item.details || {};
    const detailLines = [
      details.lid_color ? `Lid / top: ${details.lid_color}` : null,
      details.custom_details ? `Custom details: ${details.custom_details}` : null,
      details.notes ? `Notes: ${details.notes}` : null,
      Array.isArray(details.label_examples) && details.label_examples.length
        ? `Label examples: ${details.label_examples.map((example) => example.file_name).filter(Boolean).join(", ")}`
        : null,
    ].filter(Boolean);

    return `
    <tr>
      <td style="padding:9px;border-bottom:1px solid #E2E8EC">
        ${esc(itemName(item))}
        ${detailLines.length ? `<br><span style="font-size:12px;color:#6B7D87">${detailLines.map(esc).join("<br>")}</span>` : ""}
      </td>
      <td style="padding:9px;border-bottom:1px solid #E2E8EC;text-align:center">${esc(item.quantity)}</td>
      <td style="padding:9px;border-bottom:1px solid #E2E8EC;text-align:right">${esc(money(item.line_total_cents))}</td>
    </tr>`;
  }).join("");

  const address = order.fulfillment_method === "delivery"
    ? [order.address_line1,order.address_line2,[order.city,order.state,order.zip].filter(Boolean).join(", ")].filter(Boolean).join("<br>")
    : PICKUP_ADDRESS;

  return `
    <div style="font-family:Arial,sans-serif;color:#173C52;max-width:760px;margin:auto">
      <h1>New Partner Order ${esc(order.order_no)}</h1>
      <p>${esc(account.business_name)}</p>
      <table style="width:100%;border-collapse:collapse"><thead><tr style="background:#F4F8FA"><th style="padding:9px;text-align:left">Item</th><th style="padding:9px">Qty</th><th style="padding:9px;text-align:right">Total</th></tr></thead><tbody>${rows}</tbody></table>
      <p><strong>Merchandise:</strong> ${money(order.subtotal_cents)}</p>
      <p><strong>Delivery:</strong> ${money(order.delivery_fee_cents)}</p>
      <p><strong>Card processing fee:</strong> ${money(order.processing_fee_cents)}</p>
      <p style="font-size:20px"><strong>Order total:</strong> ${money(order.total_cents)}</p>
      <hr style="border:0;border-top:1px solid #D7E2E8">
      <p><strong>Fulfillment:</strong> ${order.fulfillment_method==="delivery"?"Local Delivery":"Coleman Pickup"}</p>
      <p><strong>Business:</strong> ${esc(order.business_name)}</p>
      <p><strong>Phone:</strong> ${esc(order.phone||"")}</p>
      <p><strong>Address / pickup:</strong><br>${address}</p>
      ${order.delivery_notes?`<p><strong>Delivery notes:</strong> ${esc(order.delivery_notes)}</p>`:""}
      ${order.needed_by?`<p><strong>Needed by:</strong> ${esc(order.needed_by)}</p>`:""}
      ${Array.isArray(order.preferred_delivery_days) && order.preferred_delivery_days.length ? `<p><strong>Preferred delivery days:</strong> ${esc(order.preferred_delivery_days.join(", "))}</p>` : ""}
      ${order.current_inventory_notes?`<p><strong>Current inventory notes:</strong> ${esc(order.current_inventory_notes)}</p>`:""}
      ${order.request_notes?`<p><strong>Request notes:</strong> ${esc(order.request_notes)}</p>`:""}
      <p style="color:#6B7D87">This order was saved before the partner was sent to Square checkout.</p>
    </div>`;
};

export default async (req) => {
  if (req.method !== "POST") return json(405,{error:"POST only"});

  const authorization = String(req.headers.get("authorization")||"").trim();
  if (!authorization.toLowerCase().startsWith("bearer ")) return json(401,{error:"Partner authentication is required."});

  const supabaseUrl = String(process.env.SUPABASE_URL||"").trim();
  const anonKey = String(process.env.SUPABASE_ANON_KEY||process.env.VITE_SUPABASE_ANON_KEY||"").trim();
  const serviceKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY||"").trim();
  if (!supabaseUrl || !anonKey || !serviceKey) return json(500,{error:"The partner checkout service is not configured."});

  let body;
  try { body = await req.json(); } catch { return json(400,{error:"Invalid checkout data."}); }

  const userClient = createClient(supabaseUrl,anonKey,{
    global:{headers:{Authorization:authorization}},
    auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},
  });
  const admin = createClient(supabaseUrl,serviceKey,{
    auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},
  });

  const { data:userData, error:userError } = await userClient.auth.getUser();
  if (userError || !userData?.user) return json(401,{error:"Partner authentication expired."});

  const { data:mapping, error:mappingError } = await admin
    .from("partner_users")
    .select("partner_id")
    .eq("user_id",userData.user.id)
    .eq("active",true)
    .limit(1)
    .maybeSingle();
  if (mappingError || !mapping?.partner_id) return json(403,{error:"Partner access is not active."});

  const { data:account, error:accountError } = await admin
    .from("partner_accounts")
    .select("id,business_name,public_name,contact_name,email,phone,partner_type,relationship_status,auth_access_enabled,address_line1,address_line2,city,state,zip,delivery_notes")
    .eq("id",mapping.partner_id)
    .single();

  if (accountError || !account || account.auth_access_enabled!==true || !["retailer","wholesaler","other"].includes(account.partner_type) || !allowedRelationshipStatuses.has(account.relationship_status)) {
    return json(403,{error:"Partner ordering is not available for this account."});
  }

  let validated;
  try { validated = await buildValidatedOrder({admin,account,body}); }
  catch(error){ return json(400,{error:error?.message||"The partner order could not be validated."}); }

  if (body.mode === "quote") {
    return json(200,{
      ok:true,
      subtotalCents:validated.subtotalCents,
      deliveryFeeCents:validated.deliveryFeeCents,
      processingFeeCents:validated.processingFeeCents,
      totalCents:validated.totalCents,
      zoneName:validated.deliveryZone?.name||null,
    });
  }
  if (body.mode !== "checkout") return json(400,{error:"Invalid checkout mode."});

  if (validated.fulfillment === "delivery") {
    const { error:profileError } = await admin
      .from("partner_accounts")
      .update({
        business_name:validated.profile.business_name,
        phone:validated.profile.phone,
        address_line1:validated.profile.address_line1,
        address_line2:validated.profile.address_line2,
        city:validated.profile.city,
        state:validated.profile.state,
        zip:validated.profile.zip,
        delivery_notes:validated.profile.delivery_notes,
        updated_at:new Date().toISOString(),
      })
      .eq("id",account.id);
    if (profileError) return json(500,{error:"The delivery profile could not be saved."});
  }

  const orderNo = uniqueOrderNo();
  const { data:order, error:orderError } = await admin
    .from("partner_store_orders")
    .insert({
      order_no:orderNo,
      partner_id:account.id,
      submitted_by:userData.user.id,
      status:"awaiting_payment",
      fulfillment_method:validated.fulfillment,
      needed_by:validated.neededBy,
      preferred_delivery_days:validated.preferredDeliveryDays,
      current_inventory_notes:validated.currentInventoryNotes,
      request_notes:validated.requestNotes,
      business_name:validated.profile.business_name,
      contact_name:validated.profile.contact_name,
      email:validated.profile.email,
      phone:validated.profile.phone,
      address_line1:validated.fulfillment==="delivery"?validated.profile.address_line1:null,
      address_line2:validated.fulfillment==="delivery"?validated.profile.address_line2:null,
      city:validated.fulfillment==="delivery"?validated.profile.city:null,
      state:validated.fulfillment==="delivery"?validated.profile.state:null,
      zip:validated.fulfillment==="delivery"?validated.profile.zip:null,
      delivery_notes:validated.fulfillment==="delivery"?validated.profile.delivery_notes:null,
      subtotal_cents:validated.subtotalCents,
      delivery_fee_cents:validated.deliveryFeeCents,
      processing_fee_cents:validated.processingFeeCents,
      total_cents:validated.totalCents,
    })
    .select("*")
    .single();

  if (orderError || !order) return json(500,{error:orderError?.message||"The partner order could not be saved."});

  const { error:itemsError } = await admin
    .from("partner_store_order_items")
    .insert(validated.finalItems.map((item)=>({order_id:order.id,...item})));

  if (itemsError) {
    await admin.from("partner_store_orders").delete().eq("id",order.id);
    return json(500,{error:"The partner order items could not be saved."});
  }

  let emailWarning = false;
  const resendKey = String(process.env.RESEND_API_KEY||"").trim();
  if (resendKey) {
    try {
      const resend = new Resend(resendKey);
      const result = await resend.emails.send({
        from:FROM,to:OWNER,replyTo:account.email||undefined,
        subject:`Partner Order ${order.order_no} — ${account.business_name} — ${money(order.total_cents)}`,
        html:ownerEmail({account,order,items:validated.finalItems}),
      });
      if (result?.error) emailWarning = true;
    } catch { emailWarning = true; }
  } else emailWarning = true;

  try {
    const lineItems = validated.finalItems.map((item)=>({
      name:itemName(item),
      quantity:String(item.quantity),
      base_price_money:{amount:item.unit_price_cents,currency:"USD"},
    }));
    const serviceCharges = [
      ...(validated.deliveryFeeCents>0?[{name:"Partner local delivery",amount_money:{amount:validated.deliveryFeeCents,currency:"USD"},calculation_phase:"TOTAL_PHASE"}]:[]),
      ...(validated.processingFeeCents>0?[{name:"Card processing fee (4%)",amount_money:{amount:validated.processingFeeCents,currency:"USD"},calculation_phase:"TOTAL_PHASE"}]:[]),
    ];

    const sq = await square("/v2/online-checkout/payment-links",{
      body:{
        idempotency_key:`partner-store-${order.id}`,
        order:{
          location_id:process.env.SQUARE_LOCATION_ID,
          reference_id:order.order_no,
          line_items:lineItems,
          ...(serviceCharges.length?{service_charges:serviceCharges}:{}),
        },
        checkout_options:{
          redirect_url:`${site()}/partner/login?partner-order=${encodeURIComponent(order.order_no)}`,
          ask_for_shipping_address:false,
          merchant_support_email:"info@nectar-fusions.com",
        },
        pre_populated_data:{buyer_email:account.email},
        description:`NectarFusions Partner Order ${order.order_no}`,
      },
    });

    const link = sq.payment_link;
    const { error:squareSaveError } = await admin
      .from("partner_store_orders")
      .update({
        square_link_url:link.url,
        square_link_id:link.id,
        square_order_id:link.order_id,
        updated_at:new Date().toISOString(),
      })
      .eq("id",order.id);
    if (squareSaveError) throw squareSaveError;

    return json(200,{
      ok:true,orderId:order.id,orderNo:order.order_no,checkoutUrl:link.url,
      subtotalCents:validated.subtotalCents,deliveryFeeCents:validated.deliveryFeeCents,
      processingFeeCents:validated.processingFeeCents,totalCents:validated.totalCents,emailWarning,
    });
  } catch(error) {
    console.error("Partner Square checkout creation failed:",error?.message||error);
    return json(200,{
      ok:true,orderId:order.id,orderNo:order.order_no,orderSaved:true,paymentPending:true,emailWarning,
      error:"Your order was saved, but the Square payment page could not be created. Do not submit the order again. NectarFusions can send the payment link from the saved order.",
    });
  }
};
