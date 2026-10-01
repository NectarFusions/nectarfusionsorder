import { useEffect } from "react";

export default function useNfosResponsiveTables() {
  useEffect(() => {
    const root = document.querySelector(".nfos-shell");
    if (!root) return undefined;

    const applyLabels = () => {
      root.querySelectorAll("table.nfos-table").forEach((table) => {
        const headers = Array.from(table.querySelectorAll("thead th"))
          .map((th) => String(th.textContent || "").trim());

        table.dataset.mobileStack = "true";

        table.querySelectorAll("tbody tr").forEach((row) => {
          Array.from(row.children).forEach((cell, index) => {
            if (cell.tagName !== "TD") return;
            cell.dataset.label = headers[index] || "";
          });
        });
      });
    };

    applyLabels();

    const observer = new MutationObserver(() => applyLabels());
    observer.observe(root, { childList: true, subtree: true });

    return () => observer.disconnect();
  }, []);
}
