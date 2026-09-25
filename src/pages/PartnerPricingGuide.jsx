import { useEffect, useMemo, useState } from "react";
import * as api from "../lib/api";

const CSS = `
.nf-pricing-guide{display:grid;gap:18px}
.nf-pricing-guide-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}
.nf-pricing-guide-card{padding:20px;border:1px solid #D9E4EA;border-radius:18px;background:#fff}
.nf-pricing-guide-card h4{margin:0;color:#173C52;font-size:19px}
.nf-pricing-guide-card p{margin:7px 0 0;color:#667781;font-size:14px;line-height:1.6}
.nf-pricing-guide-table{width:100%;margin-top:15px;border-collapse:collapse}
.nf-pricing-guide-table th,.nf-pricing-guide-table td{padding:10px 8px;border-bottom:1px solid #E8E1D8;text-align:left;font-size:14px}
.nf-pricing-guide-table th{color:#6B594A;font-size:12px;letter-spacing:.05em;text-transform:uppercase}
.nf-pricing-guide-table td{color:#2A211A}
.nf-pricing-guide-table td strong{color:#173C52}
.nf-pricing-guide-note{padding:14px 16px;border-left:4px solid #F7C41C;border-radius:12px;background:#FFF9E8;color:#604A1C;font-size:14px;line-height:1.65}
.nf-pricing-guide-loading{padding:18px;border:1px dashed #C9DCE7;border-radius:14px;color:#617985;background:#F8FCFE}
@media(max-width:760px){.nf-pricing-guide-grid{grid-template-columns:1fr}}
`;

const money = (value) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(Number(value || 0));

const cents = (value) => money(Number(value || 0) / 100);

export default function PartnerPricingGuide({ account }) {
  const partnerType = account?.partner_type || "";
  const showRetail = partnerType === "retail" || partnerType === "both";
  const showWholesale =
    partnerType === "wholesale" || partnerType === "both";

  const [retailCatalog, setRetailCatalog] = useState(null);
  const [bulkCatalog, setBulkCatalog] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");

    Promise.all([
      showRetail ? api.getCatalog() : Promise.resolve(null),
      showWholesale
        ? api.getPartnerBulkOrderCatalog()
        : Promise.resolve(null),
    ])
      .then(([retail, bulk]) => {
        if (!active) return;
        setRetailCatalog(retail);
        setBulkCatalog(bulk);
      })
      .catch((loadError) => {
        if (!active) return;
        setError(
          loadError?.message ||
            "Current partner pricing could not be loaded."
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [showRetail, showWholesale]);

  const retailRows = useMemo(() => {
    if (!showRetail) return [];
    const allowed = new Set(["4oz", "7oz", "1lb"]);
    return (retailCatalog?.sizes || [])
      .filter((size) => allowed.has(size.id))
      .map((size) => ({
        id: size.id,
        label: size.label,
        retail: Number(size.price || 0),
        partner: Number(size.price || 0) / 2,
      }));
  }, [retailCatalog, showRetail]);

  const wholesaleRows = useMemo(
    () => (showWholesale ? bulkCatalog?.sizes || [] : []),
    [bulkCatalog, showWholesale]
  );

  if (loading) {
    return (
      <>
        <style>{CSS}</style>
        <div className="nf-pricing-guide-loading">
          Loading current partner pricing…
        </div>
      </>
    );
  }

  return (
    <div className="nf-pricing-guide">
      <style>{CSS}</style>

      {error && (
        <div className="nf-partner-resource-error" role="alert">
          {error}
        </div>
      )}

      <div className="nf-pricing-guide-grid">
        {showRetail && (
          <section className="nf-pricing-guide-card">
            <h4>Retail Partner Pricing</h4>
            <p>
              Packaged NectarFusions jars for resale. Partner pricing is
              currently 50% of the standard NectarFusions retail price.
            </p>

            <table className="nf-pricing-guide-table">
              <thead>
                <tr>
                  <th>Size</th>
                  <th>Your Price</th>
                  <th>Suggested Retail</th>
                </tr>
              </thead>
              <tbody>
                {retailRows.map((row) => (
                  <tr key={row.id}>
                    <td>{row.label}</td>
                    <td><strong>{money(row.partner)}</strong></td>
                    <td>{money(row.retail)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <p>
              Core retail flavors: Chipotle, Cinnamon, Lemon,
              Madagascar Vanilla, and Original.
            </p>
          </section>
        )}

        {showWholesale && (
          <section className="nf-pricing-guide-card">
            <h4>Wholesale & Bulk Pricing</h4>
            <p>
              Larger-format honey for foodservice, production,
              hospitality, beverage programs, and other business use.
            </p>

            <table className="nf-pricing-guide-table">
              <thead>
                <tr>
                  <th>Size</th>
                  <th>Natural</th>
                  <th>Infused</th>
                </tr>
              </thead>
              <tbody>
                {wholesaleRows.map((row) => (
                  <tr key={row.id}>
                    <td>{row.label}</td>
                    <td><strong>{cents(row.natural_price_cents)}</strong></td>
                    <td>{cents(row.infused_price_cents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}
      </div>

      <div className="nf-pricing-guide-note">
        Gift sets and custom requests are available to every partner type
        from the Gifts tab. Pricing shown here is the current portal
        pricing and may change when NectarFusions updates its published
        pricing.
      </div>
    </div>
  );
}
