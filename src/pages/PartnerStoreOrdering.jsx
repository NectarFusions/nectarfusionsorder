import { useEffect, useMemo, useState } from "react";
import * as api from "../lib/api";

const PICKUP_ADDRESS = "122 E Railway St, Coleman, MI 48618";
const DAYS = [
  ["monday","Monday"],["tuesday","Tuesday"],["wednesday","Wednesday"],
  ["thursday","Thursday"],["friday","Friday"],["saturday","Saturday"],["sunday","Sunday"],
];
const TOP_GIFT_FLAVOR_ALIASES = [
  ["Peach"],["Blueberry"],["Thai Hot Pepper"],["Madagascar Vanilla","Vanilla"],["Cinnamon"],["Lemon"],
];
const money = (c) => new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(Number(c||0)/100);
const norm = (v) => String(v||"").trim().toLowerCase();
const giftFlavorsFrom = (flavors) => TOP_GIFT_FLAVOR_ALIASES.flatMap((aliases) => {
  const names = aliases.map(norm);
  const match = (flavors||[]).find((f) => names.includes(norm(f?.name)));
  return match ? [match] : [];
});
const CATEGORY = {
  retail:"Retailer Replenishment",
  bulk:"Wholesale & Bulk",
  gift:"Gift Sets",
  gift_addon:"Gift Add-ons",
  custom_label:"Custom Labels",
};

const CSS = `
.nfps{margin-top:18px}.nfps *{box-sizing:border-box}
.nfps-hero{padding:22px;border-radius:20px;background:linear-gradient(135deg,#102E40,#174C68);color:#fff}
.nfps-hero small{color:#F7C41C;font-weight:900;letter-spacing:.08em;text-transform:uppercase}.nfps-hero h2{margin:5px 0 7px;font-size:34px}.nfps-hero p{margin:0;color:#D9EAF2;font-size:14px;line-height:1.55}
.nfps-tabs{position:sticky;top:0;z-index:20;display:grid;grid-template-columns:repeat(4,1fr);gap:7px;margin-top:12px;padding:7px;border:1px solid #D5E3EA;border-radius:15px;background:rgba(248,252,253,.97);backdrop-filter:blur(8px)}
.nfps-tabs button{min-height:48px;border:0;border-radius:10px;background:transparent;color:#547180;font:inherit;font-weight:900;cursor:pointer}.nfps-tabs button.active{background:#173C52;color:#fff}.nfps-count{display:inline-grid;place-items:center;min-width:22px;height:22px;margin-left:5px;padding:0 6px;border-radius:999px;background:#F7C41C;color:#102E40;font-size:12px}
.nfps-msg,.nfps-note{margin-top:12px;padding:12px 14px;border-radius:11px;font-size:14px;line-height:1.5}.nfps-note{border-left:4px solid #F7C41C;background:#FFF9E8;color:#604A1C}.nfps-msg.error{border:1px solid #E1AAAA;background:#FFF3F3;color:#812B2B}.nfps-msg.success{border:1px solid #A8D1B4;background:#F2FAF4;color:#285A37}
.nfps-panel{display:grid;gap:16px;margin-top:16px}.nfps-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:13px}.nfps-card{overflow:hidden;border:1px solid #D4E2E9;border-radius:16px;background:#fff}.nfps-head{display:flex;gap:12px;align-items:center;padding:14px;background:#F8FBFC}.nfps-head img{width:66px;height:66px;object-fit:contain;border-radius:9px;background:#fff}.nfps-head h3{margin:0;color:#173C52;font-size:18px}.nfps-head p{margin:4px 0 0;color:#6B828D;font-size:13px}.nfps-body{display:grid;gap:9px;padding:13px}
.nfps-row{display:grid;grid-template-columns:minmax(0,1fr) 88px auto;gap:8px;align-items:center;padding:9px;border:1px solid #E0E9ED;border-radius:10px}.nfps-row strong{color:#173C52;font-size:14px}.nfps-row span{display:block;margin-top:2px;color:#6B818C;font-size:13px}
.nfps input,.nfps select,.nfps textarea{width:100%;min-height:42px;padding:9px 10px;border:1px solid #BED2DC;border-radius:9px;background:#fff;color:#173C52;font:inherit;font-size:14px}.nfps textarea{min-height:86px;resize:vertical}
.nfps-btn{min-height:42px;padding:9px 12px;border:0;border-radius:9px;background:#173C52;color:#fff;font:inherit;font-weight:900;cursor:pointer}.nfps-btn.gold{background:#F7C41C;color:#102E40}.nfps-btn.soft{background:#EAF4F8;color:#173C52}.nfps-btn:disabled{opacity:.45;cursor:not-allowed}
.nfps-bulk{display:grid;grid-template-columns:1fr 1fr 88px;gap:8px}.nfps-gift{display:grid;gap:13px;padding:15px;border:1px solid #D4E2E9;border-radius:16px;background:#fff}.nfps-gift-top{display:flex;gap:13px;align-items:center}.nfps-gift-top img{width:82px;height:82px;object-fit:contain;border:1px solid #E1EBEF;border-radius:11px}.nfps-gift-top h3{margin:0;color:#173C52;font-size:20px}.nfps-gift-top p{margin:4px 0 0;color:#69818C;font-size:13px}
.nfps-flavors{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.nfps-flavor{display:grid;grid-template-columns:minmax(0,1fr) 80px;gap:9px;align-items:center;padding:9px 10px;border:1px solid #D7E4EA;border-radius:10px;background:#FAFCFD}.nfps-flavor span{font-size:14px;font-weight:800;color:#173C52}.nfps-flavor input{width:80px;text-align:center}
.nfps-addons{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}.nfps-addon{display:grid;gap:4px;padding:9px;border:1px solid #D7E4EA;border-radius:10px}.nfps-addon strong{font-size:13px;color:#173C52}.nfps-addon span{font-size:12px;color:#708691}
.nfps-field{display:grid;gap:5px}.nfps-field label{font-size:13px;font-weight:850;color:#4F6977}.nfps-labels{display:grid;gap:10px;padding:14px;border:1px solid #D5E3EA;border-radius:14px;background:#FAFCFD}.nfps-check{display:flex;gap:9px;align-items:flex-start}.nfps-check input{width:18px;height:18px;min-height:0;margin-top:2px}
.nfps-files{display:grid;gap:6px}.nfps-file{display:flex;justify-content:space-between;gap:8px;padding:8px;border-radius:8px;background:#EEF5F8;font-size:13px}.nfps-file button{border:0;background:transparent;color:#8A3030;font:inherit;font-weight:850;cursor:pointer}
.nfps-cart{display:grid;gap:13px}.nfps-group{display:grid;gap:7px}.nfps-group h3{margin:0;color:#173C52;font-size:17px}.nfps-line{display:grid;grid-template-columns:minmax(0,1fr) auto auto;gap:10px;align-items:center;padding:10px 11px;border:1px solid #DCE7EC;border-radius:10px;background:#fff}.nfps-line strong{color:#173C52;font-size:14px}.nfps-line span{color:#667D89;font-size:13px}.nfps-line button{border:0;background:transparent;color:#8A3030;font:inherit;font-size:13px;font-weight:900;cursor:pointer}
.nfps-checkout{display:grid;gap:15px;padding:16px;border:1px solid #CADDE6;border-radius:17px;background:#F8FBFC}.nfps-checkout h3{margin:0;color:#173C52;font-size:20px}.nfps-two{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}.nfps-full{grid-column:1/-1}.nfps-fulfill{display:grid;grid-template-columns:1fr 1fr;gap:8px}.nfps-fulfill button{min-height:50px;border:1px solid #BFD3DD;border-radius:10px;background:#fff;color:#173C52;font:inherit;font-weight:900;cursor:pointer}.nfps-fulfill button.active{background:#173C52;color:#fff}
.nfps-days{display:flex;flex-wrap:wrap;gap:6px}.nfps-days label{display:flex;gap:5px;align-items:center;padding:7px 9px;border:1px solid #D3E2E9;border-radius:999px;background:#fff;font-size:13px}.nfps-days input{width:16px;height:16px;min-height:0;padding:0}
.nfps-total{display:grid;gap:6px;padding:13px;border-radius:11px;background:#EDF7FB}.nfps-total div{display:flex;justify-content:space-between;gap:10px;color:#536F7D;font-size:14px}.nfps-total .grand{padding-top:7px;border-top:1px solid #C9DEE7;color:#173C52;font-size:18px;font-weight:900}.nfps-actions{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.nfps-orders{display:grid;gap:7px}.nfps-order{display:grid;grid-template-columns:minmax(0,1fr) auto auto;gap:10px;align-items:center;padding:10px 11px;border:1px solid #DCE7EC;border-radius:10px;background:#fff}.nfps-order strong{color:#173C52;font-size:14px}.nfps-order span{color:#687F8B;font-size:13px}
@media(max-width:760px){.nfps-tabs{grid-template-columns:1fr 1fr}.nfps-grid,.nfps-flavors,.nfps-addons,.nfps-two,.nfps-actions{grid-template-columns:1fr}.nfps-row{grid-template-columns:1fr 80px}.nfps-row .nfps-btn{grid-column:1/-1}.nfps-bulk{grid-template-columns:1fr}.nfps-full{grid-column:auto}.nfps-line,.nfps-order{grid-template-columns:1fr}.nfps-hero h2{font-size:29px}}
`;

const displayName = (item) => {
  if (item.category === "retail") return `${item.flavorName} · ${item.sizeLabel} · ${item.texture === "spun" ? "Spun" : "Regular"}`;
  if (item.category === "bulk") return item.honeyType === "natural" ? `${item.sizeLabel} · Natural Raw Honey` : `${item.sizeLabel} · ${item.flavorName} Infused`;
  if (item.category === "gift") return `${item.containerLabel} · ${item.flavorName}`;
  return item.name || "Custom Labels";
};

export default function PartnerStoreOrdering({ account: suppliedAccount = null }) {
  const [account,setAccount] = useState(suppliedAccount);
  const [retail,setRetail] = useState([]);
  const [bulk,setBulk] = useState({sizes:[],flavors:[],giftSetFlavors:[]});
  const [orders,setOrders] = useState([]);
  const [tab,setTab] = useState("retail");
  const [cart,setCart] = useState([]);
  const [retailQty,setRetailQty] = useState({});
  const [bulkDraft,setBulkDraft] = useState({});
  const [giftDraft,setGiftDraft] = useState({
    bear:{quantities:{},lidColor:"",customDetails:"",dipper:0,thankYouTag:0,beeCharm:0},
    hex:{quantities:{},customDetails:"",dipper:0,thankYouTag:0,beeCharm:0},
  });
  const [labels,setLabels] = useState({enabled:false,notes:"",examples:[]});
  const [uploading,setUploading] = useState(false);
  const [checkout,setCheckout] = useState({fulfillmentMethod:"pickup",neededBy:"",preferredDeliveryDays:[],currentInventoryNotes:"",requestNotes:""});
  const [profile,setProfile] = useState({businessName:"",phone:"",addressLine1:"",addressLine2:"",city:"",state:"MI",zip:"",deliveryNotes:""});
  const [quote,setQuote] = useState(null);
  const [busy,setBusy] = useState("");
  const [error,setError] = useState("");
  const [success,setSuccess] = useState("");

  const key = account?.id ? `nectarfusions-partner-store-cart:${account.id}` : null;

  const reloadOrders = async () => {
    try { setOrders(await api.listPartnerStoreOrders()); } catch { setOrders([]); }
  };

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        let nextAccount = suppliedAccount;
        if (!nextAccount) {
          const ctx = await api.getPartnerPortalContext();
          if (ctx?.kind !== "partner") throw new Error("Partner account could not be loaded.");
          nextAccount = ctx.account;
        }
        const [retailData,bulkData] = await Promise.all([
          api.getPartnerReplenishmentCatalog(),
          api.getPartnerBulkOrderCatalog(),
        ]);
        if (!live) return;
        setAccount(nextAccount);
        setRetail(Array.isArray(retailData) ? retailData : []);
        setBulk(bulkData || {sizes:[],flavors:[],giftSetFlavors:[]});
        setProfile({
          businessName:nextAccount?.business_name||"",
          phone:nextAccount?.phone||"",
          addressLine1:nextAccount?.address_line1||"",
          addressLine2:nextAccount?.address_line2||"",
          city:nextAccount?.city||"",
          state:nextAccount?.state||"MI",
          zip:nextAccount?.zip||"",
          deliveryNotes:nextAccount?.delivery_notes||"",
        });
        const returned = new URLSearchParams(window.location.search).get("partner-order");
        if (returned) {
          setTab("cart");
          setSuccess(`Returned from Square for ${returned}. Payment confirmation may take a moment.`);
        }
        await reloadOrders();
      } catch (e) {
        if (live) setError(e?.message || "Partner ordering could not be loaded.");
      }
    })();
    return () => { live = false; };
  }, [suppliedAccount]);

  useEffect(() => {
    if (!key) return;
    try {
      const saved = JSON.parse(localStorage.getItem(key)||"[]");
      if (Array.isArray(saved)) setCart(saved);
    } catch { setCart([]); }
  }, [key]);

  useEffect(() => {
    if (key) localStorage.setItem(key,JSON.stringify(cart));
  }, [cart,key]);

  const clear = () => { setError(""); setSuccess(""); setQuote(null); };

  const addLine = (line) => {
    setCart((current) => {
      const found = current.find((x) => x.id === line.id);
      return found
        ? current.map((x) => x.id === line.id ? {...line,quantity:Number(x.quantity)+Number(line.quantity)} : x)
        : [...current,line];
    });
    clear();
    setSuccess(`${displayName(line)} added to cart.`);
  };

  const groupedRetail = useMemo(() => {
    const map = new Map();
    for (const row of retail) {
      const id = String(row.flavor_id);
      if (!map.has(id)) map.set(id,{id:row.flavor_id,name:row.flavor_name,image:row.image_url,variants:[]});
      map.get(id).variants.push(row);
    }
    return [...map.values()];
  }, [retail]);

  const giftFlavors = useMemo(() => giftFlavorsFrom(bulk.giftSetFlavors),[bulk.giftSetFlavors]);
  const subtotal = cart.reduce((s,i) => s + Number(i.quantity||0)*Number(i.unitPriceCents||0),0);
  const retailJars = cart.filter((i)=>i.category==="retail").reduce((s,i)=>s+Number(i.quantity||0),0);

  const saveGift = (container) => {
    const d = giftDraft[container];
    const total = Object.values(d.quantities).reduce((s,v)=>s+Number(v||0),0);
    if (total < 1) { setError("Enter at least one gift flavor quantity."); return; }
    const isBear = container === "bear";
    const label = isBear ? "2 oz Plastic Bear" : "2 oz Glass Hexagon";
    const unit = isBear ? (total>=50?300:400) : (total>=50?325:475);
    const lines = giftFlavors
      .map((f)=>({f,q:Number(d.quantities[String(f.id)]||0)}))
      .filter((x)=>x.q>0)
      .map(({f,q})=>({
        id:`gift:${container}:${f.id}`,category:"gift",containerType:container,containerLabel:label,
        flavorId:f.id,flavorName:f.name,quantity:q,unitPriceCents:unit,lidColor:isBear?d.lidColor:"",
        customDetails:d.customDetails,
      }));
    const addonMap = [
      ["dipper","Wood honey dipper",d.dipper],
      ["thank_you_tag","Thank You tag",d.thankYouTag],
      ["bee_charm","Bee charm",d.beeCharm],
    ].filter((x)=>Number(x[2]||0)>0).map(([addonType,name,q])=>({
      id:`gift_addon:${container}:${addonType}`,category:"gift_addon",addonType,containerType:container,name,
      quantity:Number(q),unitPriceCents:100,
    }));
    setCart((current)=>[
      ...current.filter((i)=>!((i.category==="gift"||i.category==="gift_addon")&&i.containerType===container)),
      ...lines,...addonMap,
    ]);
    clear(); setSuccess(`${label} gift items updated in cart.`);
  };

  const saveLabels = () => {
    setCart((current)=>{
      const base = current.filter((i)=>i.category!=="custom_label");
      return labels.enabled ? [...base,{id:"custom_label",category:"custom_label",name:"Custom design + printing & labeling",quantity:1,unitPriceCents:3000,notes:labels.notes,labelExamples:labels.examples}] : base;
    });
    clear(); setSuccess(labels.enabled ? "Custom labels added to cart." : "Custom labels removed from cart.");
  };

  const payload = () => ({
    items:cart,
    fulfillmentMethod:checkout.fulfillmentMethod,
    neededBy:checkout.neededBy||null,
    preferredDeliveryDays:checkout.preferredDeliveryDays,
    currentInventoryNotes:checkout.currentInventoryNotes.trim()||null,
    requestNotes:checkout.requestNotes.trim()||null,
    deliveryProfile:profile,
  });

  const review = async () => {
    if (!cart.length) { setError("Add at least one product to your cart."); return; }
    setBusy("quote"); setError(""); setSuccess("");
    try { setQuote(await api.quotePartnerStoreOrder(payload())); }
    catch(e){ setQuote(null); setError(e?.message||"The total could not be calculated."); }
    finally{ setBusy(""); }
  };

  const submit = async () => {
    if (!cart.length) { setError("Add at least one product to your cart."); return; }
    setBusy("checkout"); setError(""); setSuccess("");
    try {
      const result = await api.checkoutPartnerStoreOrder(payload());
      if (key) localStorage.removeItem(key);
      setCart([]); setQuote(null);
      if (result.checkoutUrl) { window.location.assign(result.checkoutUrl); return; }
      setSuccess(result.error || `Order ${result.orderNo} was saved. NectarFusions will send the Square payment link.`);
      await reloadOrders();
    } catch(e){ setError(e?.message||"The order could not be submitted."); }
    finally{ setBusy(""); }
  };

  const Retail = () => (
    <div className="nfps-panel">
      <div className="nfps-note">Retailer Replenishment is ordered in six-jar increments. The retail portion of the cart must total at least 12 jars. Wholesale and gift items can be added to the same order but do not count toward the 12-jar minimum.</div>
      <div className="nfps-grid">
        {groupedRetail.map((flavor)=>(
          <article className="nfps-card" key={flavor.id}>
            <div className="nfps-head">{flavor.image?<img src={flavor.image} alt="" />:null}<div><h3>{flavor.name}</h3><p>Partner restock pricing</p></div></div>
            <div className="nfps-body">
              {flavor.variants.map((v)=>{
                const k=`${v.flavor_id}|${v.size_id}|${v.texture}`;
                const q=Number(retailQty[k]||6);
                return <div className="nfps-row" key={k}>
                  <div><strong>{v.size_label} · {v.texture==="spun"?"Spun":"Regular"}</strong><span>{money(v.unit_price_cents)} each</span></div>
                  <input type="number" min="6" max="996" step="6" value={q} onChange={(e)=>setRetailQty((c)=>({...c,[k]:e.target.value}))}/>
                  <button className="nfps-btn" type="button" onClick={()=>{
                    if(q<6||q>996||q%6!==0){setError("Retail quantities must be in six-jar increments.");return;}
                    addLine({id:`retail:${k}`,category:"retail",flavorId:v.flavor_id,flavorName:v.flavor_name,sizeId:v.size_id,sizeLabel:v.size_label,texture:v.texture,quantity:q,unitPriceCents:v.unit_price_cents});
                  }}>Add to Cart</button>
                </div>;
              })}
            </div>
          </article>
        ))}
      </div>
    </div>
  );

  const Wholesale = () => (
    <div className="nfps-panel">
      <div className="nfps-note">Wholesale containers can be mixed into the same cart as retail jars and gift sets.</div>
      <div className="nfps-grid">
        {(bulk.sizes||[]).map((size)=>{
          const d=bulkDraft[size.id]||{honeyType:"natural",flavorId:"",quantity:1};
          return <article className="nfps-card" key={size.id}>
            <div className="nfps-head"><div><h3>{size.label}</h3><p>Natural {money(size.natural_price_cents)} · Infused {money(size.infused_price_cents)}</p></div></div>
            <div className="nfps-body">
              <div className="nfps-bulk">
                <select value={d.honeyType} onChange={(e)=>setBulkDraft((c)=>({...c,[size.id]:{...d,honeyType:e.target.value,flavorId:e.target.value==="natural"?"":d.flavorId}}))}><option value="natural">Natural</option><option value="infused">Infused</option></select>
                {d.honeyType==="infused"?<select value={d.flavorId} onChange={(e)=>setBulkDraft((c)=>({...c,[size.id]:{...d,flavorId:e.target.value}}))}><option value="">Choose flavor</option>{(bulk.flavors||[]).map((f)=><option key={f.id} value={f.id}>{f.name}</option>)}</select>:<div/>}
                <input type="number" min="1" max="999" value={d.quantity} onChange={(e)=>setBulkDraft((c)=>({...c,[size.id]:{...d,quantity:e.target.value}}))}/>
              </div>
              <button className="nfps-btn" type="button" onClick={()=>{
                const q=Number.parseInt(d.quantity,10)||0;
                const f=(bulk.flavors||[]).find((x)=>String(x.id)===String(d.flavorId));
                if(q<1){setError("Enter a wholesale quantity.");return;}
                if(d.honeyType==="infused"&&!f){setError("Choose an infused flavor.");return;}
                addLine({id:`bulk:${size.id}:${d.honeyType}:${f?.id||"natural"}`,category:"bulk",honeyType:d.honeyType,flavorId:f?.id||null,flavorName:f?.name||null,sizeId:size.id,sizeLabel:size.label,quantity:q,unitPriceCents:d.honeyType==="natural"?size.natural_price_cents:size.infused_price_cents});
              }}>Add to Cart</button>
            </div>
          </article>;
        })}
      </div>
    </div>
  );

  const GiftCard = ({container}) => {
    const d=giftDraft[container], isBear=container==="bear";
    const total=Object.values(d.quantities).reduce((s,v)=>s+Number(v||0),0);
    const unit=isBear?(total>=50?300:400):(total>=50?325:475);
    return <article className="nfps-gift">
      <div className="nfps-gift-top"><img src={isBear?"/images/partner-gift-bear-2oz.jpg":"/images/partner-gift-hexagonal.jpg"} alt=""/><div><h3>{isBear?"2 oz Plastic Bear":"2 oz Glass Hexagon"}</h3><p>{money(unit)} each{total>=50?" · 50+ pricing applied":""}</p></div></div>
      <div className="nfps-flavors">{giftFlavors.map((f)=><label className="nfps-flavor" key={f.id}><span>{f.name}</span><input type="number" min="0" max="999" value={d.quantities[String(f.id)]||0} onChange={(e)=>setGiftDraft((c)=>({...c,[container]:{...c[container],quantities:{...c[container].quantities,[String(f.id)]:Math.max(0,Number.parseInt(e.target.value,10)||0)}}}))}/></label>)}</div>
      {isBear?<div className="nfps-field"><label>Preferred lid / top color</label><input value={d.lidColor} onChange={(e)=>setGiftDraft((c)=>({...c,bear:{...c.bear,lidColor:e.target.value}}))}/></div>:null}
      <div className="nfps-addons">{[["dipper","Wood honey dipper"],["thankYouTag","Thank You tag"],["beeCharm","Bee charm"]].map(([k,label])=><label className="nfps-addon" key={k}><strong>{label}</strong><span>$1.00 each</span><input type="number" min="0" max="999" value={d[k]} onChange={(e)=>setGiftDraft((c)=>({...c,[container]:{...c[container],[k]:Math.max(0,Number.parseInt(e.target.value,10)||0)}}))}/></label>)}</div>
      <div className="nfps-field"><label>Custom details for this gift container</label><textarea value={d.customDetails} onChange={(e)=>setGiftDraft((c)=>({...c,[container]:{...c[container],customDetails:e.target.value}}))}/></div>
      <button className="nfps-btn" type="button" onClick={()=>saveGift(container)}>Add / Update Gift Items in Cart</button>
    </article>;
  };

  const Gifts = () => (
    <div className="nfps-panel">
      <div className="nfps-note">Enter quantities for the six offered flavors, then add the gift container to the same store order.</div>
      <GiftCard container="bear"/><GiftCard container="hex"/>
      <div className="nfps-labels">
        <label className="nfps-check"><input type="checkbox" checked={labels.enabled} onChange={(e)=>setLabels((c)=>({...c,enabled:e.target.checked}))}/><span><strong>Custom design + printing & labeling · $30 flat</strong><br/><span>One setup charge for the full partner order.</span></span></label>
        {labels.enabled?<><div className="nfps-field"><label>Custom label details</label><textarea value={labels.notes} onChange={(e)=>setLabels((c)=>({...c,notes:e.target.value}))}/></div>
        <div className="nfps-field"><label>Upload examples</label><input type="file" multiple disabled={uploading} accept=".jpg,.jpeg,.png,.webp,.pdf,image/jpeg,image/png,image/webp,application/pdf" onChange={async(e)=>{
          const files=Array.from(e.target.files||[]); e.target.value="";
          if(!files.length)return;
          if(labels.examples.length+files.length>5){setError("Upload no more than five label examples.");return;}
          setUploading(true);try{const up=await api.uploadPartnerLabelExamples(files);setLabels((c)=>({...c,examples:[...c.examples,...up]}));}catch(err){setError(err?.message||"Upload failed.");}finally{setUploading(false);}
        }}/></div>
        <div className="nfps-files">{labels.examples.map((ex)=><div className="nfps-file" key={ex.storage_path}><span>{ex.file_name}</span><button type="button" onClick={async()=>{setUploading(true);try{await api.deletePartnerLabelExample(ex.storage_path);setLabels((c)=>({...c,examples:c.examples.filter((x)=>x.storage_path!==ex.storage_path)}));}catch(err){setError(err?.message||"Could not remove file.");}finally{setUploading(false);}}}>Remove</button></div>)}</div></>:null}
        <button className="nfps-btn" type="button" onClick={saveLabels}>{labels.enabled?"Add / Update Custom Labels in Cart":"Remove Custom Labels from Cart"}</button>
      </div>
    </div>
  );

  const Cart = () => {
    const groups=Object.keys(CATEGORY).map((category)=>({category,items:cart.filter((i)=>i.category===category)})).filter((g)=>g.items.length);
    return <div className="nfps-panel">
      {!cart.length?<div className="nfps-note">Your cart is empty. Add products from any ordering tab. They stay here while you move between tabs.</div>:<div className="nfps-cart">{groups.map((g)=><div className="nfps-group" key={g.category}><h3>{CATEGORY[g.category]}</h3>{g.items.map((i)=><div className="nfps-line" key={i.id}><div><strong>{displayName(i)}</strong><span>{i.quantity} × {money(i.unitPriceCents)}</span></div><strong>{money(i.quantity*i.unitPriceCents)}</strong><button type="button" onClick={()=>{setCart((c)=>c.filter((x)=>x.id!==i.id));clear();}}>Remove</button></div>)}</div>)}</div>}
      <div className="nfps-checkout">
        <h3>Checkout & Fulfillment</h3>
        {retailJars>0&&retailJars<12?<div className="nfps-msg error">Retailer Replenishment has {retailJars} jars. Add at least {12-retailJars} more retail jars. Wholesale and gift items do not count toward the 12-jar retail minimum.</div>:null}
        <div className="nfps-fulfill"><button type="button" className={checkout.fulfillmentMethod==="pickup"?"active":""} onClick={()=>{setCheckout((c)=>({...c,fulfillmentMethod:"pickup",preferredDeliveryDays:[]}));setQuote(null);}}>Coleman Pickup</button><button type="button" className={checkout.fulfillmentMethod==="delivery"?"active":""} onClick={()=>{setCheckout((c)=>({...c,fulfillmentMethod:"delivery"}));setQuote(null);}}>Local Delivery</button></div>
        {checkout.fulfillmentMethod==="pickup"?<div className="nfps-note"><strong>Coleman Pickup:</strong> {PICKUP_ADDRESS}. NectarFusions will confirm pickup timing.</div>:<div className="nfps-two">
          {[["businessName","Business / location name"],["phone","Phone"],["addressLine1","Street address"],["addressLine2","Address line 2"],["city","City"],["state","State"],["zip","ZIP"]].map(([k,label])=><div className={`nfps-field ${["addressLine1","addressLine2"].includes(k)?"nfps-full":""}`} key={k}><label>{label}</label><input maxLength={k==="state"?2:k==="zip"?5:250} value={profile[k]} onChange={(e)=>{let v=e.target.value;if(k==="state")v=v.toUpperCase();if(k==="zip")v=v.replace(/\D/g,"").slice(0,5);setProfile((c)=>({...c,[k]:v}));setQuote(null);}}/></div>)}
          <div className="nfps-field nfps-full"><label>Delivery notes</label><textarea value={profile.deliveryNotes} onChange={(e)=>{setProfile((c)=>({...c,deliveryNotes:e.target.value}));setQuote(null);}}/></div>
          <div className="nfps-field nfps-full"><label>Preferred delivery days</label><div className="nfps-days">{DAYS.map(([v,label])=><label key={v}><input type="checkbox" checked={checkout.preferredDeliveryDays.includes(v)} onChange={()=>{setCheckout((c)=>({...c,preferredDeliveryDays:c.preferredDeliveryDays.includes(v)?c.preferredDeliveryDays.filter((x)=>x!==v):[...c.preferredDeliveryDays,v]}));setQuote(null);}}/><span>{label}</span></label>)}</div></div>
        </div>}
        <div className="nfps-two">
          <div className="nfps-field"><label>Needed by</label><input type="date" value={checkout.neededBy} onChange={(e)=>{setCheckout((c)=>({...c,neededBy:e.target.value}));setQuote(null);}}/></div>
          {retailJars>0?<div className="nfps-field nfps-full"><label>Current inventory notes</label><textarea value={checkout.currentInventoryNotes} onChange={(e)=>{setCheckout((c)=>({...c,currentInventoryNotes:e.target.value}));setQuote(null);}}/></div>:null}
          <div className="nfps-field nfps-full"><label>Order / request notes</label><textarea value={checkout.requestNotes} onChange={(e)=>{setCheckout((c)=>({...c,requestNotes:e.target.value}));setQuote(null);}}/></div>
        </div>
        <div className="nfps-total"><div><span>Cart merchandise</span><strong>{money(quote?.subtotalCents??subtotal)}</strong></div><div><span>Partner delivery</span><strong>{quote?money(quote.deliveryFeeCents):"Calculated by ZIP"}</strong></div><div><span>Card processing fee (4%)</span><strong>{quote?money(quote.processingFeeCents):"Calculated securely"}</strong></div><div className="grand"><span>Final total</span><strong>{quote?money(quote.totalCents):"Review total"}</strong></div></div>
        <div className="nfps-actions"><button type="button" className="nfps-btn soft" disabled={!!busy||!cart.length} onClick={review}>{busy==="quote"?"Calculating…":"Review Final Total"}</button><button type="button" className="nfps-btn gold" disabled={!!busy||!cart.length||(retailJars>0&&retailJars<12)} onClick={submit}>{busy==="checkout"?"Saving Order…":"Submit Order & Continue to Square"}</button></div>
      </div>
      <div className="nfps-orders"><h3 style={{margin:0,color:"#173C52"}}>Recent Partner Orders</h3>{!orders.length?<div className="nfps-note">No unified partner store orders yet.</div>:orders.slice(0,8).map((o)=><div className="nfps-order" key={o.id}><div><strong>{o.order_no}</strong><span>{new Date(o.created_at).toLocaleDateString()} · {o.fulfillment_method==="delivery"?"Local Delivery":"Coleman Pickup"}</span></div><strong>{money(o.total_cents)}</strong><span>{o.paid?"Paid":"Awaiting payment"}</span></div>)}</div>
    </div>;
  };

  return <section className="nfps"><style>{CSS}</style><div className="nfps-hero"><small>Partner Store</small><h2>Build One Order</h2><p>Shop Retailer Replenishment, Wholesale & Bulk, and Gift Sets. Everything stays in one cart and checks out together.</p></div>
    <div className="nfps-tabs">{[["retail","Retailer"],["bulk","Wholesale"],["gifts","Gift Sets"],["cart","Cart"]].map(([v,label])=><button key={v} type="button" className={tab===v?"active":""} onClick={()=>{setTab(v);setError("");setSuccess("");}}>{label}{v==="cart"&&cart.length?<span className="nfps-count">{cart.length}</span>:null}</button>)}</div>
    {error?<div className="nfps-msg error">{error}</div>:null}{success?<div className="nfps-msg success">{success}</div>:null}
    {tab==="retail"?<Retail/>:tab==="bulk"?<Wholesale/>:tab==="gifts"?<Gifts/>:<Cart/>}
  </section>;
}
