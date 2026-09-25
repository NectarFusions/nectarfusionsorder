const CART_KEY = "nectarfusions-partner-store-cart";
const FULFILLMENT_KEY = "nectarfusions-partner-store-fulfillment";

const safeCart = (value) =>
  Array.isArray(value) ? value.filter((item) => item && item.id) : [];


export function getPartnerStoreFulfillment() {
  try {
    const saved = String(localStorage.getItem(FULFILLMENT_KEY) || "").trim();
    return ["pickup", "delivery"].includes(saved) ? saved : "pickup";
  } catch {
    return "pickup";
  }
}

export function setPartnerStoreFulfillment(method) {
  const next = ["pickup", "delivery"].includes(method) ? method : "pickup";
  localStorage.setItem(FULFILLMENT_KEY, next);
  window.dispatchEvent(
    new CustomEvent("nf-partner-fulfillment-changed", {
      detail: { fulfillmentMethod: next },
    })
  );
  return next;
}

export function getPartnerStoreCart() {
  try {
    return safeCart(JSON.parse(localStorage.getItem(CART_KEY) || "[]"));
  } catch {
    return [];
  }
}

export function getPartnerStoreCartCount() {
  return getPartnerStoreCart().reduce(
    (sum, item) => sum + Math.max(0, Number(item.quantity || 0)),
    0
  );
}

export function setPartnerStoreCart(nextCart) {
  const clean = safeCart(nextCart);
  localStorage.setItem(CART_KEY, JSON.stringify(clean));

  window.dispatchEvent(
    new CustomEvent("nf-partner-cart-changed", {
      detail: {
        count: clean.reduce(
          (sum, item) => sum + Math.max(0, Number(item.quantity || 0)),
          0
        ),
      },
    })
  );

  return clean;
}

export function addPartnerStoreItems(items) {
  const incoming = safeCart(items);
  const current = getPartnerStoreCart();

  const next = [...current];

  for (const item of incoming) {
    const index = next.findIndex((existing) => existing.id === item.id);

    if (index === -1) {
      next.push(item);
      continue;
    }

    next[index] = {
      ...next[index],
      ...item,
      quantity:
        Number(next[index].quantity || 0) +
        Number(item.quantity || 0),
    };
  }

  return setPartnerStoreCart(next);
}

export function replacePartnerStoreItems(prefixes, items) {
  const starts = Array.isArray(prefixes) ? prefixes : [prefixes];
  const current = getPartnerStoreCart().filter(
    (item) => !starts.some((prefix) => String(item.id).startsWith(prefix))
  );

  return setPartnerStoreCart([...current, ...safeCart(items)]);
}

export function removePartnerStoreItem(id) {
  return setPartnerStoreCart(
    getPartnerStoreCart().filter((item) => item.id !== id)
  );
}

export function clearPartnerStoreCart() {
  return setPartnerStoreCart([]);
}
