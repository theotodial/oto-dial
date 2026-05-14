export const CREDIT_RULES = {
  outboundAttemptCharge: 1,
  connectedIntervalSeconds: 6,
  connectedIntervalCharge: 1,
  smsOutboundCharge: 10,
  callReservationMinimum: 3,
};

export const PLAN_CREDITS = {
  basic: 1500,
  super: 2500,
};

export const CREDIT_ADDONS = [
  { name: "Credit Pack 1000", quantity: 1000, price: 9.99 },
  { name: "Credit Pack 2500", quantity: 2500, price: 19.99 },
  { name: "Credit Pack 5000", quantity: 5000, price: 34.99 },
];
