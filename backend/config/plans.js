export const BASIC_PLAN = {
  name: "Basic",
  priceUSD: 19.99,
  stripePriceId: "price_1SlbCBCxZc7GK7QKVTtMnI97",

  limits: {
    minutesTotal: 2500,
    smsTotal: 200,
    numbersTotal: 1,
  },

  rates: {
    perMinute: 0.0065,
    perSms: 0.0065,
  },
};

export const SUPER_PLAN = {
  name: "Super",
  priceUSD: 29.99,
  stripePriceId: "price_1SxHV2CxZc7GK7QKydR5iwQH",

  limits: {
    minutesTotal: 2500,
    smsTotal: 200,
    numbersTotal: 1,
  },
};
