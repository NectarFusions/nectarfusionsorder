import { useEffect, useRef } from "react";
import JsBarcode from "jsbarcode";

export default function NfosBarcode({ value, title, subtitle, compact = false }) {
  const svgRef = useRef(null);

  useEffect(() => {
    if (!svgRef.current || !value) return;
    JsBarcode(svgRef.current, value, {
      format: "CODE128",
      displayValue: true,
      font: "Arial",
      fontSize: compact ? 11 : 14,
      height: compact ? 36 : 54,
      margin: 6,
      width: compact ? 1.25 : 1.6,
    });
  }, [value, compact]);

  const printLabel = () => {
    if (!value || !svgRef.current) return;
    const popup = window.open("", "_blank", "width=640,height=480");
    if (!popup) return;
    popup.document.write(`<!doctype html><html><head><title>${title || value}</title>
      <style>
        body{font-family:Arial,sans-serif;margin:0;padding:28px;text-align:center;color:#111}
        .label{display:inline-block;border:1px solid #ddd;border-radius:10px;padding:18px 22px;min-width:320px}
        h1{font-size:18px;margin:0 0 5px}.sub{font-size:12px;color:#555;margin-bottom:10px}
        svg{max-width:100%;height:auto}@media print{button{display:none}.label{border:0}}
      </style></head><body><div class="label"><h1>${title || "NFOS Barcode"}</h1>
      <div class="sub">${subtitle || ""}</div>${svgRef.current.outerHTML}</div><br/><br/>
      <button onclick="window.print()">Print</button></body></html>`);
    popup.document.close();
  };

  const downloadSvg = () => {
    if (!svgRef.current || !value) return;
    const svg = svgRef.current.outerHTML;
    const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${value}.svg`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className={`nfos-barcode-card${compact ? " compact" : ""}`}>
      {title && <div className="nfos-barcode-title">{title}</div>}
      {subtitle && <div className="nfos-muted nfos-small">{subtitle}</div>}
      <svg ref={svgRef} aria-label={`Barcode ${value}`} />
      {!compact && (
        <div className="nfos-inline-actions">
          <button className="nfos-btn secondary" type="button" onClick={printLabel}>Print label</button>
          <button className="nfos-btn ghost" type="button" onClick={downloadSvg}>Save SVG</button>
        </div>
      )}
    </div>
  );
}
