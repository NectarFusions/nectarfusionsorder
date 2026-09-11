import { createHash } from "node:crypto";
import { db, ok, bad } from "./_square.mjs";

const UUID_RE=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const text=(value)=>String(value??"").trim();

async function flavorAvailable(supa, flavor){
  if(!flavor || flavor.active===false) return false;
  const [stockResult,spunResult]=await Promise.all([
    supa.from("stock").select("type,in_stock,on_hand").eq("flavor_id",flavor.id),
    supa.from("settings").select("value").eq("key","spun_availability").maybeSingle(),
  ]);
  if(stockResult.error) throw new Error(stockResult.error.message);
  const rows=stockResult.data||[];
  if(!rows.length) return true;
  const spunEnabled=spunResult.data?.value?.enabled!==false;
  return rows.some((row)=>{
    if(row.type==="spun" && !spunEnabled) return false;
    if(row.in_stock===false) return false;
    if(row.on_hand!==null && Number(row.on_hand)<=0) return false;
    return true;
  });
}

export default async(req)=>{
  if(req.method!=="POST") return bad("POST only",405);
  try{
    const body=await req.json().catch(()=>({}));
    const flavorId=text(body?.flavorId);
    const reviewId=text(body?.reviewId);
    const requesterKey=text(body?.requesterKey);
    if(!UUID_RE.test(flavorId)) return bad("Choose a valid flavor.");
    if(reviewId && !UUID_RE.test(reviewId)) return bad("That review is not valid.");
    if(requesterKey.length<8 || requesterKey.length>160) return bad("Flavor request session is not valid.");

    const supa=db();
    const {data:flavor,error:flavorError}=await supa.from("flavors").select("id,name,active").eq("id",flavorId).maybeSingle();
    if(flavorError) throw new Error(flavorError.message);
    if(!flavor) return bad("That flavor is no longer listed.",404);
    if(await flavorAvailable(supa,flavor)) return bad(`${flavor.name} is currently available to shop.`,409);

    const requesterHash=createHash("sha256").update(requesterKey).digest("hex");
    const {error}=await supa.from("flavor_requests").insert({
      flavor_id:flavor.id,
      flavor_name:flavor.name,
      requester_hash:requesterHash,
      source:reviewId?"review":"website",
      review_id:reviewId||null,
    });

    if(error?.code==="23505") return ok({requested:true,duplicate:true,message:`${flavor.name} is already on your request list for today.`});
    if(error) throw new Error(error.message);
    return ok({requested:true,duplicate:false,message:`${flavor.name} was added to the flavor request list.`});
  }catch(error){
    console.error("Flavor request failed:",error);
    return bad("That flavor request could not be saved. Please try again.",500);
  }
};
