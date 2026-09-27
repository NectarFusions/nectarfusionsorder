// NF HIVE SPONSORSHIP V6
import { useEffect, useMemo, useState } from "react";
import * as api from "../lib/api";
import PartnerCartDrawer from "./PartnerCartDrawer";
import {
  getPartnerStoreFulfillment,
  setPartnerStoreCart,
  setPartnerStoreFulfillment,
} from "../lib/partnerStoreCart";

const PROGRAM_LABELS = {
  retail: "Retail",
  foodservice: "Foodservice",
  business_gifting: "Business Gifting",
  hive_partners: "Hive Partners",
};

const STATUS_LABELS = {
  awaiting_payment: "Awaiting Payment",
  paid: "Paid",
  queued: "Queued",
  preparing: "Preparing",
  ready: "Ready",
  out_for_delivery: "Out for Delivery",
  pickup_ready: "Pickup Ready",
  fulfilled: "Fulfilled",
  cancelled: "Cancelled",
  submitted: "Submitted",
};

const money = (cents) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(Number(cents || 0) / 100);

const dateLabel = (value) => {
  if (!value) return "—";
  const date = new Date(`${String(value).slice(0, 10)}T12:00:00`);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
};

const cleanStatus = (value) =>
  STATUS_LABELS[value] ||
  String(value || "")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());

const uniqueBy = (items, key) => {
  const map = new Map();
  for (const item of items || []) {
    const value = item?.[key];
    if (value != null && !map.has(value)) map.set(value, item);
  }
  return [...map.values()];
};

const CSS = `
.nf-commerce{display:grid;gap:22px}
.nf-commerce-top{display:flex;justify-content:space-between;align-items:flex-start;gap:18px;padding:20px;border:1px solid #d9e6ec;border-radius:18px;background:linear-gradient(135deg,#f9fcfd,#eef7fa)}
.nf-commerce-kicker{font-size:12px;font-weight:900;letter-spacing:.13em;text-transform:uppercase;color:#377996}
.nf-commerce-top h2{margin:6px 0 4px;font-size:clamp(27px,4vw,42px);line-height:1;color:#102e40}
.nf-commerce-top p{margin:0;color:#607582;max-width:680px;line-height:1.55}
.nf-commerce-program-chips{display:flex;gap:7px;flex-wrap:wrap;margin-top:13px}
.nf-commerce-chip{display:inline-flex;align-items:center;gap:6px;border:1px solid #cfe0e7;border-radius:999px;padding:7px 10px;background:white;font-size:12px;font-weight:850;color:#183c4f}
.nf-commerce-chip[data-status="pending"]{background:#fff9e7;border-color:#eadb9e}
.nf-commerce-chip[data-status="declined"],.nf-commerce-chip[data-status="suspended"]{background:#fff0ef;border-color:#ecc7c4}
.nf-commerce-actions{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end}
.nf-commerce-btn{appearance:none;border:1px solid #1f6788;border-radius:10px;padding:11px 14px;background:white;color:#174b63;font:inherit;font-size:13px;font-weight:900;cursor:pointer}
.nf-commerce-btn.primary{background:#102e40;border-color:#102e40;color:white}
.nf-commerce-btn:disabled{opacity:.45;cursor:not-allowed}
.nf-commerce-nav{display:flex;gap:7px;overflow:auto;padding:5px;border:1px solid #dce8ed;border-radius:14px;background:#f7fafb}
.nf-commerce-nav button{flex:0 0 auto;border:0;border-radius:10px;padding:11px 14px;background:transparent;color:#5b6f79;font:inherit;font-size:13px;font-weight:850;cursor:pointer}
.nf-commerce-nav button[aria-current="page"]{background:#102e40;color:white}
.nf-commerce-panel{border:1px solid #dce8ed;border-radius:18px;background:white;padding:20px}
.nf-commerce-panel-head{display:flex;justify-content:space-between;align-items:flex-start;gap:15px;margin-bottom:18px}
.nf-commerce-panel-head h3{margin:4px 0 5px;font-size:27px;color:#102e40}
.nf-commerce-panel-head p{margin:0;color:#6b7d87;line-height:1.5;max-width:720px}
.nf-commerce-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:13px}
.nf-commerce-card{border:1px solid #dce8ed;border-radius:15px;padding:16px;background:#fff;display:grid;gap:10px;align-content:start}
.nf-commerce-card.soft{background:#f8fbfc}
.nf-commerce-card h4{margin:0;color:#102e40;font-size:19px}
.nf-commerce-card p{margin:0;color:#667b86;font-size:13px;line-height:1.5}
.nf-commerce-card .meta{display:flex;gap:6px;flex-wrap:wrap}
.nf-commerce-card .meta span{padding:5px 8px;border-radius:999px;background:#edf5f8;color:#315b6e;font-size:11px;font-weight:850}
.nf-commerce-stat{display:grid;gap:3px}.nf-commerce-stat span{font-size:11px;text-transform:uppercase;letter-spacing:.09em;color:#718590;font-weight:850}.nf-commerce-stat strong{font-size:21px;color:#102e40}
.nf-commerce-dashboard-grid{display:grid;grid-template-columns:1.3fr .7fr;gap:14px}
.nf-commerce-order-summary{border:1px solid #dce8ed;border-radius:15px;padding:16px;display:grid;gap:12px;background:#f8fbfc}
.nf-commerce-order-summary-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}
.nf-commerce-order-summary h4{margin:0;color:#102e40;font-size:18px}
.nf-commerce-order-summary small{color:#6b7d87}
.nf-commerce-status{display:inline-flex;padding:6px 9px;border-radius:999px;background:#eaf4ee;color:#2c6241;font-size:11px;font-weight:900;text-transform:uppercase;letter-spacing:.06em}
.nf-commerce-status[data-status="awaiting_payment"]{background:#fff5dd;color:#765c1a}.nf-commerce-status[data-status="cancelled"]{background:#f9e7e5;color:#8a3d36}
.nf-commerce-program-tabs{display:flex;gap:7px;overflow:auto;margin-bottom:16px}.nf-commerce-program-tabs button{border:1px solid #d5e3e9;border-radius:999px;background:white;padding:9px 12px;font:inherit;font-size:12px;font-weight:900;color:#456674;cursor:pointer}.nf-commerce-program-tabs button[aria-selected="true"]{background:#102e40;border-color:#102e40;color:white}
.nf-commerce-package-card{border:1px solid #d6e5eb;border-radius:17px;overflow:hidden;background:white;display:flex;flex-direction:column}
.nf-commerce-package-card .body{padding:17px;display:grid;gap:10px;flex:1}.nf-commerce-package-card h4{margin:0;color:#102e40;font-size:21px}.nf-commerce-package-card p{margin:0;color:#627984;line-height:1.5;font-size:13px}.nf-commerce-package-card .meta{display:flex;gap:6px;flex-wrap:wrap}.nf-commerce-package-card .meta span{padding:5px 8px;border-radius:999px;background:#edf5f8;color:#315b6e;font-size:11px;font-weight:850}.nf-commerce-package-card .foot{padding:13px 17px;border-top:1px solid #e2ebef;background:#f9fbfc}
.nf-commerce-builder{margin-top:18px;border:2px solid #b9d8e6;border-radius:18px;padding:18px;background:#fafdfe;display:grid;gap:17px}
.nf-commerce-builder-head{display:flex;justify-content:space-between;gap:14px;align-items:flex-start}.nf-commerce-builder-head h3{margin:3px 0 4px;color:#102e40;font-size:24px}.nf-commerce-builder-head p{margin:0;color:#647a85}
.nf-commerce-field-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:13px}.nf-commerce-field{display:grid;gap:6px}.nf-commerce-field.full{grid-column:1/-1}.nf-commerce-field label,.nf-commerce-choice-label{font-size:12px;font-weight:900;color:#244b5d}.nf-commerce-field input,.nf-commerce-field select,.nf-commerce-field textarea{width:100%;border:1px solid #cbdde5;border-radius:10px;padding:11px;background:white;font:inherit;color:#183b4c}.nf-commerce-field textarea{min-height:90px;resize:vertical}
.nf-commerce-choice-grid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:8px}.nf-commerce-choice{border:1px solid #cbdde5;border-radius:11px;background:white;padding:10px;font:inherit;font-size:12px;font-weight:850;color:#31586a;cursor:pointer}.nf-commerce-choice[aria-pressed="true"]{background:#102e40;color:white;border-color:#102e40}
.nf-commerce-builder-total{display:flex;justify-content:space-between;gap:14px;align-items:center;border-top:1px solid #d8e7ed;padding-top:15px}.nf-commerce-builder-total span{font-size:12px;color:#6b7d87}.nf-commerce-builder-total strong{font-size:24px;color:#102e40}
.nf-commerce-orders{display:grid;gap:10px}.nf-commerce-order{display:grid;grid-template-columns:repeat(auto-fit,minmax(118px,1fr));gap:12px;align-items:center;border:1px solid #dce8ed;border-radius:13px;padding:14px}.nf-commerce-order > div{min-width:0}.nf-commerce-order span{display:block;font-size:11px;text-transform:uppercase;letter-spacing:.07em;color:#7b8e97;font-weight:800;margin-bottom:3px}.nf-commerce-order strong{display:block;color:#173c4f;font-size:13px;overflow:hidden;text-overflow:ellipsis}.nf-commerce-empty{padding:24px;border:1px dashed #cbdde5;border-radius:14px;text-align:center;color:#6c808a;background:#fbfdfd}
.nf-commerce-form-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:4px}.nf-commerce-message{border-radius:11px;padding:11px 13px;font-size:13px;line-height:1.45}.nf-commerce-message.error{background:#fff0ef;color:#8b3e36;border:1px solid #e9c6c2}.nf-commerce-message.success{background:#edf8f1;color:#2f6845;border:1px solid #c9e4d2}
.nf-commerce-account-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}.nf-commerce-program-row{display:flex;justify-content:space-between;gap:12px;align-items:center;padding:11px 0;border-bottom:1px solid #e6eef1}.nf-commerce-program-row:last-child{border-bottom:0}.nf-commerce-program-row strong{color:#173c4f}.nf-commerce-program-row span{font-size:12px;font-weight:900;text-transform:uppercase}
.nf-commerce-note{border-left:4px solid #9ed8f4;padding:10px 12px;background:#f4fafc;color:#546e7b;font-size:13px;line-height:1.5}
@media(max-width:880px){.nf-commerce-grid,.nf-commerce-dashboard-grid,.nf-commerce-account-grid{grid-template-columns:1fr}.nf-commerce-order{grid-template-columns:1fr 1fr}.nf-commerce-order .order-actions{grid-column:1/-1}.nf-commerce-choice-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.nf-commerce-top{flex-direction:column}.nf-commerce-actions{justify-content:flex-start}}
@media(max-width:560px){.nf-commerce-panel{padding:15px}.nf-commerce-field-grid{grid-template-columns:1fr}.nf-commerce-field.full{grid-column:auto}.nf-commerce-order{grid-template-columns:1fr}.nf-commerce-builder-total{align-items:flex-start;flex-direction:column}.nf-commerce-choice-grid{grid-template-columns:1fr 1fr}}
`;

const programName = (row) =>
  row?.program?.label || PROGRAM_LABELS[row?.program_key] || row?.program_key;

const packageBuilder = (pkg) => pkg?.configuration_schema?.builder || "";

const FOODSERVICE_SIZE_LABELS = {
  half_gallon: "1/2 Gallon",
  one_gallon: "1 Gallon",
  five_gallon: "5 Gallon",
};
/* PARTNER PROGRAM HARDENING V13 */
const FOODSERVICE_PRICE_FALLBACK = {
  half_gallon: { natural: 5500, infused: 6500 },
  one_gallon: { natural: 10000, infused: 12000 },
  five_gallon: { natural: 45000, infused: 55000 },
};
const itemRule = (item, key, fallback = null) =>
  item?.rules && Object.prototype.hasOwnProperty.call(item.rules, key)
    ? item.rules[key]
    : fallback;

export default function PartnerCommerceWorkspace({ account, onSignOut, signOutBusy, onManagePassword }) {
  /* PARTNER PASSWORD SETUP V11.1 */
  const [section, setSection] = useState("dashboard");
  const [programs, setPrograms] = useState([]);
  const [packages, setPackages] = useState([]);
  const [orders, setOrders] = useState([]);
  const [recurring, setRecurring] = useState([]);
  const [retailCatalog, setRetailCatalog] = useState([]);
  const [giftPricing, setGiftPricing] = useState({});
  const [giftFlavors, setGiftFlavors] = useState([]);
  const [foodservicePricing, setFoodservicePricing] = useState(FOODSERVICE_PRICE_FALLBACK);
  const [foodserviceFlavors, setFoodserviceFlavors] = useState([]);
  const [activeProgram, setActiveProgram] = useState("");
  const [selectedPackage, setSelectedPackage] = useState(null);
  const [retailConfig, setRetailConfig] = useState({ sizeId: "", texture: "regular", flavorIds: [] });
  const [giftConfig, setGiftConfig] = useState({
    containerType: "bear",
    flavorId: "",
    lidColor: "",
    dipper: false,
    thankYouTag: false,
    beeCharm: false,
    customLabel: false,
    customLabelNotes: "",
    recurring: false,
    cadence: "monthly",
    customIntervalDays: "30",
  });
  const [foodserviceConfig, setFoodserviceConfig] = useState({
    lines: {},
    recurring: false,
    cadence: "monthly",
    customIntervalDays: "30",
  });
  const [hiveConfig, setHiveConfig] = useState({
    sponsorDisplayName: account?.business_name || "",
    recognitionName: "",
    notes: "",
    annualRenewal: false,
  });
  const [profile, setProfile] = useState({
    businessName: account?.business_name || "",
    phone: account?.phone || "",
    addressLine1: account?.address_line1 || "",
    addressLine2: account?.address_line2 || "",
    city: account?.city || "",
    state: account?.state || "MI",
    zip: account?.zip || "",
    deliveryNotes: account?.delivery_notes || "",
    buildingDetails: account?.building_details || "",
    gateAccessCode: account?.gate_access_code || "",
    preferredContactMethod: account?.preferred_contact_method || "text",
    preferredFulfillment: account?.preferred_fulfillment || getPartnerStoreFulfillment(),
  });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const approvedPrograms = useMemo(
    () => programs.filter((row) => row.status === "approved"),
    [programs]
  );

  const refresh = async () => {
    setLoading(true);
    setError("");
    try {
      const [programRows, packageRows, orderRows, recurringRows] = await Promise.all([
        api.listMyPartnerPrograms(),
        api.listPartnerPackages(),
        api.listPartnerStoreOrders(),
        api.listPartnerRecurringOrders(),
      ]);
      setPrograms(programRows);
      setPackages(packageRows);
      setOrders(orderRows);
      setRecurring(recurringRows);

      const approved = programRows.filter((row) => row.status === "approved");
      const approvedKeys = new Set(approved.map((row) => row.program_key));
      const preferredProgram =
        approved.find((row) => row.program_key === "retail")?.program_key ||
        approved.find((row) => row.program_key === "business_gifting")?.program_key ||
        approved[0]?.program_key ||
        "";
      const nextProgram = approvedKeys.has(activeProgram) ? activeProgram : preferredProgram;
      if (nextProgram !== activeProgram) setActiveProgram(nextProgram);

      if (approved.some((row) => row.program_key === "retail")) {
        setRetailCatalog(await api.getPartnerRetailPackageCatalog());
      }
      if (approved.some((row) => row.program_key === "business_gifting")) {
        const [pricing, flavors] = await Promise.all([
          api.getPartnerGiftPricing(),
          api.listPartnerPackageFlavorOptions([
            "Original",
            "Cinnamon",
            "Lemon",
            "Madagascar Vanilla",
            "Chipotle",
          ]),
        ]);
        setGiftPricing(pricing || {});
        setGiftFlavors(flavors || []);
      }
      if (approved.some((row) => row.program_key === "foodservice")) {
        const [pricing, flavors] = await Promise.all([
          api.getPartnerFoodservicePricing(),
          api.listPartnerPackageFlavorOptions(),
        ]);
        setFoodservicePricing({
          half_gallon: {
            ...FOODSERVICE_PRICE_FALLBACK.half_gallon,
            ...(pricing?.half_gallon || {}),
          },
          one_gallon: {
            ...FOODSERVICE_PRICE_FALLBACK.one_gallon,
            ...(pricing?.one_gallon || {}),
          },
          five_gallon: {
            ...FOODSERVICE_PRICE_FALLBACK.five_gallon,
            ...(pricing?.five_gallon || {}),
          },
        });
        setFoodserviceFlavors(flavors || []);
      }
    } catch (loadError) {
      setError(loadError?.message || "The partner commerce workspace could not be loaded.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setProfile({
      businessName: account?.business_name || "",
      phone: account?.phone || "",
      addressLine1: account?.address_line1 || "",
      addressLine2: account?.address_line2 || "",
      city: account?.city || "",
      state: account?.state || "MI",
      zip: account?.zip || "",
      deliveryNotes: account?.delivery_notes || "",
      buildingDetails: account?.building_details || "",
      gateAccessCode: account?.gate_access_code || "",
      preferredContactMethod: account?.preferred_contact_method || "text",
      preferredFulfillment: account?.preferred_fulfillment || getPartnerStoreFulfillment(),
    });
  }, [account]);

  const packageRows = useMemo(
    () => packages.filter((pkg) => pkg.program_key === activeProgram),
    [packages, activeProgram]
  );

  const lastOrder = orders[0] || null;
  const lastFulfilled = orders.find((order) => order.status === "fulfilled") || null;
  const openOrder = orders.find((order) => !["fulfilled", "cancelled"].includes(order.status)) || null;

  const selectPackage = (pkg) => {
    setSelectedPackage(pkg);
    setError("");
    setNotice("");

    if (packageBuilder(pkg) === "retail_shelf") {
      const schema = pkg.configuration_schema || {};
      const fixedNames = Array.isArray(schema.fixed_flavors) ? schema.fixed_flavors : [];
      const fixedIds = fixedNames
        .map((name) => retailCatalog.find((row) => row.flavor_name === name)?.flavor_id)
        .filter(Boolean);
      const first = retailCatalog[0];
      setRetailConfig({
        sizeId: pkg.allowed_size_ids?.includes(first?.size_id) ? first.size_id : pkg.allowed_size_ids?.[0] || first?.size_id || "",
        texture: "regular",
        flavorIds: fixedIds,
      });
    }

    if (packageBuilder(pkg) === "business_gifting") {
      const allowed = giftFlavors.filter((flavor) =>
        !pkg.allowed_flavor_names?.length || pkg.allowed_flavor_names.includes(flavor.name)
      );
      setGiftConfig((current) => ({ ...current, flavorId: allowed[0]?.id || "" }));
    }

    if (packageBuilder(pkg) === "foodservice") {
      const allowed = foodserviceFlavors.filter((flavor) =>
        !pkg.allowed_flavor_names?.length || pkg.allowed_flavor_names.includes(flavor.name)
      );
      const lines = {};
      (pkg.items || []).filter((item) => item.category === "bulk").forEach((item) => {
        const honeyRule = String(itemRule(item, "honey_type", "choice") || "choice");
        const honeyType = ["natural", "infused"].includes(honeyRule) ? honeyRule : "infused";
        const fixedFlavor = item.flavor_id
          ? foodserviceFlavors.find((flavor) => flavor.id === item.flavor_id)
          : item.flavor_name
            ? foodserviceFlavors.find((flavor) => flavor.name === item.flavor_name)
            : null;
        lines[item.id] = {
          honeyType,
          flavorId: honeyType === "infused" ? (fixedFlavor?.id || allowed[0]?.id || "") : "",
        };
      });
      setFoodserviceConfig({ lines, recurring: false, cadence: "monthly", customIntervalDays: "30" });
    }

    if (packageBuilder(pkg) === "hive_sponsorship") {
      setHiveConfig({
        sponsorDisplayName: account?.public_name || account?.business_name || "",
        recognitionName: "",
        notes: "",
        annualRenewal: pkg.recurring_allowed === true,
      });
    }

    requestAnimationFrame(() => {
      document.getElementById("nf-package-builder")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  const retailOptions = useMemo(() => {
    if (!selectedPackage || packageBuilder(selectedPackage) !== "retail_shelf") return [];
    return retailCatalog.filter((row) =>
      (!selectedPackage.allowed_size_ids?.length || selectedPackage.allowed_size_ids.includes(row.size_id)) &&
      (!selectedPackage.allowed_textures?.length || selectedPackage.allowed_textures.includes(row.texture)) &&
      (!selectedPackage.allowed_flavor_names?.length || selectedPackage.allowed_flavor_names.includes(row.flavor_name))
    );
  }, [selectedPackage, retailCatalog]);

  const retailFlavors = uniqueBy(retailOptions, "flavor_id");
  const retailSizes = uniqueBy(retailOptions, "size_id");
  const retailTextures = uniqueBy(retailOptions.filter((row) => row.size_id === retailConfig.sizeId), "texture");

  const retailRequiredFlavors = Number(
    selectedPackage?.configuration_schema?.flavor_selection_count ||
    selectedPackage?.flavor_selection_count ||
    0
  );
  const retailQtyPerFlavor = Number(selectedPackage?.configuration_schema?.quantity_per_flavor || 6);
  const retailFixed = (selectedPackage?.configuration_schema?.fixed_flavors || []).length > 0;

  const retailPrice = retailConfig.flavorIds.reduce((sum, flavorId) => {
    const row = retailOptions.find(
      (item) => item.flavor_id === flavorId && item.size_id === retailConfig.sizeId && item.texture === retailConfig.texture
    );
    return sum + Number(row?.unit_price_cents || 0) * retailQtyPerFlavor;
  }, 0);

  const toggleRetailFlavor = (flavorId) => {
    if (retailFixed) return;
    setRetailConfig((current) => {
      if (current.flavorIds.includes(flavorId)) {
        return { ...current, flavorIds: current.flavorIds.filter((id) => id !== flavorId) };
      }
      if (current.flavorIds.length >= retailRequiredFlavors) return current;
      return { ...current, flavorIds: [...current.flavorIds, flavorId] };
    });
  };

  const addRetailPackage = () => {
    if (!selectedPackage) return;
    if (retailConfig.flavorIds.length !== retailRequiredFlavors) {
      setError(`Choose exactly ${retailRequiredFlavors} flavors for ${selectedPackage.name}.`);
      return;
    }

    const rows = retailConfig.flavorIds.map((flavorId) =>
      retailOptions.find(
        (row) => row.flavor_id === flavorId && row.size_id === retailConfig.sizeId && row.texture === retailConfig.texture
      )
    );
    if (rows.some((row) => !row)) {
      setError("One of the selected package combinations is no longer available.");
      return;
    }

    const configuration = {
      builder: "retail_shelf",
      size_id: retailConfig.sizeId,
      texture: retailConfig.texture,
      flavor_ids: retailConfig.flavorIds,
      flavor_names: rows.map((row) => row.flavor_name),
      quantity_per_flavor: retailQtyPerFlavor,
    };

    setPartnerStoreCart(
      rows.map((row) => ({
        id: `package:${selectedPackage.id}:retail:${row.flavor_id}:${row.size_id}:${row.texture}`,
        category: "retail",
        flavorId: row.flavor_id,
        flavorName: row.flavor_name,
        sizeId: row.size_id,
        sizeLabel: row.size_label,
        texture: row.texture,
        quantity: retailQtyPerFlavor,
        unitPriceCents: row.unit_price_cents,
        packageId: selectedPackage.id,
        packageKey: selectedPackage.package_key,
        packageName: selectedPackage.name,
        programKey: selectedPackage.program_key,
        packageConfiguration: configuration,
      }))
    );
    setError("");
    window.dispatchEvent(new Event("nf-open-partner-cart"));
  };

  const giftUnitPrice =
    giftConfig.containerType === "hex"
      ? Number(giftPricing?.hex_price_cents || 300)
      : Number(giftPricing?.bear_price_cents || 250);
  const giftQty = Number(selectedPackage?.default_quantity || selectedPackage?.configuration_schema?.gift_quantity || 0);
  const giftAddonUnit = Number(giftPricing?.addon_unit_price_cents || 50);
  const selectedAddonCount = [giftConfig.dipper, giftConfig.thankYouTag, giftConfig.beeCharm].filter(Boolean).length;
  const giftPrice = giftQty * giftUnitPrice + giftQty * giftAddonUnit * selectedAddonCount + (giftConfig.customLabel ? Number(giftPricing?.custom_label_flat_cents || 3000) : 0);

  const addGiftPackage = () => {
    if (!selectedPackage || !giftConfig.flavorId) {
      setError("Choose a flavor for this business gifting package.");
      return;
    }
    const flavor = giftFlavors.find((item) => item.id === giftConfig.flavorId);
    if (!flavor) {
      setError("The selected flavor is no longer available.");
      return;
    }

    const configuration = {
      builder: "business_gifting",
      quantity: giftQty,
      container_type: giftConfig.containerType,
      flavor_id: flavor.id,
      flavor_name: flavor.name,
      custom_label: giftConfig.customLabel,
      addons: {
        dipper: giftConfig.dipper,
        thank_you_tag: giftConfig.thankYouTag,
        bee_charm: giftConfig.beeCharm,
      },
      recurring: giftConfig.recurring,
      cadence: giftConfig.recurring ? giftConfig.cadence : null,
      custom_interval_days:
        giftConfig.recurring && giftConfig.cadence === "custom"
          ? Number(giftConfig.customIntervalDays || 30)
          : null,
    };

    const items = [
      {
        id: `package:${selectedPackage.id}:gift:${giftConfig.containerType}:${flavor.id}`,
        category: "gift",
        containerType: giftConfig.containerType,
        containerLabel: giftConfig.containerType === "hex" ? "2 oz Glass Hexagon" : "2 oz Plastic Bear",
        flavorId: flavor.id,
        flavorName: flavor.name,
        lidColor: giftConfig.lidColor,
        quantity: giftQty,
        unitPriceCents: giftUnitPrice,
        packageId: selectedPackage.id,
        packageKey: selectedPackage.package_key,
        packageName: selectedPackage.name,
        programKey: selectedPackage.program_key,
        packageConfiguration: configuration,
      },
    ];

    [
      ["dipper", giftConfig.dipper, "Wood honey dipper"],
      ["thank_you_tag", giftConfig.thankYouTag, "Thank You tag"],
      ["bee_charm", giftConfig.beeCharm, "Bee charm"],
    ].forEach(([addonType, enabled, name]) => {
      if (!enabled) return;
      items.push({
        id: `package:${selectedPackage.id}:gift_addon:${addonType}`,
        category: "gift_addon",
        addonType,
        name,
        containerType: giftConfig.containerType,
        quantity: giftQty,
        unitPriceCents: giftAddonUnit,
        packageId: selectedPackage.id,
        packageKey: selectedPackage.package_key,
        packageName: selectedPackage.name,
        programKey: selectedPackage.program_key,
        packageConfiguration: configuration,
      });
    });

    if (giftConfig.customLabel) {
      items.push({
        id: `package:${selectedPackage.id}:custom_label`,
        category: "custom_label",
        name: "Custom design + printing & labeling",
        notes: giftConfig.customLabelNotes || "Custom label requested from package checkout.",
        labelExamples: [],
        quantity: 1,
        unitPriceCents: Number(giftPricing?.custom_label_flat_cents || 3000),
        packageId: selectedPackage.id,
        packageKey: selectedPackage.package_key,
        packageName: selectedPackage.name,
        programKey: selectedPackage.program_key,
        packageConfiguration: configuration,
      });
    }

    setPartnerStoreCart(items);
    setError("");
    window.dispatchEvent(new Event("nf-open-partner-cart"));
  };

  const foodserviceItems = useMemo(() => {
    if (!selectedPackage || packageBuilder(selectedPackage) !== "foodservice") return [];
    return [...(selectedPackage.items || [])]
      .filter((item) => item.category === "bulk")
      .sort((a, b) => Number(a.sort || 0) - Number(b.sort || 0));
  }, [selectedPackage]);

  const foodserviceAllowedFlavors = useMemo(() => {
    if (!selectedPackage) return [];
    return foodserviceFlavors.filter((flavor) =>
      !selectedPackage.allowed_flavor_names?.length || selectedPackage.allowed_flavor_names.includes(flavor.name)
    );
  }, [selectedPackage, foodserviceFlavors]);

  const foodserviceUnitPrice = (item, honeyType) => {
    if (item?.unit_price_cents != null && Number.isFinite(Number(item.unit_price_cents))) {
      return Number(item.unit_price_cents);
    }
    return Number(foodservicePricing?.[item?.size_id]?.[honeyType] || 0);
  };

  const foodservicePrice = foodserviceItems.reduce((sum, item) => {
    const line = foodserviceConfig.lines[item.id] || {};
    const honeyRule = String(itemRule(item, "honey_type", "choice") || "choice");
    const honeyType = ["natural", "infused"].includes(honeyRule) ? honeyRule : (line.honeyType || "infused");
    return sum + foodserviceUnitPrice(item, honeyType) * Number(item.quantity || 1);
  }, 0);

  const updateFoodserviceLine = (itemId, patch) => {
    setFoodserviceConfig((current) => ({
      ...current,
      lines: {
        ...current.lines,
        [itemId]: { ...(current.lines[itemId] || {}), ...patch },
      },
    }));
  };

  const addFoodservicePackage = () => {
    if (!selectedPackage || !foodserviceItems.length) {
      setError("This Foodservice package does not have package contents yet. NectarFusions can finish it in Admin → Partner Commerce → Packages.");
      return;
    }

    const configured = foodserviceItems.map((item) => {
      const line = foodserviceConfig.lines[item.id] || {};
      const honeyRule = String(itemRule(item, "honey_type", "choice") || "choice");
      const honeyType = ["natural", "infused"].includes(honeyRule) ? honeyRule : (line.honeyType || "infused");
      const fixedFlavor = item.flavor_id
        ? foodserviceFlavors.find((flavor) => flavor.id === item.flavor_id)
        : item.flavor_name
          ? foodserviceFlavors.find((flavor) => flavor.name === item.flavor_name)
          : null;
      const flavor = honeyType === "infused"
        ? fixedFlavor || foodserviceAllowedFlavors.find((row) => row.id === line.flavorId)
        : null;
      return { item, honeyType, flavor };
    });

    if (configured.some((line) => line.honeyType === "infused" && !line.flavor)) {
      setError("Choose a flavor for every infused Foodservice line in this package.");
      return;
    }

    const uniqueRequired = selectedPackage.configuration_schema?.unique_flavors !== false && Number(selectedPackage.flavor_selection_count || 0) > 1;
    const selectedFlavorIds = configured.filter((line) => line.flavor).map((line) => line.flavor.id);
    if (uniqueRequired && new Set(selectedFlavorIds).size !== selectedFlavorIds.length) {
      setError("Choose different flavors for each Foodservice flavor selection in this package.");
      return;
    }

    const configuration = {
      builder: "foodservice",
      lines: configured.map(({ item, honeyType, flavor }) => ({
        package_item_id: item.id,
        product_key: item.product_key,
        size_id: item.size_id,
        quantity: Number(item.quantity || 1),
        honey_type: honeyType,
        flavor_id: flavor?.id || null,
        flavor_name: flavor?.name || null,
      })),
      recurring: foodserviceConfig.recurring === true,
      cadence: foodserviceConfig.recurring ? foodserviceConfig.cadence : null,
      custom_interval_days:
        foodserviceConfig.recurring && foodserviceConfig.cadence === "custom"
          ? Number(foodserviceConfig.customIntervalDays || 30)
          : null,
    };

    setPartnerStoreCart(configured.map(({ item, honeyType, flavor }) => ({
      id: `package:${selectedPackage.id}:foodservice:${item.id}`,
      category: "bulk",
      honeyType,
      flavorId: flavor?.id || null,
      flavorName: flavor?.name || null,
      sizeId: item.size_id,
      sizeLabel: itemRule(item, "label", FOODSERVICE_SIZE_LABELS[item.size_id] || item.size_id || "Foodservice"),
      quantity: Number(item.quantity || 1),
      unitPriceCents: foodserviceUnitPrice(item, honeyType),
      packageItemId: item.id,
      packageProductKey: item.product_key,
      packageId: selectedPackage.id,
      packageKey: selectedPackage.package_key,
      packageName: selectedPackage.name,
      programKey: selectedPackage.program_key,
      packageConfiguration: configuration,
    })));
    setError("");
    window.dispatchEvent(new Event("nf-open-partner-cart"));
  };

  const hiveItems = useMemo(() => {
    if (!selectedPackage || packageBuilder(selectedPackage) !== "hive_sponsorship") return [];
    return [...(selectedPackage.items || [])]
      .filter((item) => item.category === "sponsorship")
      .sort((a, b) => Number(a.sort || 0) - Number(b.sort || 0));
  }, [selectedPackage]);

  const hivePrice = useMemo(() => {
    if (!selectedPackage || packageBuilder(selectedPackage) !== "hive_sponsorship") return 0;
    if (selectedPackage.price_mode === "fixed" && selectedPackage.base_price_cents != null) {
      return Number(selectedPackage.base_price_cents || 0);
    }
    return hiveItems.reduce((sum, item) => sum + Number(item.unit_price_cents || 0) * Number(item.quantity || 1), 0);
  }, [selectedPackage, hiveItems]);

  const hiveBenefits = useMemo(() => {
    const values = [];
    const add = (value) => {
      if (Array.isArray(value)) value.forEach(add);
      else if (String(value || "").trim()) values.push(String(value).trim());
    };
    add(selectedPackage?.configuration_schema?.benefits);
    hiveItems.forEach((item) => add(itemRule(item, "benefits", [])));
    return [...new Set(values)];
  }, [selectedPackage, hiveItems]);

  const addHivePackage = () => {
    if (!selectedPackage) return;
    if (!hivePrice || hivePrice < 1) {
      setError("This Hive Partner package still needs an annual price in Admin before it can be purchased.");
      return;
    }

    const configuration = {
      builder: "hive_sponsorship",
      sponsor_display_name: hiveConfig.sponsorDisplayName.trim(),
      recognition_name: hiveConfig.recognitionName.trim() || null,
      notes: hiveConfig.notes.trim() || null,
      recurring: hiveConfig.annualRenewal === true,
      cadence: hiveConfig.annualRenewal === true ? "annual" : null,
    };

    setPartnerStoreCart([{
      id: `package:${selectedPackage.id}:sponsorship`,
      category: "sponsorship",
      name: selectedPackage.name,
      productKey: selectedPackage.package_key,
      quantity: 1,
      unitPriceCents: hivePrice,
      sponsorDisplayName: configuration.sponsor_display_name,
      recognitionName: configuration.recognition_name,
      notes: configuration.notes,
      packageId: selectedPackage.id,
      packageKey: selectedPackage.package_key,
      packageName: selectedPackage.name,
      programKey: selectedPackage.program_key,
      packageConfiguration: configuration,
    }]);
    setError("");
    window.dispatchEvent(new Event("nf-open-partner-cart"));
  };

  const modifyOrder = (order) => {
    const pkg = packages.find((row) => row.id === order.package_id);
    if (!pkg) {
      setError("That original package is no longer active. Choose a current package instead.");
      setSection("packages");
      return;
    }

    const requested = order.configuration_snapshot?.requested || {};
    setActiveProgram(pkg.program_key);
    setSection("packages");
    selectPackage(pkg);

    if (packageBuilder(pkg) === "retail_shelf") {
      setRetailConfig({
        sizeId: requested.size_id || order.items?.find((item) => item.category === "retail")?.size_id || "",
        texture: requested.texture || order.items?.find((item) => item.category === "retail")?.texture || "regular",
        flavorIds:
          requested.flavor_ids ||
          order.items?.filter((item) => item.category === "retail").map((item) => item.flavor_id).filter(Boolean) ||
          [],
      });
    }

    if (packageBuilder(pkg) === "business_gifting") {
      setGiftConfig((current) => ({
        ...current,
        containerType: requested.container_type || current.containerType,
        flavorId: requested.flavor_id || current.flavorId,
        customLabel: requested.custom_label === true,
        dipper: requested.addons?.dipper === true,
        thankYouTag: requested.addons?.thank_you_tag === true,
        beeCharm: requested.addons?.bee_charm === true,
        recurring: requested.recurring === true,
        cadence: requested.cadence || "monthly",
        customIntervalDays: String(requested.custom_interval_days || 30),
      }));
    }
    if (packageBuilder(pkg) === "foodservice") {
      const lineMap = Object.fromEntries((requested.lines || []).map((line) => [line.package_item_id, { honeyType: line.honey_type || "infused", flavorId: line.flavor_id || "" }]));
      setFoodserviceConfig({
        lines: lineMap,
        recurring: requested.recurring === true,
        cadence: requested.cadence || "monthly",
        customIntervalDays: String(requested.custom_interval_days || 30),
      });
    }
    if (packageBuilder(pkg) === "hive_sponsorship") {
      setHiveConfig({
        sponsorDisplayName: requested.sponsor_display_name || account?.public_name || account?.business_name || "",
        recognitionName: requested.recognition_name || "",
        notes: requested.notes || "",
      });
    }
  };

  const reorder = (order) => {
    if (!order?.items?.length) return;
    const snapshot = order.configuration_snapshot || {};
    const requestedConfiguration =
      snapshot?.requested && typeof snapshot.requested === "object"
        ? snapshot.requested
        : snapshot;
    const packageMeta = {
      packageId: order.package_id || order.package_snapshot?.id || null,
      packageKey: order.package_snapshot?.package_key || null,
      packageName: order.package_snapshot?.name || "Previous order",
      programKey: order.program_key || order.package_snapshot?.program_key || null,
      packageConfiguration: requestedConfiguration,
      reorderOfOrderId: order.id,
    };

    const items = order.items.map((item) => {
      const common = {
        id: `reorder:${order.id}:${item.id}`,
        category: item.category,
        quantity: Number(item.quantity || 0),
        unitPriceCents: Number(item.unit_price_cents || 0),
        ...packageMeta,
      };
      if (item.category === "retail") return {
        ...common,
        flavorId: item.flavor_id,
        flavorName: item.flavor_name,
        sizeId: item.size_id,
        sizeLabel: item.size_label,
        texture: item.texture,
      };
      if (item.category === "bulk") return {
        ...common,
        honeyType: item.details?.honey_type,
        flavorId: item.flavor_id,
        flavorName: item.flavor_name,
        sizeId: item.size_id,
        sizeLabel: item.size_label,
        packageItemId: item.details?.package_item_id || null,
        packageProductKey: item.details?.package_product_key || null,
      };
      if (item.category === "gift") return {
        ...common,
        containerType: item.details?.container_type || item.product_key,
        containerLabel: item.details?.container_label || item.size_label,
        flavorId: item.flavor_id,
        flavorName: item.flavor_name,
        lidColor: item.details?.lid_color || "",
      };
      if (item.category === "gift_addon") return {
        ...common,
        addonType: item.product_key,
        name: item.size_label,
        containerType: item.details?.container_type || null,
      };
      if (item.category === "sponsorship") return {
        ...common,
        name: item.size_label || order.package_snapshot?.name || "Hive Partner sponsorship",
        productKey: item.product_key,
        sponsorDisplayName: item.details?.sponsor_display_name || "",
        recognitionName: item.details?.recognition_name || "",
        notes: item.details?.notes || "",
      };
      return {
        ...common,
        name: item.size_label || "Custom Labels",
        notes: item.details?.notes || "",
        labelExamples: item.details?.label_examples || [],
      };
    });

    setPartnerStoreCart(items);
    setPartnerStoreFulfillment(order.fulfillment_method || "pickup");
    window.dispatchEvent(new Event("nf-open-partner-cart"));
  };

  const manageRecurring = async (item, action) => {
    setBusy(`recurring:${item.id}:${action}`);
    setError("");
    setNotice("");
    try {
      await api.manageMyPartnerRecurringOrder(item.id, action);
      setNotice(
        action === "skip"
          ? (item.program_key === "hive_partners" ? "This renewal cycle was skipped." : "The next recurring order was skipped.")
          : action === "pause"
            ? "Recurring ordering paused."
            : "Recurring ordering resumed."
      );
      await refresh();
    } catch (recurringError) {
      setError(recurringError?.message || "The recurring order could not be updated.");
    } finally {
      setBusy("");
    }
  };

  const editRecurring = (item) => {
    const pkg = packages.find((row) => row.id === item.package_id);
    if (!pkg) {
      setError("That package is no longer active. NectarFusions can update this recurring order for you.");
      return;
    }

    const requested = item.configuration_snapshot?.requested || {};
    setActiveProgram(item.program_key);
    setSection("packages");
    selectPackage(pkg);

    if (packageBuilder(pkg) === "business_gifting") {
      setGiftConfig((current) => ({
        ...current,
        containerType: requested.container_type || current.containerType,
        flavorId: requested.flavor_id || current.flavorId,
        customLabel: requested.custom_label === true,
        dipper: requested.addons?.dipper === true,
        thankYouTag: requested.addons?.thank_you_tag === true,
        beeCharm: requested.addons?.bee_charm === true,
        recurring: true,
        cadence: requested.cadence || "monthly",
        customIntervalDays: String(requested.custom_interval_days || 30),
      }));
    }
    if (packageBuilder(pkg) === "foodservice") {
      setFoodserviceConfig({
        lines: Object.fromEntries((requested.lines || []).map((line) => [line.package_item_id, { honeyType: line.honey_type || "infused", flavorId: line.flavor_id || "" }])),
        recurring: true,
        cadence: requested.cadence || "monthly",
        customIntervalDays: String(requested.custom_interval_days || 30),
      });
    }
    if (packageBuilder(pkg) === "hive_sponsorship") {
      setHiveConfig({
        sponsorDisplayName: requested.sponsor_display_name || account?.public_name || account?.business_name || "",
        recognitionName: requested.recognition_name || "",
        notes: requested.notes || "",
        annualRenewal: true,
      });
    }
  };

  const saveProfile = async () => {
    setBusy("profile");
    setError("");
    setNotice("");
    try {
      await api.updateMyPartnerFulfillmentProfile(profile);
      setPartnerStoreFulfillment(profile.preferredFulfillment);
      window.dispatchEvent(
        new CustomEvent("nf-partner-delivery-profile-changed", {
          detail: profile,
        })
      );
      setNotice("Delivery and pickup preferences saved.");
    } catch (saveError) {
      setError(saveError?.message || "The fulfillment profile could not be saved.");
    } finally {
      setBusy("");
    }
  };

  const renderRetailBuilder = () => (
    <div className="nf-commerce-builder" id="nf-package-builder">
      <div className="nf-commerce-builder-head">
        <div>
          <div className="nf-commerce-kicker">Configure package</div>
          <h3>{selectedPackage.name}</h3>
          <p>{selectedPackage.description}</p>
        </div>
        <button className="nf-commerce-btn" type="button" onClick={() => setSelectedPackage(null)}>Close</button>
      </div>

      <div className="nf-commerce-field-grid">
        <div className="nf-commerce-field">
          <label>Jar size</label>
          <select value={retailConfig.sizeId} onChange={(event) => setRetailConfig((current) => ({ ...current, sizeId: event.target.value }))}>
            {retailSizes.map((row) => <option key={row.size_id} value={row.size_id}>{row.size_label}</option>)}
          </select>
        </div>
        <div className="nf-commerce-field">
          <label>Texture</label>
          <select value={retailConfig.texture} onChange={(event) => setRetailConfig((current) => ({ ...current, texture: event.target.value }))}>
            {retailTextures.length ? retailTextures.map((row) => <option key={row.texture} value={row.texture}>{row.texture === "spun" ? "Spun" : "Regular"}</option>) : <option value="regular">Regular</option>}
          </select>
        </div>
      </div>

      <div>
        <div className="nf-commerce-choice-label">
          {retailFixed ? "Included core flavors" : `Choose ${retailRequiredFlavors} flavors`} · {retailQtyPerFlavor} jars each
        </div>
        <div className="nf-commerce-choice-grid" style={{ marginTop: 8 }}>
          {retailFlavors.map((row) => (
            <button
              type="button"
              className="nf-commerce-choice"
              key={row.flavor_id}
              aria-pressed={retailConfig.flavorIds.includes(row.flavor_id)}
              disabled={retailFixed}
              onClick={() => toggleRetailFlavor(row.flavor_id)}
            >
              {row.flavor_name}
            </button>
          ))}
        </div>
      </div>

      <div className="nf-commerce-builder-total">
        <div>
          <span>{selectedPackage.default_quantity} jars · current partner pricing</span>
          <strong>{money(retailPrice)}</strong>
        </div>
        <button className="nf-commerce-btn primary" type="button" onClick={addRetailPackage}>Continue to Fulfillment & Payment</button>
      </div>
    </div>
  );

  const renderGiftBuilder = () => (
    <div className="nf-commerce-builder" id="nf-package-builder">
      <div className="nf-commerce-builder-head">
        <div>
          <div className="nf-commerce-kicker">Configure business gifting</div>
          <h3>{selectedPackage.name}</h3>
          <p>{giftQty} ready-to-gift NectarFusions products.</p>
        </div>
        <button className="nf-commerce-btn" type="button" onClick={() => setSelectedPackage(null)}>Close</button>
      </div>

      <div className="nf-commerce-field-grid">
        <div className="nf-commerce-field">
          <label>Container</label>
          <select value={giftConfig.containerType} onChange={(event) => setGiftConfig((current) => ({ ...current, containerType: event.target.value }))}>
            <option value="bear">2 oz Plastic Bear</option>
            <option value="hex">2 oz Glass Hexagon</option>
          </select>
        </div>
        <div className="nf-commerce-field">
          <label>Flavor</label>
          <select value={giftConfig.flavorId} onChange={(event) => setGiftConfig((current) => ({ ...current, flavorId: event.target.value }))}>
            {giftFlavors.filter((flavor) => !selectedPackage.allowed_flavor_names?.length || selectedPackage.allowed_flavor_names.includes(flavor.name)).map((flavor) => (
              <option key={flavor.id} value={flavor.id}>{flavor.name}</option>
            ))}
          </select>
        </div>
        {giftConfig.containerType === "bear" && (
          <div className="nf-commerce-field">
            <label>Lid color</label>
            <input value={giftConfig.lidColor} onChange={(event) => setGiftConfig((current) => ({ ...current, lidColor: event.target.value }))} placeholder="Optional color request" />
          </div>
        )}
        <div className="nf-commerce-field full">
          <label>Finishing options</label>
          <div className="nf-commerce-choice-grid">
            {[
              ["dipper", "Honey dipper"],
              ["thankYouTag", "Thank You tag"],
              ["beeCharm", "Bee charm"],
              ["customLabel", "Custom label"],
            ].map(([key, label]) => (
              <button type="button" className="nf-commerce-choice" key={key} aria-pressed={Boolean(giftConfig[key])} onClick={() => setGiftConfig((current) => ({ ...current, [key]: !current[key] }))}>{label}</button>
            ))}
          </div>
        </div>
        {giftConfig.customLabel && (
          <div className="nf-commerce-field full">
            <label>Custom label details</label>
            <textarea value={giftConfig.customLabelNotes} onChange={(event) => setGiftConfig((current) => ({ ...current, customLabelNotes: event.target.value }))} placeholder="Business name, event, date, wording, colors, or logo notes" />
          </div>
        )}
        <div className="nf-commerce-field full">
          <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input type="checkbox" checked={giftConfig.recurring} onChange={(event) => setGiftConfig((current) => ({ ...current, recurring: event.target.checked }))} />
            Make this a recurring business order
          </label>
        </div>
        {giftConfig.recurring && (
          <div className="nf-commerce-field">
            <label>Cadence</label>
            <select value={giftConfig.cadence} onChange={(event) => setGiftConfig((current) => ({ ...current, cadence: event.target.value }))}>
              <option value="monthly">Monthly</option>
              <option value="quarterly">Quarterly</option>
              <option value="custom">Custom interval</option>
            </select>
          </div>
        )}
        {giftConfig.recurring && giftConfig.cadence === "custom" && (
          <div className="nf-commerce-field">
            <label>Custom interval (days)</label>
            <input type="number" min="1" max="365" value={giftConfig.customIntervalDays} onChange={(event) => setGiftConfig((current) => ({ ...current, customIntervalDays: event.target.value }))} />
          </div>
        )}
      </div>

      <div className="nf-commerce-builder-total">
        <div>
          <span>{giftQty} gifts · current partner gifting pricing</span>
          <strong>{money(giftPrice)}</strong>
        </div>
        <button className="nf-commerce-btn primary" type="button" onClick={addGiftPackage}>Continue to Fulfillment & Payment</button>
      </div>
    </div>
  );

  const renderFoodserviceBuilder = () => (
    <div className="nf-commerce-builder" id="nf-package-builder">
      <div className="nf-commerce-builder-head">
        <div>
          <div className="nf-commerce-kicker">Configure Foodservice</div>
          <h3>{selectedPackage.name}</h3>
          <p>{selectedPackage.description}</p>
        </div>
        <button className="nf-commerce-btn" type="button" onClick={() => setSelectedPackage(null)}>Close</button>
      </div>

      {!foodserviceItems.length ? (
        <div className="nf-commerce-note">This package is active but has no Foodservice package contents yet. Add bulk package items in Admin → Partner Commerce → Packages before customers use it.</div>
      ) : (
        <div style={{ display: "grid", gap: 12 }}>
          {foodserviceItems.map((item, index) => {
            const line = foodserviceConfig.lines[item.id] || {};
            const honeyRule = String(itemRule(item, "honey_type", "choice") || "choice");
            const honeyType = ["natural", "infused"].includes(honeyRule) ? honeyRule : (line.honeyType || "infused");
            const fixedFlavor = item.flavor_id
              ? foodserviceFlavors.find((flavor) => flavor.id === item.flavor_id)
              : item.flavor_name
                ? foodserviceFlavors.find((flavor) => flavor.name === item.flavor_name)
                : null;
            const label = itemRule(item, "label", `Package item ${index + 1}`);
            return (
              <div className="nf-commerce-card soft" key={item.id}>
                <div>
                  <div className="nf-commerce-kicker">{label}</div>
                  <h4>{Number(item.quantity || 1)} × {FOODSERVICE_SIZE_LABELS[item.size_id] || item.size_id || "Foodservice format"}</h4>
                  <p>{itemRule(item, "description", "Choose the honey configuration for this preset package line.")}</p>
                </div>
                <div className="nf-commerce-field-grid">
                  <div className="nf-commerce-field">
                    <label>Honey</label>
                    {honeyRule === "choice" ? (
                      <select value={honeyType} onChange={(event) => updateFoodserviceLine(item.id, { honeyType: event.target.value, flavorId: event.target.value === "natural" ? "" : line.flavorId })}>
                        <option value="natural">Natural Raw Honey</option>
                        <option value="infused">Infused Honey</option>
                      </select>
                    ) : <input value={honeyType === "natural" ? "Natural Raw Honey" : "Infused Honey"} readOnly />}
                  </div>
                  {honeyType === "infused" && (
                    <div className="nf-commerce-field">
                      <label>Flavor</label>
                      {fixedFlavor ? <input value={fixedFlavor.name} readOnly /> : (
                        <select value={line.flavorId || ""} onChange={(event) => updateFoodserviceLine(item.id, { flavorId: event.target.value })}>
                          <option value="">Choose a flavor</option>
                          {foodserviceAllowedFlavors.map((flavor) => <option key={flavor.id} value={flavor.id}>{flavor.name}</option>)}
                        </select>
                      )}
                    </div>
                  )}
                </div>
                <div className="meta"><span>{money(foodserviceUnitPrice(item, honeyType))} each</span><span>{money(foodserviceUnitPrice(item, honeyType) * Number(item.quantity || 1))} line total</span></div>
              </div>
            );
          })}
        </div>
      )}

      {selectedPackage.recurring_allowed && (
        <div className="nf-commerce-field-grid">
          <label className="nf-commerce-field full" style={{ display: "flex", gridTemplateColumns: "auto 1fr", alignItems: "center", gap: 8 }}>
            <input type="checkbox" style={{ width: 18 }} checked={foodserviceConfig.recurring} onChange={(event) => setFoodserviceConfig((current) => ({ ...current, recurring: event.target.checked }))} />
            <span>Make this a recurring Foodservice order</span>
          </label>
          {foodserviceConfig.recurring && <div className="nf-commerce-field"><label>Cadence</label><select value={foodserviceConfig.cadence} onChange={(event) => setFoodserviceConfig((current) => ({ ...current, cadence: event.target.value }))}><option value="monthly">Monthly</option><option value="quarterly">Quarterly</option><option value="custom">Custom interval</option></select></div>}
          {foodserviceConfig.recurring && foodserviceConfig.cadence === "custom" && <div className="nf-commerce-field"><label>Custom interval (days)</label><input type="number" min="1" max="365" value={foodserviceConfig.customIntervalDays} onChange={(event) => setFoodserviceConfig((current) => ({ ...current, customIntervalDays: event.target.value }))} /></div>}
        </div>
      )}

      <div className="nf-commerce-builder-total">
        <div><span>Preset Foodservice package · current validated pricing</span><strong>{money(foodservicePrice)}</strong></div>
        <button className="nf-commerce-btn primary" type="button" disabled={!foodserviceItems.length} onClick={addFoodservicePackage}>Continue to Fulfillment & Payment</button>
      </div>
    </div>
  );

  const renderHiveBuilder = () => (
    <div className="nf-commerce-builder" id="nf-package-builder">
      <div className="nf-commerce-builder-head">
        <div>
          <div className="nf-commerce-kicker">Hive Partners</div>
          <h3>{selectedPackage.name}</h3>
          <p>{selectedPackage.description}</p>
        </div>
        <button className="nf-commerce-btn" type="button" onClick={() => setSelectedPackage(null)}>Close</button>
      </div>

      {hiveBenefits.length > 0 && (
        <div className="nf-commerce-card soft">
          <h4>Included with this partnership</h4>
          <div style={{ display: "grid", gap: 6 }}>
            {hiveBenefits.map((benefit) => <p key={benefit}>✓ {benefit}</p>)}
          </div>
        </div>
      )}

      <div className="nf-commerce-field-grid">
        <div className="nf-commerce-field"><label>Sponsor display name</label><input value={hiveConfig.sponsorDisplayName} onChange={(event) => setHiveConfig((current) => ({ ...current, sponsorDisplayName: event.target.value }))} placeholder="Business or organization name" /></div>
        <div className="nf-commerce-field"><label>Recognition name</label><input value={hiveConfig.recognitionName} onChange={(event) => setHiveConfig((current) => ({ ...current, recognitionName: event.target.value }))} placeholder="Optional public recognition name" /></div>
        <div className="nf-commerce-field full"><label>Notes</label><textarea value={hiveConfig.notes} onChange={(event) => setHiveConfig((current) => ({ ...current, notes: event.target.value }))} placeholder="Optional sponsorship, recognition, delivery, or coordination notes" /></div>
        {selectedPackage.recurring_allowed && <label className="nf-commerce-field full" style={{ display: "flex", gridTemplateColumns: "auto 1fr", alignItems: "center", gap: 8 }}><input type="checkbox" style={{ width: 18 }} checked={hiveConfig.annualRenewal} onChange={(event) => setHiveConfig((current) => ({ ...current, annualRenewal: event.target.checked }))} /><span>Renew this Hive Partnership annually</span></label>}
      </div>

      <div className="nf-commerce-builder-total">
        <div><span>{selectedPackage.recurring_allowed ? "Annual Hive Partner package" : "Hive Partner package"}</span><strong>{hivePrice ? money(hivePrice) : "Price pending"}</strong></div>
        <button className="nf-commerce-btn primary" type="button" disabled={!hivePrice} onClick={addHivePackage}>Continue to Payment</button>
      </div>
    </div>
  );

  if (loading) {
    return <div className="nf-commerce-empty">Loading your partner programs and packages…</div>;
  }

  return (
    <section className="nf-commerce">
      <style>{CSS}</style>
      <div className="nf-commerce-top">
        <div>
          <div className="nf-commerce-kicker">NectarFusions Partner Portal</div>
          <h2>Welcome, {account?.public_name || account?.business_name || "Partner"}</h2>
          <p>One account for every approved NectarFusions business program, package, paid order, fulfillment status, and reorder.</p>
          <div className="nf-commerce-program-chips">
            {programs.length ? programs.map((row) => (
              <span className="nf-commerce-chip" data-status={row.status} key={row.program_key}>
                {programName(row)} · {row.status}
              </span>
            )) : <span className="nf-commerce-chip" data-status="pending">No programs enabled yet</span>}
          </div>
        </div>
        <div className="nf-commerce-actions">
          <button className="nf-commerce-btn" type="button" onClick={() => window.dispatchEvent(new Event("nf-open-partner-cart"))}>Open Cart</button>
          <button className="nf-commerce-btn" type="button" onClick={onSignOut} disabled={signOutBusy}>{signOutBusy ? "Signing out…" : "Sign Out"}</button>
        </div>
      </div>

      <nav className="nf-commerce-nav" aria-label="Partner commerce sections">
        {[
          ["dashboard", "Dashboard"],
          ["packages", "Packages"],
          ["orders", "Orders"],
          ["recurring", "Recurring Orders"],
          ["delivery", "Delivery & Pickup"],
          ["account", "Account"],
        ].map(([id, label]) => (
          <button key={id} type="button" aria-current={section === id ? "page" : undefined} onClick={() => { setSection(id); setError(""); setNotice(""); }}>{label}</button>
        ))}
      </nav>

      {error && <div className="nf-commerce-message error" role="alert">{error}</div>}
      {notice && <div className="nf-commerce-message success" role="status">{notice}</div>}

      {section === "dashboard" && (
        <div className="nf-commerce-panel">
          <div className="nf-commerce-panel-head">
            <div>
              <div className="nf-commerce-kicker">Command center</div>
              <h3>Your Partner Dashboard</h3>
              <p>See your current programs, latest order, open fulfillment, and fastest path to reorder.</p>
            </div>
          </div>
          <div className="nf-commerce-dashboard-grid">
            <div className="nf-commerce-order-summary">
              <div className="nf-commerce-order-summary-head">
                <div>
                  <small>Last order</small>
                  <h4>{lastOrder?.order_no || "No paid partner orders yet"}</h4>
                </div>
                {lastOrder && <span className="nf-commerce-status" data-status={lastOrder.status}>{cleanStatus(lastOrder.status)}</span>}
              </div>
              {lastOrder ? (
                <>
                  <div className="nf-commerce-grid">
                    <div className="nf-commerce-stat"><span>Package</span><strong>{lastOrder.package_snapshot?.name || "Partner order"}</strong></div>
                    <div className="nf-commerce-stat"><span>Total</span><strong>{money(lastOrder.total_cents)}</strong></div>
                    <div className="nf-commerce-stat"><span>Date</span><strong>{dateLabel(lastOrder.created_at)}</strong></div>
                  </div>
                  <div className="nf-commerce-actions" style={{ justifyContent: "flex-start" }}>
                    <button className="nf-commerce-btn primary" type="button" onClick={() => reorder(lastOrder)}>REORDER LAST ORDER</button>
                    <button className="nf-commerce-btn" type="button" onClick={() => setSection("packages")}>SHOP PACKAGES</button>
                  </div>
                </>
              ) : (
                <button className="nf-commerce-btn primary" type="button" onClick={() => setSection("packages")}>SHOP PACKAGES</button>
              )}
            </div>
            <div className="nf-commerce-card soft">
              <div className="nf-commerce-stat"><span>Open order</span><strong>{openOrder?.order_no || "None"}</strong></div>
              <p>{openOrder ? cleanStatus(openOrder.status) : "Nothing is waiting on fulfillment right now."}</p>
              <div className="nf-commerce-stat"><span>Next expected reorder</span><strong>{lastFulfilled?.reorder_due_on ? dateLabel(lastFulfilled.reorder_due_on) : "Not scheduled"}</strong></div>
            </div>
          </div>
        </div>
      )}

      {section === "packages" && (
        <div className="nf-commerce-panel">
          <div className="nf-commerce-panel-head">
            <div>
              <div className="nf-commerce-kicker">Packages, not products</div>
              <h3>Choose Your Program Package</h3>
              <p>Only programs approved for this business appear here. Package rules come from the database, not hardcoded storefront pages.</p>
            </div>
          </div>

          {approvedPrograms.length ? (
            <div className="nf-commerce-program-tabs" role="tablist">
              {approvedPrograms.map((row) => (
                <button key={row.program_key} type="button" role="tab" aria-selected={activeProgram === row.program_key} onClick={() => { setActiveProgram(row.program_key); setSelectedPackage(null); }}>{programName(row)}</button>
              ))}
            </div>
          ) : null}

          {!approvedPrograms.length ? (
            <div className="nf-commerce-empty">No programs are approved for this account yet. NectarFusions can enable Retail, Foodservice, Business Gifting, and Hive Partners independently on this same account.</div>
          ) : packageRows.length ? (
            <div className="nf-commerce-grid">
              {packageRows.map((pkg) => (
                <article className="nf-commerce-package-card" key={pkg.id}>
                  <div className="body">
                    <div className="nf-commerce-kicker">{PROGRAM_LABELS[pkg.program_key] || pkg.program_key}</div>
                    <h4>{pkg.name}</h4>
                    <p>{pkg.description}</p>
                    <div className="meta">
                      {pkg.default_quantity ? <span>{pkg.default_quantity} {pkg.program_key === "retail" ? "jars" : pkg.program_key === "business_gifting" ? "gifts" : pkg.program_key === "foodservice" ? "package units" : pkg.program_key === "hive_partners" ? "annual partnership" : "units"}</span> : null}
                      {pkg.base_price_cents != null && pkg.price_mode === "fixed" ? <span>{money(pkg.base_price_cents)}</span> : null}
                      {pkg.flavor_selection_count ? <span>{pkg.flavor_selection_count} flavor{pkg.flavor_selection_count === 1 ? "" : "s"}</span> : null}
                      {pkg.program_key === "hive_partners" ? <span>Annual renewal</span> : pkg.default_reorder_interval_days ? <span>Reorder in {pkg.default_reorder_interval_days} days</span> : null}
                      {pkg.program_key === "hive_partners" ? <span>No physical fulfillment</span> : pkg.recurring_allowed ? <span>Recurring eligible</span> : null}
                    </div>
                  </div>
                  <div className="foot">
                    <button className="nf-commerce-btn primary" type="button" disabled={!packageBuilder(pkg)} onClick={() => selectPackage(pkg)}>
                      Choose Package
                    </button>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="nf-commerce-empty">There are no active packages in this program yet. The program stays on this account and packages can be activated by NectarFusions without another application.</div>
          )}

          {selectedPackage && packageBuilder(selectedPackage) === "retail_shelf" ? renderRetailBuilder() : null}
          {selectedPackage && packageBuilder(selectedPackage) === "business_gifting" ? renderGiftBuilder() : null}
          {selectedPackage && packageBuilder(selectedPackage) === "foodservice" ? renderFoodserviceBuilder() : null}
          {selectedPackage && packageBuilder(selectedPackage) === "hive_sponsorship" ? renderHiveBuilder() : null}
        </div>
      )}

      {section === "orders" && (
        <div className="nf-commerce-panel">
          <div className="nf-commerce-panel-head">
            <div>
              <div className="nf-commerce-kicker">Order history</div>
              <h3>Orders</h3>
              <p>Paid partner commerce lives here. Reorder clones the previous configuration, then checkout validates current availability and current pricing.</p>
            </div>
          </div>
          {orders.length ? (
            <div className="nf-commerce-orders">
              {orders.map((order) => (
                <article className="nf-commerce-order" key={order.id}>
                  <div><span>Order</span><strong>{order.order_no}</strong></div>
                  <div><span>Date</span><strong>{dateLabel(order.created_at)}</strong></div>
                  <div><span>Package</span><strong>{order.package_snapshot?.name || "Partner order"}</strong></div>
                  <div><span>Total</span><strong>{money(order.total_cents)}</strong></div>
                  <div><span>Payment</span><strong>{order.paid ? "Paid" : "Awaiting payment"}</strong></div>
                  <div><span>Fulfillment</span><strong>{order.fulfillment_method === "not_required" ? "Not required" : order.fulfillment_method === "delivery" ? "Local Delivery" : "Coleman Pickup"}</strong></div>
                  <div><span>Status</span><strong>{cleanStatus(order.status)}</strong></div>
                  <div className="order-actions" style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    <button className="nf-commerce-btn primary" type="button" disabled={order.status === "cancelled"} onClick={() => reorder(order)}>Reorder exactly</button>
                    <button className="nf-commerce-btn" type="button" disabled={!order.package_id} onClick={() => modifyOrder(order)}>Modify package</button>
                  </div>
                </article>
              ))}
            </div>
          ) : <div className="nf-commerce-empty">No partner orders yet.</div>}
        </div>
      )}

      {section === "recurring" && (
        <div className="nf-commerce-panel">
          <div className="nf-commerce-panel-head">
            <div><div className="nf-commerce-kicker">Repeat business</div><h3>Recurring & Renewals</h3><p>Foodservice and Business Gifting schedules appear here alongside annual Hive Partner renewal anniversaries.</p></div>
          </div>
          {recurring.length ? (
            <div className="nf-commerce-orders">
              {recurring.map((item) => (
                <article className="nf-commerce-order" key={item.id}>
                  <div><span>Package</span><strong>{item.package?.name || item.program?.label || "Recurring partner order"}</strong></div>
                  <div><span>Cadence</span><strong>{item.program_key === "hive_partners" ? "Annual sponsorship" : `Every ${item.cadence_value} ${item.cadence_unit}${item.cadence_value === 1 ? "" : "s"}`}</strong></div>
                  <div><span>{item.program_key === "hive_partners" ? "Renewal anniversary" : "Next order"}</span><strong>{dateLabel(item.next_order_on)}</strong></div>
                  <div><span>Status</span><strong>{cleanStatus(item.status)}</strong></div>
                  <div className="order-actions" style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    <button className="nf-commerce-btn" type="button" onClick={() => editRecurring(item)}>Edit</button>
                    <button className="nf-commerce-btn" type="button" disabled={!item.next_order_on || Boolean(busy)} onClick={() => manageRecurring(item, "skip")}>{item.program_key === "hive_partners" ? "Skip this renewal" : "Skip"}</button>
                    <button className="nf-commerce-btn" type="button" disabled={Boolean(busy)} onClick={() => manageRecurring(item, item.status === "paused" ? "resume" : "pause")}>{item.status === "paused" ? "Resume" : "Pause"}</button>
                  </div>
                </article>
              ))}
            </div>
          ) : <div className="nf-commerce-empty">No recurring partner orders are active yet. Eligible Business Gifting, Foodservice, and annual Hive Partner renewals can use this area.</div>}
        </div>
      )}

      {section === "delivery" && (
        <div className="nf-commerce-panel">
          <div className="nf-commerce-panel-head"><div><div className="nf-commerce-kicker">Saved fulfillment profile</div><h3>Delivery & Pickup</h3><p>Your selection persists into package checkout. Local delivery fees remain ZIP based.</p></div></div>
          <div className="nf-commerce-field-grid">
            <div className="nf-commerce-field"><label>Preferred fulfillment</label><select value={profile.preferredFulfillment} onChange={(event) => setProfile((current) => ({ ...current, preferredFulfillment: event.target.value }))}><option value="pickup">Coleman Pickup</option><option value="delivery">Local Delivery</option></select></div>
            <div className="nf-commerce-field"><label>Preferred contact</label><select value={profile.preferredContactMethod} onChange={(event) => setProfile((current) => ({ ...current, preferredContactMethod: event.target.value }))}><option value="text">Text</option><option value="call">Call</option><option value="email">Email</option></select></div>
            <div className="nf-commerce-field"><label>Business / location name</label><input value={profile.businessName} onChange={(event) => setProfile((current) => ({ ...current, businessName: event.target.value }))} /></div>
            <div className="nf-commerce-field"><label>Phone</label><input value={profile.phone} onChange={(event) => setProfile((current) => ({ ...current, phone: event.target.value }))} /></div>
            <div className="nf-commerce-field full"><label>Street address</label><input value={profile.addressLine1} onChange={(event) => setProfile((current) => ({ ...current, addressLine1: event.target.value }))} /></div>
            <div className="nf-commerce-field full"><label>Address line 2</label><input value={profile.addressLine2} onChange={(event) => setProfile((current) => ({ ...current, addressLine2: event.target.value }))} /></div>
            <div className="nf-commerce-field"><label>City</label><input value={profile.city} onChange={(event) => setProfile((current) => ({ ...current, city: event.target.value }))} /></div>
            <div className="nf-commerce-field"><label>State</label><input maxLength={2} value={profile.state} onChange={(event) => setProfile((current) => ({ ...current, state: event.target.value.toUpperCase() }))} /></div>
            <div className="nf-commerce-field"><label>ZIP</label><input maxLength={5} value={profile.zip} onChange={(event) => setProfile((current) => ({ ...current, zip: event.target.value.replace(/\D/g, "").slice(0, 5) }))} /></div>
            <div className="nf-commerce-field"><label>Building information</label><input value={profile.buildingDetails} onChange={(event) => setProfile((current) => ({ ...current, buildingDetails: event.target.value }))} /></div>
            <div className="nf-commerce-field"><label>Gate / access code</label><input value={profile.gateAccessCode} onChange={(event) => setProfile((current) => ({ ...current, gateAccessCode: event.target.value }))} /></div>
            <div className="nf-commerce-field full"><label>Delivery notes</label><textarea value={profile.deliveryNotes} onChange={(event) => setProfile((current) => ({ ...current, deliveryNotes: event.target.value }))} /></div>
          </div>
          <div className="nf-commerce-form-actions"><button className="nf-commerce-btn primary" type="button" disabled={busy === "profile"} onClick={saveProfile}>{busy === "profile" ? "Saving…" : "Save Fulfillment Profile"}</button></div>
        </div>
      )}

      {section === "account" && (
        <div className="nf-commerce-panel">
          <div className="nf-commerce-panel-head"><div><div className="nf-commerce-kicker">One business account</div><h3>Account</h3><p>A business can participate in several NectarFusions programs without creating duplicate accounts.</p></div></div>
          <div className="nf-commerce-account-grid">
            <div className="nf-commerce-card soft">
              <h4>Business information</h4>
              <p><strong>{account?.business_name}</strong></p>
              <p>{account?.contact_name || "No contact name saved"}</p>
              <p>{account?.email}</p>
              <p>{account?.phone || "No phone saved"}</p>
              <p>Relationship: {cleanStatus(account?.relationship_status)}</p>
            </div>
            <div className="nf-commerce-card soft">
              <h4>Programs</h4>
              {programs.length ? programs.map((row) => (
                <div className="nf-commerce-program-row" key={row.program_key}><strong>{programName(row)}</strong><span>{row.status}</span></div>
              )) : <p>No programs have been assigned yet.</p>}
            </div>
            <div className="nf-commerce-card soft">
              <h4>Sign-in & security</h4>
              <p>Use your approved email and password to sign in. Secure email links remain available as a backup.</p>
              <button
                className="nf-commerce-btn"
                type="button"
                onClick={onManagePassword}
              >
                Create or Change Password
              </button>
            </div>
          </div>
          <div className="nf-commerce-note" style={{ marginTop: 14 }}>Program access is approved independently by NectarFusions. Retail, Foodservice, Business Gifting, and Hive Partners can all live on this same account.</div>
        </div>
      )}

      <PartnerCartDrawer account={account} />
    </section>
  );
}
