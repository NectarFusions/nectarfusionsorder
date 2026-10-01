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
  const coarsePointer = Boolean(
    window.matchMedia?.("(pointer: coarse)")?.matches ||
    Number(navigator.maxTouchPoints || 0) > 1
  );

  // Phones always use the compact UI. Touch-first tablets keep it as well.
  // Fine-pointer laptops/desktops stay in the dense desktop dashboard layout.
  return viewportWidth <= 820 || (coarsePointer && viewportWidth <= 1180);
};

const stateForText = (value) => {
  const text = String(value || "").trim().toLowerCase();
  if (!text) return null;

  if (/\b(critical|fail|failed|failure|error|overdue|blocked|urgent|danger|rejected)\b/.test(text)) {
    return "urgent";
  }

  if (/\b(attention|setup|pending|warning|review|missing|low|high|open|draft|profile only|inactive)\b/.test(text)) {
    return "attention";
  }

  if (/\b(pass|passed|ready|complete|completed|done|linked|healthy|closed|reconciled|success|active)\b/.test(text)) {
    return "ok";
  }

  return null;
};

const iconForState = (state) =>
  ({ urgent: "!", attention: "⚠", ok: "✓" }[state] || "");

export default function useNfosResponsiveTables() {
  useEffect(() => {
    let root = null;
    let tableObserver = null;
    let toastTimer = null;
    let clickTimer = null;
    let lastPageTitle = "";

    const ensureToast = () => {
      let toast = document.getElementById("nfos-ux-toast");
      if (toast) return toast;

      toast = document.createElement("div");
      toast.id = "nfos-ux-toast";
      toast.className = "nfos-ux-toast";
      toast.setAttribute("role", "status");
      toast.setAttribute("aria-live", "polite");
      toast.setAttribute("aria-atomic", "true");
      document.body.appendChild(toast);
      return toast;
    };

    const showToast = (message, state = "neutral") => {
      if (!message) return;
      const toast = ensureToast();
      toast.textContent = message;
      toast.dataset.state = state;
      toast.classList.add("show");

      window.clearTimeout(toastTimer);
      toastTimer = window.setTimeout(() => {
        toast.classList.remove("show");
      }, 1800);
    };

    const ensureBackToTop = () => {
      let button = document.getElementById("nfos-back-to-top");
      if (button) return button;

      button = document.createElement("button");
      button.id = "nfos-back-to-top";
      button.className = "nfos-back-to-top";
      button.type = "button";
      button.setAttribute("aria-label", "Back to top");
      button.textContent = "↑ Top";
      button.addEventListener("click", () => {
        window.scrollTo({ top: 0, behavior: "smooth" });
      });
      document.body.appendChild(button);
      return button;
    };

    const updateBackToTop = () => {
      const button = ensureBackToTop();
      button.classList.toggle("show", window.scrollY > 650);
    };

    const scrollMainIntoView = () => {
      if (!root) return;
      const main = root.querySelector(".nfos-main");
      const sticky = root.querySelector(".nfos-side");
      if (!main) return;

      const stickyHeight = sticky?.getBoundingClientRect().height || 0;
      const y = main.getBoundingClientRect().top + window.scrollY - stickyHeight - 12;
      window.scrollTo({ top: Math.max(0, y), behavior: "smooth" });
    };

    const cleanupRoot = () => {
      if (root) {
        root.removeEventListener("click", handleRootClick);
        root.removeEventListener("change", handleRootChange);
      }

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

    const markState = (element, state) => {
      if (!element || !state) return;
      element.dataset.nfosState = state;
      element.dataset.nfosIcon = iconForState(state);
    };

    const applyStatusSemantics = () => {
      if (!root) return;

      root.querySelectorAll(".nfos-error").forEach((element) => markState(element, "urgent"));
      root.querySelectorAll(".nfos-success").forEach((element) => markState(element, "ok"));

      root.querySelectorAll(".nfos-pill").forEach((element) => {
        const state = stateForText(element.textContent);
        if (state) markState(element, state);
      });

      root.querySelectorAll(
        'td[data-original-label="Status"], td[data-original-label="Priority"], td[data-original-label="Severity"]'
      ).forEach((element) => {
        const state = stateForText(element.textContent);
        if (state) markState(element, state);
      });

      root.querySelectorAll(".nfos-stat").forEach((card) => {
        const label = String(card.querySelector(".nfos-stat-label")?.textContent || "").toLowerCase();
        const rawValue = String(card.querySelector(".nfos-stat-value")?.textContent || "").replace(/,/g, "");
        const numericValue = Number(rawValue);
        let state = null;

        if (/\b(critical|failure|fail|overdue|blocked|error)\b/.test(label)) {
          state = Number.isFinite(numericValue) && numericValue === 0 ? "ok" : "urgent";
        } else if (/\b(attention|setup|missing|pending|draft|review|low stock)\b/.test(label)) {
          state = Number.isFinite(numericValue) && numericValue === 0 ? "ok" : "attention";
        } else if (/\b(pass|ready|complete|healthy|linked)\b/.test(label)) {
          state = "ok";
        }

        if (state) markState(card, state);
      });
    };

    const applySelectionAccessibility = () => {
      if (!root) return;

      root.querySelectorAll(".nfos-nav button, .nfos-select-list > button").forEach((button) => {
        if (button.classList.contains("active")) {
          button.setAttribute("aria-current", "true");
          button.setAttribute("aria-selected", "true");
        } else {
          button.removeAttribute("aria-current");
          button.setAttribute("aria-selected", "false");
        }
      });

      root.querySelectorAll(".nfos-health-tabs .nfos-btn, .nfos-report-tabs .nfos-btn").forEach((button) => {
        const active = !button.classList.contains("secondary");
        button.setAttribute("aria-pressed", active ? "true" : "false");
      });
    };

    const checkPageChange = () => {
      if (!root) return;
      const title = String(
        root.querySelector(".nfos-main > .nfos-page-head h1")?.textContent || ""
      ).trim();

      if (!title) return;
      if (!lastPageTitle) {
        lastPageTitle = title;
        return;
      }

      if (title !== lastPageTitle) {
        lastPageTitle = title;
        window.setTimeout(() => {
          scrollMainIntoView();
          showToast(`Opened ${title}`);
        }, 40);
      }
    };

    const refresh = () => {
      if (!root) return;
      applyCompactMode();
      applyLabels();
      applyStatusSemantics();
      applySelectionAccessibility();
      checkPageChange();
      updateBackToTop();
    };

    const cleanButtonLabel = (button) =>
      String(button?.textContent || "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 80);

    function handleRootClick(event) {
      const button = event.target.closest("button");
      if (!button || !root?.contains(button)) return;

      button.classList.add("nfos-click-confirm");
      window.clearTimeout(clickTimer);
      clickTimer = window.setTimeout(() => {
        button.classList.remove("nfos-click-confirm");
      }, 650);

      const selectionContainer = button.closest(
        ".nfos-nav, .nfos-select-list, .nfos-health-tabs, .nfos-report-tabs"
      );

      if (selectionContainer) {
        const label = cleanButtonLabel(button);
        if (label) showToast(`Selected: ${label}`);

        if (selectionContainer.classList.contains("nfos-nav")) {
          window.setTimeout(scrollMainIntoView, 50);
        }
      }
    }

    function handleRootChange(event) {
      const select = event.target.closest(".nfos-mobile-nav select");
      if (!select || !root?.contains(select)) return;

      const label = select.options?.[select.selectedIndex]?.textContent?.trim();
      if (label) showToast(`Opened ${label}`);
      window.setTimeout(scrollMainIntoView, 50);
    }

    const attachRoot = () => {
      const nextRoot = document.querySelector(".nfos-shell");
      if (nextRoot === root) return;

      cleanupRoot();
      if (!nextRoot) return;

      root = nextRoot;
      lastPageTitle = String(
        root.querySelector(".nfos-main > .nfos-page-head h1")?.textContent || ""
      ).trim();

      root.addEventListener("click", handleRootClick);
      root.addEventListener("change", handleRootChange);

      refresh();

      tableObserver = new MutationObserver(() => {
        applyLabels();
        applyStatusSemantics();
        applySelectionAccessibility();
        checkPageChange();
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
    updateBackToTop();

    window.addEventListener("resize", onViewportChange);
    window.addEventListener("orientationchange", onViewportChange);
    window.visualViewport?.addEventListener("resize", onViewportChange);
    window.addEventListener("scroll", updateBackToTop, { passive: true });

    return () => {
      documentObserver.disconnect();
      cleanupRoot();
      window.clearTimeout(toastTimer);
      window.clearTimeout(clickTimer);

      document.getElementById("nfos-ux-toast")?.remove();
      document.getElementById("nfos-back-to-top")?.remove();

      window.removeEventListener("resize", onViewportChange);
      window.removeEventListener("orientationchange", onViewportChange);
      window.visualViewport?.removeEventListener("resize", onViewportChange);
      window.removeEventListener("scroll", updateBackToTop);
    };
  }, []);
}
