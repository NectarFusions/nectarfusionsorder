import { useEffect, useState } from "react";
import { supabase } from "./lib/supabase";

const button = {
  position: "fixed",
  zIndex: 9999,
  bottom: 18,
  padding: "11px 14px",
  borderRadius: 999,
  border: "1px solid #D6A72A",
  background: "#111",
  color: "#fff",
  fontSize: 13,
  fontWeight: 800,
  textDecoration: "none",
  boxShadow: "0 8px 24px rgba(0,0,0,.22)",
};

export default function SubscriptionFulfillmentLauncher() {
  const [isAdmin, setIsAdmin] = useState(false);
  const path = window.location.pathname;
  const clubMatch = path.match(
    /^\/club\/([0-9a-f-]{36})\/?$/i
  );

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(async ({ data }) => {
      const userId = data?.session?.user?.id;
      if (!userId) return;

      const { data: row } = await supabase
        .from("admins")
        .select("user_id")
        .eq("user_id", userId)
        .maybeSingle();

      if (mounted) setIsAdmin(Boolean(row));
    });

    return () => {
      mounted = false;
    };
  }, []);

  if (path.includes("/fulfillment")) return null;

  return (
    <>
      {clubMatch && (
        <a
          href={`/club/${clubMatch[1]}/fulfillment`}
          style={{ ...button, right: 18 }}
        >
          Delivery / Pickup Settings
        </a>
      )}

      {isAdmin && (
        <a
          href="/admin/honey-club"
          style={{ ...button, left: 18 }}
        >
          Honey Club Fulfillment
        </a>
      )}
    </>
  );
}
