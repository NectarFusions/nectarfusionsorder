import { square, db } from "./_square.mjs";

const json=(status,body)=>new Response(JSON.stringify(body),{
  status,headers:{"Content-Type":"application/json","Cache-Control":"no-store"},
});

const authMember=async(req)=>{
  const auth=String(req.headers.get("authorization")||"").trim();
  if(!auth.toLowerCase().startsWith("bearer ")) throw Object.assign(new Error("Authentication required."),{status:401});
  const token=auth.slice(7).trim();
  const admin=db();
  const {data:userData,error:userError}=await admin.auth.getUser(token);
  if(userError||!userData?.user) throw Object.assign(new Error("Invalid or expired NFOS session."),{status:401});
  const {data:member,error:memberError}=await admin
    .from("nfos_team_members")
    .select("id,user_id,display_name,email,role,active")
    .eq("user_id",userData.user.id)
    .eq("active",true)
    .maybeSingle();
  if(memberError||!member) throw Object.assign(new Error("NFOS team access is not active."),{status:403});
  const {data:perm}=await admin
    .from("nfos_role_permissions")
    .select("permission")
    .eq("role",member.role)
    .eq("permission","market.manage")
    .maybeSingle();
  if(!perm) throw Object.assign(new Error("Your NFOS role does not allow market operations."),{status:403});
  return {admin,user:userData.user,member};
};

const assertSessionAccess=async(admin,member,sessionId)=>{
  const {data:session,error}=await admin
    .from("nfos_market_sessions")
    .select("id,status,assigned_member_id,square_location_id,opened_at,closed_at,market_day,venue_name")
    .eq("id",sessionId)
    .maybeSingle();
  if(error||!session) throw Object.assign(new Error("Market session not found."),{status:404});
  if(!["owner","operations_manager"].includes(member.role) && session.assigned_member_id!==member.id){
    throw Object.assign(new Error("This market session is not assigned to you."),{status:403});
  }
  return session;
};

const listSquareLocations=async()=>{
  const result=await square("/v2/locations",{method:"GET"});
  return (result.locations||[]).filter((l)=>l.status!=="INACTIVE").map((l)=>({
    id:l.id,name:l.name,status:l.status,address:l.address||null,
  }));
};

const listCatalog=async()=>{
  let cursor=null;
  const objects=[];
  do{
    const qs=new URLSearchParams({types:"ITEM"});
    if(cursor) qs.set("cursor",cursor);
    const result=await square(`/v2/catalog/list?${qs.toString()}`,{method:"GET"});
    objects.push(...(result.objects||[]));
    cursor=result.cursor||null;
  }while(cursor);

  const variations=[];
  for(const item of objects){
    if(item.type!=="ITEM") continue;
    const itemName=item.item_data?.name||"Square item";
    for(const variation of item.item_data?.variations||[]){
      variations.push({
        id:variation.id,
        item_id:item.id,
        item_name:itemName,
        variation_name:variation.item_variation_data?.name||"",
        sku:variation.item_variation_data?.sku||"",
        price_cents:Number(variation.item_variation_data?.price_money?.amount||0),
      });
    }
  }
  return variations;
};

const autoMapExactSkus=async(admin,variations,userId)=>{
  const {data:items}=await admin
    .from("nfos_items")
    .select("id,sku,name")
    .eq("item_type","finished_good")
    .eq("active",true);
  const itemBySku=new Map((items||[]).filter((i)=>i.sku).map((i)=>[String(i.sku).trim().toUpperCase(),i]));
  const {data:existing}=await admin.from("nfos_square_catalog_mappings").select("*").eq("active",true);
  const mappedIds=new Set((existing||[]).map((m)=>m.square_variation_id));
  let count=0;
  for(const v of variations){
    if(mappedIds.has(v.id)||!v.sku) continue;
    const item=itemBySku.get(String(v.sku).trim().toUpperCase());
    if(!item) continue;
    const {error}=await admin.from("nfos_square_catalog_mappings").upsert({
      square_variation_id:v.id,item_id:item.id,square_item_name:v.item_name,
      square_variation_name:v.variation_name,square_sku:v.sku,active:true,
      mapped_by:userId,mapped_at:new Date().toISOString(),updated_at:new Date().toISOString(),
    },{onConflict:"square_variation_id"});
    if(!error){count+=1;mappedIds.add(v.id);}
  }
  return count;
};

const searchOrders=async(locationId,startAt,endAt)=>{
  let cursor=null;
  const orders=[];
  do{
    const body={
      return_entries:false,
      limit:500,
      location_ids:[locationId],
      query:{
        filter:{
          date_time_filter:{closed_at:{start_at:startAt,end_at:endAt}},
          state_filter:{states:["COMPLETED"]},
        },
        sort:{sort_field:"CLOSED_AT",sort_order:"ASC"},
      },
    };
    if(cursor) body.cursor=cursor;
    const result=await square("/v2/orders/search",{body});
    orders.push(...(result.orders||[]));
    cursor=result.cursor||null;
  }while(cursor);
  return orders;
};

export default async(req)=>{
  if(req.method!=="POST") return json(405,{error:"POST only"});
  try{
    const {admin,user,member}=await authMember(req);
    const body=await req.json().catch(()=>({}));
    const action=String(body.action||"").trim();

    if(action==="locations"){
      const locations=await listSquareLocations();
      return json(200,{locations,default_location_id:process.env.SQUARE_LOCATION_ID||null});
    }

    if(action==="catalog"){
      const variations=await listCatalog();
      const autoMapped=await autoMapExactSkus(admin,variations,user.id);
      const {data:mappings}=await admin
        .from("nfos_square_catalog_mappings")
        .select("square_variation_id,item_id,square_item_name,square_variation_name,square_sku,nfos_items:item_id(sku,name)")
        .eq("active",true);
      const mapById=new Map((mappings||[]).map((m)=>[m.square_variation_id,{
        square_variation_id:m.square_variation_id,item_id:m.item_id,
        nfos_sku:m.nfos_items?.sku,nfos_name:m.nfos_items?.name,
      }]));
      return json(200,{variations:variations.map((v)=>({...v,mapping:mapById.get(v.id)||null})),auto_mapped:autoMapped});
    }

    if(action==="sync"){
      const sessionId=String(body.sessionId||"").trim();
      if(!sessionId) return json(400,{error:"Market session is required."});
      const session=await assertSessionAccess(admin,member,sessionId);
      if(!session.square_location_id) return json(400,{error:"Link a Square location to this market session first."});
      if(!session.opened_at) return json(400,{error:"Open the market session before syncing Square."});

      const endAt=session.closed_at||new Date().toISOString();
      const orders=await searchOrders(session.square_location_id,session.opened_at,endAt);

      const {data:mappings}=await admin
        .from("nfos_square_catalog_mappings")
        .select("square_variation_id,item_id")
        .eq("active",true);
      const mapByVariation=new Map((mappings||[]).map((m)=>[m.square_variation_id,m.item_id]));

      let imported=0,duplicates=0,squareGross=0;
      const unmapped=[],errors=[];

      for(const order of orders){
        const tenders=order.tenders||[];
        const paymentMethod=[...new Set(tenders.map((t)=>t.type).filter(Boolean))].join("+")||null;
        const paymentId=tenders.find((t)=>t.payment_id)?.payment_id||tenders[0]?.id||null;

        for(const [index,line] of (order.line_items||[]).entries()){
          const quantity=Number(line.quantity||0);
          const grossCents=Number(line.total_money?.amount ?? line.gross_sales_money?.amount ?? 0);
          if(quantity<=0) continue;
          squareGross+=grossCents;

          const variationId=line.catalog_object_id||null;
          const externalLineId=`${order.id}:${line.uid||variationId||index}`;

          if(!variationId||!mapByVariation.has(variationId)){
            unmapped.push({
              order_id:order.id,line_id:externalLineId,catalog_object_id:variationId,
              name:line.name||"Unmapped Square item",variation_name:line.variation_name||"",
              quantity,gross_cents:grossCents,
            });
            continue;
          }

          const itemId=mapByVariation.get(variationId);
          const unitCents=Number(line.base_price_money?.amount ?? Math.round(grossCents/quantity));

          const {data:result,error}=await admin.rpc("nfos_market_record_square_sale_service",{
            p_session_id:sessionId,p_item_id:itemId,p_quantity:quantity,
            p_unit_cents:unitCents,p_gross_cents:grossCents,
            p_payment_method:paymentMethod,p_external_order_id:order.id,
            p_external_payment_id:paymentId,p_external_line_id:externalLineId,
            p_sold_at:order.closed_at||order.updated_at||order.created_at||new Date().toISOString(),
            p_notes:`Square sync — ${session.venue_name}`,
          });

          if(error){
            errors.push({order_id:order.id,line_id:externalLineId,name:line.name,error:error.message});
          }else if(result?.duplicate){
            duplicates+=1;
          }else{
            imported+=1;
          }
        }
      }

      const reviewCount=unmapped.length+errors.length;
      const {data:reconciliation,error:reconError}=await admin.rpc("nfos_market_update_reconciliation_service",{
        p_session_id:sessionId,
        p_square_gross_cents:squareGross,
        p_square_transaction_count:orders.length,
        p_unmapped_line_count:reviewCount,
        p_notes:reviewCount?`Square sync requires review of ${reviewCount} line(s).`:"Square sync matched.",
      });
      if(reconError) throw new Error(reconError.message);

      return json(200,{
        session_id:sessionId,orders:orders.length,imported,duplicates,
        square_gross_cents:squareGross,unmapped,errors,reconciliation,
      });
    }

    return json(400,{error:"Unknown Square market action."});
  }catch(error){
    return json(Number(error?.status||500),{error:String(error?.message||error)});
  }
};

export const config={path:"/.netlify/functions/nfos-square-market-sync"};

