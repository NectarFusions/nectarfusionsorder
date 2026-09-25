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

const DEFAULT_GIFT_PRICING = {
  bear_price_cents: 250,
  bear_suggested_retail_cents: 500,
  hex_price_cents: 300,
  hex_suggested_retail_cents: 600,
  addon_unit_price_cents: 50,
  addon_suggested_retail_cents: 100,
  addon_bundle_price_cents: 125,
  addon_bundle_suggested_retail_cents: 250,
  custom_label_flat_cents: 3000,
};

export default function PartnerPricingGuide({ account }) {
  const partnerType = account?.partner_type || "";
  const showRetail = partnerType === "retail" || partnerType === "both";
  const showWholesale =
    partnerType === "wholesale" || partnerType === "both";

  const [retailCatalog, setRetailCatalog] = useState(null);
  const [bulkCatalog, setBulkCatalog] = useState(null);
  const [giftPricing, setGiftPricing] = useState(DEFAULT_GIFT_PRICING);
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
      api.getPartnerGiftPricing(),
    ])
      .then(([retail, bulk, gifts]) => {
        if (!active) return;
        setRetailCatalog(retail);
        setBulkCatalog(bulk);
        setGiftPricing({
          ...DEFAULT_GIFT_PRICING,
          ...(gifts || {}),
        });
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

        <section className="nf-pricing-guide-card">
          <h4>Gifts & Custom Requests</h4>
          <p>
            Partner gift pricing is the same for Retail, Wholesale, and
            Both partner types.
          </p>

          <table className="nf-pricing-guide-table">
            <thead>
              <tr>
                <th>Item</th>
                <th>Your Price</th>
                <th>Suggested Retail</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>2 oz Plastic Bear</td>
                <td><strong>{cents(giftPricing.bear_price_cents)}</strong></td>
                <td>{cents(giftPricing.bear_suggested_retail_cents)}</td>
              </tr>
              <tr>
                <td>2 oz Glass Hexagon</td>
                <td><strong>{cents(giftPricing.hex_price_cents)}</strong></td>
                <td>{cents(giftPricing.hex_suggested_retail_cents)}</td>
              </tr>
              <tr>
                <td>Wood Honey Dipper</td>
                <td><strong>{cents(giftPricing.addon_unit_price_cents)}</strong></td>
                <td>{cents(giftPricing.addon_suggested_retail_cents)}</td>
              </tr>
              <tr>
                <td>Thank You Tag</td>
                <td><strong>{cents(giftPricing.addon_unit_price_cents)}</strong></td>
                <td>{cents(giftPricing.addon_suggested_retail_cents)}</td>
              </tr>
              <tr>
                <td>Bee Charm</td>
                <td><strong>{cents(giftPricing.addon_unit_price_cents)}</strong></td>
                <td>{cents(giftPricing.addon_suggested_retail_cents)}</td>
              </tr>
              <tr>
                <td>Gift Set Add-ons (all three)</td>
                <td><strong>{cents(giftPricing.addon_bundle_price_cents)}</strong></td>
                <td>{cents(giftPricing.addon_bundle_suggested_retail_cents)}</td>
              </tr>
            </tbody>
          </table>

          <p>
            Custom design + printing & labeling:{" "}
            <strong>{cents(giftPricing.custom_label_flat_cents)} flat</strong>.
          </p>
        </section>
      </div>

      <div className="nf-pricing-guide-note">
        Gifts and custom requests are available to every partner type.
        Core partner flavors are Chipotle, Cinnamon, Lemon,
        Madagascar Vanilla, and Original.
      </div>
    </div>
  );
}
