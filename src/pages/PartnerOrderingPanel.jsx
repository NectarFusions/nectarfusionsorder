import { useEffect, useState } from "react";
import * as api from "../lib/api";
import PartnerReplenishmentPanel from "./PartnerReplenishmentPanel";
import PartnerBulkOrderPanel from "./PartnerBulkOrderPanel";

const CSS = `
.nf-ordering-switch{display:flex;gap:9px;flex-wrap:wrap;margin:22px 0 0;padding:8px;border:1px solid #D8C9B8;border-radius:16px;background:#FBF7F1}
.nf-ordering-switch button{flex:1 1 220px;min-height:44px;padding:10px 14px;border:1px solid transparent;border-radius:11px;background:transparent;color:#67594D;font:inherit;font-size:12px;font-weight:900;cursor:pointer}
.nf-ordering-switch button[aria-selected="true"]{background:#173C52;color:#fff;box-shadow:0 5px 14px rgba(23,60,82,.16)}
`;

export default function PartnerOrderingPanel() {
  const [bulkEnabled, setBulkEnabled] = useState(false);
  const [tab, setTab] = useState("retail");

  useEffect(() => {
    let active = true;
    api
      .getPartnerBulkOrderCatalog()
      .then((config) => {
        if (active) setBulkEnabled(config.enabled === true && config.eligible === true);
      })
      .catch(() => {
        if (active) setBulkEnabled(false);
      });
    return () => {
      active = false;
    };
  }, []);

  if (!bulkEnabled) return <PartnerReplenishmentPanel />;

  return (
    <>
      <style>{CSS}</style>
      <div className="nf-ordering-switch" role="tablist" aria-label="Partner ordering type">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "retail"}
          onClick={() => setTab("retail")}
        >
          Retail Replenishment
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "bulk"}
          onClick={() => setTab("bulk")}
        >
          Foodservice & Bulk Honey
        </button>
      </div>
      {tab === "retail" ? <PartnerReplenishmentPanel /> : <PartnerBulkOrderPanel />}
    </>
  );
}
