import { useCallback, useEffect, useState } from "react";
import { supabase } from "./lib/supabase";

const POLL_MS = 60_000;

const subscriptionFor = (alert) => {
  const value = alert?.subscriptions;
  return Array.isArray(value) ? value[0] : value;
};

const relationFor = (value) =>
  Array.isArray(value) ? value[0] : value;

export default function SubscriptionBonusNotifier() {
  const [alerts, setAlerts] = useState([]);
  const [busyEventId, setBusyEventId] = useState("");

  const load = useCallback(async () => {
    const { data: authData } = await supabase.auth.getSession();
    if (!authData?.session) {
      setAlerts([]);
      return;
    }

    const { data, error } = await supabase
      .from("subscription_box_events")
      .select(`
        square_event_id,
        box_number,
        paid_at,
        subscriptions!inner(
          sub_no,
          status,
          archived_at,
          customers(name, email),
          plans!subscriptions_plan_id_fkey(name)
        )
      `)
      .eq("bonus_jar_due", true)
      .is("bonus_jar_acknowledged_at", null)
      .order("paid_at", { ascending: true });

    if (error) {
      // Non-admin accounts are intentionally blocked by RLS. They should not
      // see an error or learn that an internal fulfillment queue exists.
      setAlerts([]);
      return;
    }

    setAlerts(
      (data || []).filter((alert) => {
        const subscription = subscriptionFor(alert);
        return subscription && !subscription.archived_at;
      })
    );
  }, []);

  useEffect(() => {
    load();

    const interval = window.setInterval(load, POLL_MS);
    const { data: authListener } = supabase.auth.onAuthStateChange(() => {
      load();
    });

    const onVisibility = () => {
      if (document.visibilityState === "visible") load();
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      window.clearInterval(interval);
      authListener?.subscription?.unsubscribe();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [load]);

  const acknowledge = async (eventId) => {
    setBusyEventId(eventId);

    const { error } = await supabase.rpc(
      "acknowledge_subscription_bonus_jar",
      { p_event_id: eventId }
    );

    if (error) {
      window.alert(
        `The bonus jar reminder could not be cleared: ${error.message}`
      );
      setBusyEventId("");
      return;
    }

    setAlerts((current) =>
      current.filter((alert) => alert.square_event_id !== eventId)
    );
    setBusyEventId("");
  };

  if (!alerts.length) return null;

  return (
    <aside
      aria-live="assertive"
      aria-label="Honey Club bonus jar reminders"
      style={{
        position: "fixed",
        right: 14,
        bottom: 14,
        zIndex: 100000,
        width: "min(390px, calc(100vw - 28px))",
        maxHeight: "min(620px, calc(100vh - 28px))",
        overflowY: "auto",
        padding: 14,
        border: "3px solid #E69B00",
        borderRadius: 14,
        background: "#FFF7D1",
        color: "#3E2B17",
        boxShadow: "0 16px 45px rgba(34, 25, 14, .28)",
        fontFamily: "Arial, sans-serif",
      }}
    >
      <div
        style={{
          fontSize: 13,
          fontWeight: 950,
          letterSpacing: ".08em",
          textTransform: "uppercase",
        }}
      >
        ★ Bonus jar fulfillment alert
      </div>
      <div style={{ marginTop: 5, fontSize: 14, lineHeight: 1.45 }}>
        {alerts.length} Honey Club {alerts.length === 1 ? "box needs" : "boxes need"} a bonus jar. This reminder stays open until each jar is marked packed.
      </div>

      <div style={{ display: "grid", gap: 9, marginTop: 12 }}>
        {alerts.map((alert) => {
          const subscription = subscriptionFor(alert) || {};
          const customer = relationFor(subscription.customers) || {};
          const plan = relationFor(subscription.plans) || {};
          const working = busyEventId === alert.square_event_id;

          return (
            <section
              key={alert.square_event_id}
              style={{
                padding: 12,
                border: "1px solid #C98200",
                borderRadius: 10,
                background: "#FFFFFF",
              }}
            >
              <div style={{ fontSize: 16, fontWeight: 900 }}>
                Honey Club #{subscription.sub_no || "—"}
              </div>
              <div style={{ marginTop: 3, fontSize: 14, fontWeight: 700 }}>
                {customer.name || "Member"} · Paid box #{alert.box_number}
              </div>
              <div style={{ marginTop: 3, fontSize: 12.5, opacity: .76 }}>
                {plan.name || "Honey Club plan"}
                {customer.email ? ` · ${customer.email}` : ""}
              </div>
              <button
                type="button"
                disabled={working}
                onClick={() => acknowledge(alert.square_event_id)}
                style={{
                  width: "100%",
                  marginTop: 10,
                  padding: "10px 12px",
                  border: 0,
                  borderRadius: 8,
                  background: working ? "#B7A98D" : "#174A68",
                  color: "#FFFFFF",
                  fontSize: 13.5,
                  fontWeight: 850,
                  cursor: working ? "wait" : "pointer",
                }}
              >
                {working ? "Saving…" : "Mark bonus jar packed ✓"}
              </button>
            </section>
          );
        })}
      </div>
    </aside>
  );
}
