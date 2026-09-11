import { db, ok, bad } from "./_square.mjs";

async function signedImageUrl(supa,row){
  if(!row.image_path) return null;
  const bucket=row.image_bucket||"review-images";
  const {data,error}=await supa.storage.from(bucket).createSignedUrl(row.image_path,60*60);
  if(error){ console.error("Could not sign review image:",error.message); return null; }
  return data?.signedUrl||null;
}

export default async(req)=>{
  if(req.method!=="GET") return bad("GET only",405);
  try{
    const supa=db();
    const {data,error}=await supa.from("reviews")
      .select("id,display_name,rating,title,body,product_text,image_bucket,image_path,approved_at,flavor_id,flavor:flavors!reviews_flavor_id_fkey(id,name,active)")
      .eq("status","approved").order("approved_at",{ascending:false}).limit(100);
    if(error) throw new Error(error.message);

    const ids=[...new Set((data||[]).map((r)=>r.flavor_id).filter(Boolean))];
    let stock=[],flags=[],spunEnabled=true;
    if(ids.length){
      const [s,f,sp]=await Promise.all([
        supa.from("stock").select("flavor_id,type,in_stock,on_hand").in("flavor_id",ids),
        supa.from("flavor_request_flags").select("flavor_id,popular").in("flavor_id",ids),
        supa.from("settings").select("value").eq("key","spun_availability").maybeSingle(),
      ]);
      if(s.error) throw new Error(s.error.message);
      if(f.error) throw new Error(f.error.message);
      stock=s.data||[]; flags=f.data||[]; spunEnabled=sp.data?.value?.enabled!==false;
    }

    const stockByFlavor=new Map();
    stock.forEach((row)=>{
      const rows=stockByFlavor.get(row.flavor_id)||[];
      rows.push(row); stockByFlavor.set(row.flavor_id,rows);
    });
    const popular=new Map(flags.map((row)=>[row.flavor_id,row.popular===true]));

    const isAvailable=(review)=>{
      if(!review.flavor || review.flavor.active===false) return false;
      const rows=stockByFlavor.get(review.flavor_id)||[];
      if(!rows.length) return true;
      return rows.some((row)=>{
        if(row.type==="spun" && !spunEnabled) return false;
        if(row.in_stock===false) return false;
        if(row.on_hand!==null && Number(row.on_hand)<=0) return false;
        return true;
      });
    };

    const reviews=await Promise.all((data||[]).map(async(review)=>({
      id:review.id,displayName:review.display_name,rating:review.rating,
      title:review.title||"",body:review.body,productText:review.product_text||"",
      approvedAt:review.approved_at,imageUrl:await signedImageUrl(supa,review),
      flavorId:review.flavor_id||null,flavorName:review.flavor?.name||"",
      flavorAvailable:review.flavor_id?isAvailable(review):null,
      popularRequest:review.flavor_id?popular.get(review.flavor_id)===true:false,
    })));
    return ok({reviews});
  }catch(error){
    console.error("Public review list failed:",error);
    return bad("Reviews are temporarily unavailable.",500);
  }
};
