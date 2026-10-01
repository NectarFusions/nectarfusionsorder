import { useEffect, useState } from "react";

const cleanPdfText = (value) =>
  String(value ?? "")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/[•·]/g, "-")
    .replace(/[^\x20-\x7E\n\r\t]/g, "");

const fileNameFor = (recipe) => {
  const base = String(recipe?.name || recipe?.recipe_key || "NectarFusions-SOP")
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "");
  return `${base || "NectarFusions-SOP"}-v${recipe?.version || 1}-SOP.pdf`;
};

async function makeSopPdf(recipe, steps) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "letter" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 54;
  const contentWidth = pageWidth - margin * 2;
  let y = margin;

  const newPage = () => {
    doc.addPage();
    y = margin;
  };

  const ensureSpace = (height) => {
    if (y + height > pageHeight - margin - 24) newPage();
  };

  const writeWrapped = (text, {
    fontSize = 10,
    style = "normal",
    indent = 0,
    lineHeight = 14,
    gapAfter = 8,
  } = {}) => {
    const safe = cleanPdfText(text).trim();
    if (!safe) return;

    doc.setFont("helvetica", style);
    doc.setFontSize(fontSize);
    const lines = doc.splitTextToSize(safe, contentWidth - indent);
    let index = 0;

    while (index < lines.length) {
      let available = Math.floor((pageHeight - margin - 24 - y) / lineHeight);
      if (available < 1) {
        newPage();
        available = Math.floor((pageHeight - margin - 24 - y) / lineHeight);
      }
      const chunk = lines.slice(index, index + available);
      doc.text(chunk, margin + indent, y);
      y += chunk.length * lineHeight;
      index += chunk.length;
      if (index < lines.length) newPage();
    }
    y += gapAfter;
  };

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("NECTARFUSIONS OPERATIONS SYSTEM", margin, y);
  y += 21;

  doc.setFontSize(22);
  doc.text(cleanPdfText(recipe?.name || "Recipe SOP"), margin, y);
  y += 24;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  const meta = [
    `Recipe: ${recipe?.recipe_key || "-"}`,
    `Version: ${recipe?.version || "-"}`,
    `Flavor: ${recipe?.flavor_name || "Not linked"}`,
    `Basis: ${recipe?.basis_quantity ?? "-"} ${recipe?.basis_unit || ""}`.trim(),
  ];
  doc.text(meta.map(cleanPdfText), margin, y);
  y += meta.length * 14 + 12;

  doc.setDrawColor(210);
  doc.line(margin, y, pageWidth - margin, y);
  y += 22;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text("Standard Operating Procedure", margin, y);
  y += 20;

  if (!steps?.length) {
    writeWrapped("No SOP steps are currently configured for this recipe.", {
      fontSize: 11,
      gapAfter: 0,
    });
  } else {
    [...steps]
      .sort((a, b) => Number(a.step_no || 0) - Number(b.step_no || 0))
      .forEach((step) => {
        ensureSpace(72);
        const title = `${step.step_no || ""}. ${step.title || `Step ${step.step_no || ""}`}`.trim();
        writeWrapped(title, { fontSize: 12, style: "bold", lineHeight: 16, gapAfter: 4 });

        const tags = [];
        if (step.critical_control) tags.push("CRITICAL CONTROL");
        if (step.requires_confirmation) tags.push("OPERATOR CONFIRMATION REQUIRED");
        if (step.expected_minutes != null) tags.push(`Expected time: ${step.expected_minutes} minutes`);
        if (tags.length) {
          writeWrapped(tags.join(" | "), {
            fontSize: 8,
            style: "bold",
            lineHeight: 11,
            gapAfter: 5,
          });
        }

        writeWrapped(step.instruction || "", {
          fontSize: 10,
          indent: 12,
          lineHeight: 14,
          gapAfter: 12,
        });
      });
  }

  const totalPages = doc.getNumberOfPages();
  for (let page = 1; page <= totalPages; page += 1) {
    doc.setPage(page);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(100);
    doc.text(
      cleanPdfText(`NectarFusions SOP - ${recipe?.name || recipe?.recipe_key || "Recipe"} - Page ${page} of ${totalPages}`),
      margin,
      pageHeight - 22
    );
    doc.setTextColor(0);
  }

  return doc;
}

export default function NfosRecipeSopPdf({ recipe, steps, children }) {
  const [previewUrl, setPreviewUrl] = useState("");
  const [building, setBuilding] = useState(false);
  const [editing, setEditing] = useState(false);
  const hasSteps = Boolean(steps?.length);

  useEffect(() => {
    if (!previewUrl) return undefined;
    const priorOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const closeOnEscape = (event) => {
      if (event.key === "Escape") setPreviewUrl("");
    };
    window.addEventListener("keydown", closeOnEscape);

    return () => {
      window.removeEventListener("keydown", closeOnEscape);
      document.body.style.overflow = priorOverflow;
      URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const viewPdf = async () => {
    setBuilding(true);
    try {
      const doc = await makeSopPdf(recipe, steps);
      const nextUrl = URL.createObjectURL(doc.output("blob"));
      setPreviewUrl((current) => {
        if (current) URL.revokeObjectURL(current);
        return nextUrl;
      });
    } finally {
      setBuilding(false);
    }
  };

  const downloadPdf = async () => {
    setBuilding(true);
    try {
      const doc = await makeSopPdf(recipe, steps);
      doc.save(fileNameFor(recipe));
    } finally {
      setBuilding(false);
    }
  };

  return (
    <div className="nfos-card nfos-sop-pdf-card">
      <div className="nfos-split-head">
        <div>
          <h3>SOP PDF</h3>
          <p className="nfos-muted">
            View or download the complete SOP without filling the recipe screen with long instructions.
          </p>
          <div className="nfos-muted nfos-small">
            {hasSteps ? `${steps.length} SOP step${steps.length === 1 ? "" : "s"} included.` : "No SOP steps have been configured yet."}
          </div>
        </div>
        <div className="nfos-inline-actions">
          <button className="nfos-btn secondary" type="button" disabled={!hasSteps || building} onClick={viewPdf}>
            {building ? "Preparing…" : "View PDF"}
          </button>
          <button className="nfos-btn ghost" type="button" disabled={!hasSteps || building} onClick={downloadPdf}>
            Download PDF
          </button>
          {recipe?.status === "draft" && (
            <button className="nfos-btn ghost" type="button" onClick={() => setEditing((value) => !value)}>
              {editing ? "Close SOP editor" : "Edit SOP steps"}
            </button>
          )}
        </div>
      </div>

      {recipe?.status === "draft" && editing && (
        <div className="nfos-sop-editor">{children}</div>
      )}

      {previewUrl && (
        <div className="nfos-dialog-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setPreviewUrl("");
        }}>
          <div className="nfos-dialog-panel nfos-pdf-dialog" role="dialog" aria-modal="true" aria-label={`${recipe?.name || "Recipe"} SOP PDF`}>
            <div className="nfos-dialog-head">
              <div>
                <strong>{recipe?.name || "Recipe"} SOP</strong>
                <div className="nfos-muted nfos-small">Version {recipe?.version || "-"}</div>
              </div>
              <div className="nfos-inline-actions">
                <button className="nfos-btn ghost" type="button" onClick={downloadPdf}>Download</button>
                <button className="nfos-btn ghost" type="button" onClick={() => setPreviewUrl("")} aria-label="Close PDF preview">X</button>
              </div>
            </div>
            <iframe className="nfos-pdf-frame" src={previewUrl} title={`${recipe?.name || "Recipe"} SOP PDF preview`} />
          </div>
        </div>
      )}
    </div>
  );
}
