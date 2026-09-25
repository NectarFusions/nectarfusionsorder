import { useEffect, useState } from "react";
import * as api from "../lib/api";
import PartnerReplenishmentPanel from "./PartnerReplenishmentPanel";
import PartnerBulkOrderPanel from "./PartnerBulkOrderPanel";
import PartnerGiftRequestPanel from "./PartnerGiftRequestPanel";

const CSS = `
.nf-ordering-switch {
  display:grid;
  grid-template-columns:repeat(3,minmax(0,1fr));
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
  const [bulkEnabled, setBulkEnabled] = useState(false);
  const [tab, setTab] = useState("retail");

  useEffect(() => {
    let active = true;

    api
      .getPartnerBulkOrderCatalog()
      .then((config) => {
        if (active) {
          setBulkEnabled(
            config.enabled === true &&
              config.eligible === true
          );
        }
      })
      .catch(() => {
        if (active) setBulkEnabled(false);
      });

    return () => {
      active = false;
    };
  }, []);

  if (!bulkEnabled) {
    return <PartnerReplenishmentPanel account={account} />;
  }

  return (
    <>
      <style>{CSS}</style>

      <div
        className="nf-ordering-switch"
        role="tablist"
        aria-label="Partner ordering type"
      >
        <button
          type="button"
          role="tab"
          aria-selected={tab === "retail"}
          onClick={() => setTab("retail")}
        >
          Retailer Replenishment
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={tab === "bulk"}
          onClick={() => setTab("bulk")}
        >
          Wholesale & Bulk
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={tab === "gifts"}
          onClick={() => setTab("gifts")}
        >
          Gift Sets & Custom Requests
        </button>
      </div>

      {tab === "retail" ? (
        <PartnerReplenishmentPanel account={account} />
      ) : tab === "bulk" ? (
        <PartnerBulkOrderPanel key="bulk" mode="bulk" />
      ) : (
        <PartnerGiftRequestPanel />
      )}
    </>
  );
}
