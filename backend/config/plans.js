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

export const UNLIMITED_PLAN = {
  name: "Unlimited",
  priceUSD: 119.99,
  stripePriceId: "price_1T2mI6CxZc7GK7QKObsM4ksT",
  displayUnlimited: true,
  limits: {
    minutesTotal: 3600,
    smsTotal: 400,
    numbersTotal: 1
  },
  monthlySmsLimit: 400,
  monthlyMinutesLimit: 3600,
  dailySmsLimit: 30,
  dailyMinutesLimit: 180,
  dedicatedNumbers: 1
};

export const AFFILIATE_UNLIMITED_PLAN = {
  name: "Affiliate Unlimited",
  priceUSD: 119.99,
  stripePriceId: "price_1T2r5pCxZc7GK7QKMa5wn6dE",
  displayUnlimited: true,
  limits: {
    minutesTotal: 3600,
    smsTotal: 400,
    numbersTotal: 1
  },
  monthlySmsLimit: 400,
  monthlyMinutesLimit: 3600,
  dailySmsLimit: 30,
  dailyMinutesLimit: 180,
  dedicatedNumbers: 1
};
