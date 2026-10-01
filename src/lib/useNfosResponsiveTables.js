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
  "Actual quantity": "Actual qty",
  "Quantity produced": "Qty produced",
  "Quantity made": "Qty made",
  "Finished SKU": "SKU",
  "Finished lot": "Lot",
  "Assigned to": "Assigned",
  "Available cost source": "Cost source",
  "Cost / unit": "Cost/unit",
  "Gross margin": "Margin",
  "Avg / unit": "Avg/unit",
  "Square status": "Square",
  "NFOS mapping": "NFOS map",
  "Inventory value": "Inv. value",
  "Needed by": "Need by",
  "Team member": "Team member"
};

const compactDevice = () => {
  const viewportWidth = Number(window.visualViewport?.width || window.innerWidth || 0);
  const screenWidth = Number(window.screen?.width || 0);
  const screenHeight = Number(window.screen?.height || 0);
  const shortestScreenSide = Math.min(
    screenWidth || Number.POSITIVE_INFINITY,
    screenHeight || Number.POSITIVE_INFINITY
  );

  return viewportWidth <= 1180 || shortestScreenSide <= 900;
};

export default function useNfosResponsiveTables() {
  useEffect(() => {
    let root = null;
    let tableObserver = null;

    const cleanupRoot = () => {
      tableObserver?.disconnect();
      tableObserver = null;
      root = null;
    };

    const applyCompactMode = () => {
      if (!root) return;
      const compact = compactDevice();
      root.dataset.compactTables = compact ? "true" : "false";
      root.classList.toggle("nfos-compact-ui", compact);
    };

    const applyLabels = () => {
      if (!root) return;

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
      if (!root) return;
      applyCompactMode();
      applyLabels();
    };

    const attachRoot = () => {
      const nextRoot = document.querySelector(".nfos-shell");
      if (nextRoot === root) return;

      cleanupRoot();
      if (!nextRoot) return;

      root = nextRoot;
      refresh();

      tableObserver = new MutationObserver(() => {
        applyLabels();
      });
      tableObserver.observe(root, { childList: true, subtree: true });
    };

    const documentObserver = new MutationObserver(attachRoot);
    documentObserver.observe(document.documentElement, { childList: true, subtree: true });

    const onViewportChange = () => {
      if (!root || !document.contains(root)) attachRoot();
      refresh();
    };

    attachRoot();

    window.addEventListener("resize", onViewportChange);
    window.addEventListener("orientationchange", onViewportChange);
    window.visualViewport?.addEventListener("resize", onViewportChange);

    return () => {
      documentObserver.disconnect();
      cleanupRoot();
      window.removeEventListener("resize", onViewportChange);
      window.removeEventListener("orientationchange", onViewportChange);
      window.visualViewport?.removeEventListener("resize", onViewportChange);
    };
  }, []);
}
