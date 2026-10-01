import { useEffect } from "react";

const MOBILE_LABELS = {
  "Company On Hand": "On hand",
  "Company inventory?": "Company inv.",
  "Suggested Qty": "Suggested qty",
  "Suggested order": "Order qty",
  "Production demand": "Prod. demand",
  "After production": "After prod.",
  "Production orders": "Prod. orders",
  "Stocking unit": "Unit",
  "Linked flavor": "Flavor",
  "Default location": "Location",
  "Basis equivalent": "Basis equiv.",
  "Actual used": "Used",
  "Quantity produced": "Qty produced",
  "Finished SKU": "SKU",
  "Finished lot": "Lot",
  "Assigned to": "Assigned",
};

const compactDevice = () => {
  const viewportWidth = Number(window.visualViewport?.width || window.innerWidth || 0);
  const screenWidth = Number(window.screen?.width || 0);
  const screenHeight = Number(window.screen?.height || 0);
  const shortestScreenSide = Math.min(
    screenWidth || Number.POSITIVE_INFINITY,
    screenHeight || Number.POSITIVE_INFINITY
  );

  return viewportWidth <= 900 || shortestScreenSide <= 900;
};

export default function useNfosResponsiveTables() {
  useEffect(() => {
    const root = document.querySelector(".nfos-shell");
    if (!root) return undefined;

    const applyCompactMode = () => {
      root.dataset.compactTables = compactDevice() ? "true" : "false";
    };

    const applyLabels = () => {
      root.querySelectorAll("table.nfos-table").forEach((table) => {
        const headers = Array.from(table.querySelectorAll("thead th"))
          .map((th) => String(th.textContent || "").trim());

        table.dataset.mobileStack = "true";

        table.querySelectorAll("tbody tr").forEach((row) => {
          Array.from(row.children).forEach((cell, index) => {
            if (cell.tagName !== "TD") return;
            const original = headers[index] || "";
            cell.dataset.originalLabel = original;
            cell.dataset.label = MOBILE_LABELS[original] || original;
          });
        });
      });
    };

    const refresh = () => {
      applyCompactMode();
      applyLabels();
    };

    refresh();

    const observer = new MutationObserver(() => applyLabels());
    observer.observe(root, { childList: true, subtree: true });

    window.addEventListener("resize", refresh);
    window.addEventListener("orientationchange", refresh);
    window.visualViewport?.addEventListener("resize", refresh);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", refresh);
      window.removeEventListener("orientationchange", refresh);
      window.visualViewport?.removeEventListener("resize", refresh);
    };
  }, []);
}
