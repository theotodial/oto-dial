import mongoose from 'mongoose';
import Plan from '../src/models/Plan.js';
import AddonPlan from '../src/models/AddonPlan.js';
import dotenv from 'dotenv';
import {
  STRIPE_PLAN_PRICE_IDS,
  STRIPE_ADDON_PRICE_IDS
} from "../src/config/stripeCatalog.js";

// Load environment variables
dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/oto-dial';

async function initializePlans() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // ===========================
    // Subscription plans
    // ===========================
    const plans = [
      {
        name: "Basic Plan",
        price: 19.99,
        currency: "USD",
        stripeProductId: "prod_Tj3I37A5KEUqJG",
        stripePriceId: STRIPE_PLAN_PRICE_IDS.basic,
        limits: {
          minutesTotal: 1500,
          smsTotal: 100,
          numbersTotal: 1
        },
        active: true
      },
      {
        name: "Super Plan",
        price: 29.99,
        currency: "USD",
        stripeProductId: "prod_Tj3I37A5KEUqJG",
        stripePriceId: STRIPE_PLAN_PRICE_IDS.super,
        limits: {
          minutesTotal: 2500,
          smsTotal: 200,
          numbersTotal: 1
        },
        active: true
      }
    ];

    console.log('\n📦 Initializing subscription plans...\n');

    for (const planData of plans) {
      // Check if plan already exists
      let plan = await Plan.findOne({ name: planData.name });

      if (plan) {
        // Update existing plan
        plan.price = planData.price;
        plan.currency = planData.currency;
        plan.stripeProductId = planData.stripeProductId;
        plan.stripePriceId = planData.stripePriceId;
        plan.limits = planData.limits;
        plan.active = planData.active;
        await plan.save();
        console.log(`✅ Updated plan: ${planData.name}`);
      } else {
        // Create new plan
        plan = await Plan.create(planData);
        console.log(`✅ Created plan: ${planData.name}`);
      }

      console.log(`   - Price: $${planData.price}/month`);
      console.log(`   - Limits: ${planData.limits.minutesTotal} minutes, ${planData.limits.smsTotal} SMS, ${planData.limits.numbersTotal} number(s)`);
      console.log(`   - Stripe Product ID: ${planData.stripeProductId}`);
      console.log(`   - Stripe Price ID: ${planData.stripePriceId}`);
      console.log(`   - MongoDB ID: ${plan._id}\n`);
    }

    console.log('✅ Subscription plans initialized successfully!');

    // ===========================
    // Add-on plans
    // ===========================
    const addonPlans = [
      {
        name: "Add-on: 700 Minutes",
        type: "minutes",
        price: 9.99,
        currency: "USD",
        quantity: 700,
        stripePriceId: STRIPE_ADDON_PRICE_IDS.minutes_700,
        active: true
      },
      {
        name: "Add-on: 500 SMS",
        type: "sms",
        price: 9.99,
        currency: "USD",
        quantity: 500,
        stripePriceId: STRIPE_ADDON_PRICE_IDS.sms_500,
        active: true
      }
    ];

    console.log('\n📦 Initializing add-on plans...\n');

    for (const addonData of addonPlans) {
      let addon = await AddonPlan.findOne({ name: addonData.name });

      if (addon) {
        addon.type = addonData.type;
        addon.price = addonData.price;
        addon.currency = addonData.currency;
        addon.quantity = addonData.quantity;
        addon.stripePriceId = addonData.stripePriceId;
        addon.active = addonData.active;
        await addon.save();
        console.log(`✅ Updated add-on: ${addonData.name}`);
      } else {
        addon = await AddonPlan.create(addonData);
        console.log(`✅ Created add-on: ${addonData.name}`);
      }

      console.log(`   - Type: ${addonData.type}`);
      console.log(`   - Quantity: ${addonData.quantity}`);
      console.log(`   - Price: $${addonData.price}`);
      console.log(`   - Stripe Price ID: ${addonData.stripePriceId}`);
      console.log(`   - MongoDB ID: ${addon._id}\n`);
    }

    console.log('✅ All plans initialized successfully!');
    console.log('\n⚠️  IMPORTANT: Subscription plans and add-ons share Stripe for billing, but limits and quantities are controlled in MongoDB.\n');

  } catch (err) {
    console.error('❌ Error initializing plans:', err);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
}

initializePlans();
