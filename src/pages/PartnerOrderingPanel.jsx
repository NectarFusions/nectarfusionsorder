import { useEffect, useMemo, useState } from "react";
import PartnerReplenishmentPanel from "./PartnerReplenishmentPanel";
import PartnerBulkOrderPanel from "./PartnerBulkOrderPanel";
import PartnerGiftRequestPanel from "./PartnerGiftRequestPanel";

const CSS = `
.nf-ordering-switch {
  display:grid;
  grid-template-columns:repeat(auto-fit,minmax(180px,1fr));
  gap:8px;
  margin:22px 0 0;
  padding:7px;
  border:1px solid #D8E4EA;
  border-radius:16px;
  background:#F7FBFD;
}
.nf-ordering-switch button {
  min-height:48px;
  padding:10px 14px;
  border:1px solid transparent;
  border-radius:11px;
  background:transparent;
  color:#496575;
  font:inherit;
  font-size:14px;
  font-weight:900;
  cursor:pointer;
}
.nf-ordering-switch button[aria-selected="true"] {
  background:#173C52;
  color:#FFFFFF;
  box-shadow:0 5px 14px rgba(23,60,82,.14);
}
@media (max-width:760px) {
  .nf-ordering-switch {
    grid-template-columns:1fr;
  }
}
`;

export default function PartnerOrderingPanel({ account }) {
  const partnerType = account?.partner_type || "";

  const tabs = useMemo(() => {
    const next = [];

    if (partnerType === "retail" || partnerType === "both") {
      next.push({ id: "retail", label: "Retail Orders" });
    }

    if (partnerType === "wholesale" || partnerType === "both") {
      next.push({ id: "bulk", label: "Wholesale Orders" });
    }

    next.push({ id: "gifts", label: "Gifts & Custom" });
    return next;
  }, [partnerType]);

  const [tab, setTab] = useState(() => tabs[0]?.id || "gifts");

  useEffect(() => {
    if (!tabs.some((item) => item.id === tab)) {
      setTab(tabs[0]?.id || "gifts");
    }
  }, [tabs, tab]);

  return (
    <>
      <style>{CSS}</style>

      <div
        className="nf-ordering-switch"
        role="tablist"
        aria-label="Partner ordering type"
      >
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            onClick={() => setTab(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === "retail" ? (
        <PartnerReplenishmentPanel account={account} />
      ) : tab === "bulk" ? (
        <PartnerBulkOrderPanel key="bulk" mode="bulk" account={account} />
      ) : (
        <PartnerGiftRequestPanel />
      )}
    </>
  );
}
