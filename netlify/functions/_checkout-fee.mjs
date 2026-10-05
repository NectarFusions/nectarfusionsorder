const squareOnlineRate = () => {
  const value = Number(
    process.env.SQUARE_ONLINE_PROCESSING_RATE ?? "0.033"
  );

  return Number.isFinite(value) && value >= 0 && value < 1
    ? value
    : 0.033;
};

const squareOnlineFixedCents = () => {
  const value = Number.parseInt(
    process.env.SQUARE_ONLINE_PROCESSING_FIXED_CENTS ?? "30",
    10
  );

  return Number.isFinite(value) && value >= 0
    ? value
    : 30;
};

export const onlineCheckoutServiceFee = (baseCents) => {
  const amount = Number(baseCents);

  if (!Number.isFinite(amount) || amount <= 0) {
    return 0;
  }

  const rate = squareOnlineRate();
  const fixed = squareOnlineFixedCents();
  const grossCents = Math.ceil(
    (amount + fixed) / (1 - rate)
  );

  return Math.max(0, grossCents - amount);
};

export const onlineCheckoutQuote = (baseCents) => {
  const base = Math.max(
    0,
    Math.round(Number(baseCents) || 0)
  );
  const serviceFee = onlineCheckoutServiceFee(base);

  return {
    base_cents: base,
    service_fee_cents: serviceFee,
    total_cents: base + serviceFee,
  };
};
