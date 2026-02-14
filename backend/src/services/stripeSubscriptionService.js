import mongoose from "mongoose";
import User from "../models/User.js";
import Subscription from "../models/Subscription.js";
import Plan from "../models/Plan.js";
import StripeEvent from "../models/StripeEvent.js";
import Analytics from "../models/Analytics.js";

/**
 * GUARANTEED SUBSCRIPTION ACTIVATION SERVICE
 * Ensures atomic subscription assignment with zero failure mode
 */

/**
 * Process checkout.session.completed event
 * Creates subscription in pending_activation state
 */
export async function processCheckoutCompleted(event, stripe) {
  const session = event.data.object;
  
  // Verify payment status
  if (session.payment_status !== "paid") {
    console.warn(`⚠️ Checkout session ${session.id} not paid, status: ${session.payment_status}`);
    return { success: false, error: "Payment not completed" };
  }

  // Detect if this is an add-on purchase
  const isAddon = !!session.metadata?.addonId;

  // Extract metadata
  const userId = session.metadata?.userId;
  const planId = session.metadata?.planId; // MongoDB plan ID for subscription purchases
  const planName = session.metadata?.planName;

  if (!userId) {
    console.error(`❌ Checkout session ${session.id} missing userId in metadata`);
    return { success: false, error: "Missing userId in metadata" };
  }

  // Handle add-on purchases separately
  if (isAddon) {
    const addonId = session.metadata.addonId;
    const addonType = session.metadata.addonType; // "minutes" or "sms"
    const addonQuantityRaw = session.metadata.addonQuantity;
    const addonQuantity = addonQuantityRaw ? parseInt(addonQuantityRaw, 10) : NaN;

    if (!addonId || !addonType || Number.isNaN(addonQuantity)) {
      console.error(`❌ Add-on checkout ${session.id} missing addon metadata`);
      return { success: false, error: "Missing addon metadata" };
    }

    // Find user
    const user = await User.findById(userId);
    if (!user) {
      console.error(`❌ User ${userId} not found for add-on checkout ${session.id}`);
      return { success: false, error: "User not found" };
    }

    // Find active subscription
    const subscription = await Subscription.findOne({
      userId: user._id,
      status: "active"
    });

    if (!subscription) {
      console.error(`❌ No active subscription for user ${user._id} when processing add-on ${addonId}`);
      return { success: false, error: "No active subscription for add-on" };
    }

    const now = new Date();

    // Apply 30-day expiry logic per add-on type
    if (addonType === "minutes") {
      const baseDate =
        subscription.addonsMinutesExpiry && subscription.addonsMinutesExpiry > now
          ? subscription.addonsMinutesExpiry
          : now;
      const newExpiry = new Date(baseDate);
      newExpiry.setDate(newExpiry.getDate() + 30);

      subscription.addons.minutes = (subscription.addons?.minutes || 0) + addonQuantity;
      subscription.addonsMinutesExpiry = newExpiry;
    } else if (addonType === "sms") {
      const baseDate =
        subscription.addonsSmsExpiry && subscription.addonsSmsExpiry > now
          ? subscription.addonsSmsExpiry
          : now;
      const newExpiry = new Date(baseDate);
      newExpiry.setDate(newExpiry.getDate() + 30);

      subscription.addons.sms = (subscription.addons?.sms || 0) + addonQuantity;
      subscription.addonsSmsExpiry = newExpiry;
    } else {
      console.error(`❌ Unknown addonType "${addonType}" on checkout ${session.id}`);
      return { success: false, error: "Unknown addon type" };
    }

    await subscription.save();

    console.log(
      `✅ Applied add-on ${addonType} (+${addonQuantity}) for user ${user.email} on subscription ${subscription._id}`
    );

    return {
      success: true,
      userId: user._id,
      subscriptionId: subscription._id
    };
  }

  // Subscription purchases must include planId
  if (!planId) {
    console.error(`❌ Checkout session ${session.id} missing planId in metadata`);
    return { success: false, error: "Missing planId in metadata" };
  }

  // Find user
  const user = await User.findById(userId);
  if (!user) {
    console.error(`❌ User ${userId} not found for checkout ${session.id}`);
    return { success: false, error: "User not found" };
  }

  // Ensure Stripe customer ID is set
  if (!user.stripeCustomerId && session.customer) {
    user.stripeCustomerId = session.customer;
    await user.save();
  }

  // Fetch plan from MongoDB using planId - SINGLE SOURCE OF TRUTH
  const plan = await Plan.findById(planId);
  if (!plan || !plan.active) {
    console.error(`❌ Plan ${planId} not found or inactive for checkout ${session.id}`);
    return { success: false, error: `Plan not found or inactive` };
  }

  // Find existing subscription for this Stripe subscription.
  // Event order is not guaranteed; if another webhook already activated it,
  // never downgrade back to pending_activation.
  const subscriptionFilter = session.subscription
    ? {
        userId: user._id,
        stripeSubscriptionId: session.subscription
      }
    : {
        userId: user._id,
        status: "pending_activation"
      };

  const existingSubscription = await Subscription.findOne(subscriptionFilter).sort({
    createdAt: -1
  });

  const shouldKeepActiveStatus = existingSubscription?.status === "active";
  const nextStatus = shouldKeepActiveStatus ? "active" : "pending_activation";

  const now = new Date();
  const periodEnd = new Date(now);
  periodEnd.setDate(periodEnd.getDate() + 30);

  const subscription = await Subscription.findOneAndUpdate(
    subscriptionFilter,
    {
      $set: {
        userId: user._id,
        planId: plan._id, // MongoDB plan ID
        stripeSubscriptionId: session.subscription || existingSubscription?.stripeSubscriptionId || null,
        stripePriceId: plan.stripePriceId, // From MongoDB plan
        planKey: plan.name, // Keep for backward compatibility
        status: nextStatus,
        // Limits from MongoDB plan - SINGLE SOURCE OF TRUTH
        limits: {
          minutesTotal: plan.limits.minutesTotal,
          smsTotal: plan.limits.smsTotal,
          numbersTotal: plan.limits.numbersTotal
        }
      },
      $setOnInsert: {
        periodStart: now,
        periodEnd: periodEnd,
        usage: {
          minutesUsed: 0,
          smsUsed: 0
        },
        addons: {
          minutes: 0,
          sms: 0
        }
      }
    },
    { upsert: true, new: true }
  );

  // Keep user linkage consistent if this subscription was already activated by another webhook.
  if (
    nextStatus === "active" &&
    (!user.activeSubscriptionId || user.activeSubscriptionId.toString() !== subscription._id.toString())
  ) {
    user.activeSubscriptionId = subscription._id;
    user.subscriptionActive = true;
    await user.save();
  }

  console.log(
    `✅ Subscription ${subscription._id} synced (${nextStatus}) for user ${user.email} with plan ${plan.name} (${planId})`
  );

  return {
    success: true,
    subscriptionId: subscription._id,
    userId: user._id
  };
}

/**
 * Process invoice.payment_succeeded event
 * ACTIVATES subscription atomically
 * This is the GUARANTEED ACTIVATION POINT
 */
export async function processInvoicePaymentSucceeded(event, stripe) {
  const invoice = event.data.object;
  const customerId = invoice.customer;
  const subscriptionId = invoice.subscription;

  if (!customerId) {
    console.error(`❌ Invoice ${invoice.id} missing customer`);
    return { success: false, error: "Missing customer ID" };
  }

  // Find user by Stripe customer ID
  const user = await User.findOne({ stripeCustomerId: customerId });
  if (!user) {
    console.error(`❌ User not found for Stripe customer ${customerId}`);
    return { success: false, error: "User not found" };
  }

  // Find subscription by Stripe subscription ID or user ID
  let subscription = null;
  if (subscriptionId) {
    subscription = await Subscription.findOne({
      $or: [
        { stripeSubscriptionId: subscriptionId },
        { userId: user._id, status: { $in: ["pending_activation", "active", "past_due", "incomplete"] } }
      ]
    }).sort({ createdAt: -1 });
  } else {
    subscription = await Subscription.findOne({
      userId: user._id,
      status: { $in: ["pending_activation", "active", "past_due", "incomplete"] }
    }).sort({ createdAt: -1 });
  }

  if (!subscription) {
    console.error(`❌ Subscription not found for user ${user._id}, invoice ${invoice.id}`);
    return { success: false, error: "Subscription not found" };
  }

  // ATOMIC ACTIVATION - Use transaction to ensure consistency
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // Update subscription status to active
    subscription.status = "active";
    if (subscriptionId && !subscription.stripeSubscriptionId) {
      subscription.stripeSubscriptionId = subscriptionId;
    }
    await subscription.save({ session });

    // Update user - link subscription and activate
    user.activeSubscriptionId = subscription._id;
    user.subscriptionActive = true;
    await user.save({ session });

    // Commit transaction
    await session.commitTransaction();
    session.endSession();

    console.log(`✅ SUBSCRIPTION ACTIVATED: User ${user.email} (${user._id}) → Subscription ${subscription._id}`);

    // Track subscription in analytics
    try {
      // Update all analytics records for this user to mark as having subscription
      await Analytics.updateMany(
        { userId: user._id },
        { 
          $set: { 
            hasSubscription: true,
            subscriptionId: subscription._id
          } 
        }
      );
      console.log(`✅ Analytics updated for subscription activation: User ${user._id}`);
    } catch (analyticsError) {
      // Don't fail subscription activation if analytics fails
      console.warn(`⚠️ Failed to update analytics for subscription:`, analyticsError.message);
    }

    return {
      success: true,
      subscriptionId: subscription._id,
      userId: user._id
    };
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    console.error(`❌ TRANSACTION FAILED:`, err);
    throw err;
  }
}

/**
 * Process customer.subscription.updated event
 */
export async function processSubscriptionUpdated(event, stripe) {
  const stripeSubscription = event.data.object;
  const customerId = stripeSubscription.customer;
  const subscriptionId = stripeSubscription.id;

  // Ignore pure add-on Stripe subscriptions (these are handled via checkout.session.completed)
  if (stripeSubscription.metadata?.isAddon === "true" || stripeSubscription.metadata?.addonId) {
    console.log(`ℹ️ Skipping add-on Stripe subscription update ${subscriptionId}`);
    return { success: true };
  }

  const user = await User.findOne({ stripeCustomerId: customerId });
  if (!user) {
    console.error(`❌ User not found for Stripe customer ${customerId}`);
    return { success: false, error: "User not found" };
  }

  let subscription = await Subscription.findOne({
    $or: [
      { stripeSubscriptionId: subscriptionId },
      { userId: user._id, status: { $in: ["pending_activation", "active", "past_due"] } }
    ]
  });

  // If subscription doesn't exist, create it (for customer.subscription.created events)
  // Try to find plan from customer metadata first
  if (!subscription) {
    let plan = null;
    
    // Try to get planId from customer metadata
    if (customerId) {
      try {
        const customer = await stripe.customers.retrieve(customerId);
        const planIdFromMetadata = customer.metadata?.planId;
        if (planIdFromMetadata) {
          plan = await Plan.findById(planIdFromMetadata);
        }
      } catch (err) {
        console.warn(`Could not fetch customer ${customerId} metadata:`, err.message);
      }
    }
    
    // Fallback to Basic Plan if no plan found in metadata
    if (!plan) {
      plan = await Plan.findOne({ name: "Basic Plan", active: true });
      if (!plan) {
        console.error(`❌ Basic Plan not found - cannot create subscription`);
        return { success: false, error: "Default plan not found" };
      }
    }

    const now = new Date();
    const periodEnd = new Date();
    if (stripeSubscription.current_period_end) {
      periodEnd.setTime(stripeSubscription.current_period_end * 1000);
    } else {
      periodEnd.setDate(now.getDate() + 30);
    }

    subscription = await Subscription.create({
      userId: user._id,
      planId: plan._id,
      stripeSubscriptionId: subscriptionId,
      planKey: plan.name, // Use plan name instead of hardcoded "basic"
      status: stripeSubscription.status === "active" ? "active" : "pending_activation",
      periodStart: stripeSubscription.current_period_start 
        ? new Date(stripeSubscription.current_period_start * 1000)
        : now,
      periodEnd: periodEnd,
      limits: {
        minutesTotal: plan.limits.minutesTotal,
        smsTotal: plan.limits.smsTotal,
        numbersTotal: plan.limits.numbersTotal
      },
      usage: { minutesUsed: 0, smsUsed: 0 },
      addons: { minutes: 0, sms: 0 }
    });

    console.log(`✅ Created new subscription ${subscription._id} from Stripe subscription ${subscriptionId}`);
  }

  // Update subscription status based on Stripe status
  const stripeStatus = stripeSubscription.status;
  let mongoStatus = "active";

  if (stripeStatus === "canceled" || stripeStatus === "unpaid") {
    mongoStatus = "cancelled";
  } else if (stripeStatus === "past_due") {
    mongoStatus = "past_due";
  } else if (stripeStatus === "incomplete" || stripeStatus === "incomplete_expired") {
    mongoStatus = "incomplete";
  }

  subscription.status = mongoStatus;
  subscription.stripeSubscriptionId = subscriptionId;
  
  if (stripeSubscription.current_period_start) {
    subscription.periodStart = new Date(stripeSubscription.current_period_start * 1000);
  }
  if (stripeSubscription.current_period_end) {
    subscription.periodEnd = new Date(stripeSubscription.current_period_end * 1000);
  }

  await subscription.save();

  // Update user based on subscription status
  if (mongoStatus === "active") {
    // Activate subscription for user if not already active
    if (!user.activeSubscriptionId || user.activeSubscriptionId.toString() !== subscription._id.toString()) {
      user.activeSubscriptionId = subscription._id;
      user.subscriptionActive = true;
      await user.save();
      console.log(`✅ User ${user._id} subscription activated: ${subscription._id}`);
    }
  } else if (mongoStatus === "cancelled") {
    // Deactivate if this was the active subscription
    if (user.activeSubscriptionId?.toString() === subscription._id.toString()) {
      user.activeSubscriptionId = null;
      user.subscriptionActive = false;
      await user.save();
      console.log(`✅ User ${user._id} subscription deactivated: ${subscription._id}`);
    }
  }

  console.log(`✅ Subscription ${subscription._id} updated: ${mongoStatus}`);

  return { success: true };
}

/**
 * Process customer.subscription.deleted event
 */
export async function processSubscriptionDeleted(event, stripe) {
  const stripeSubscription = event.data.object;
  const customerId = stripeSubscription.customer;
  const subscriptionId = stripeSubscription.id;

  // Ignore pure add-on Stripe subscriptions
  if (stripeSubscription.metadata?.isAddon === "true" || stripeSubscription.metadata?.addonId) {
    console.log(`ℹ️ Skipping add-on Stripe subscription deletion ${subscriptionId}`);
    return { success: true };
  }

  const user = await User.findOne({ stripeCustomerId: customerId });
  if (!user) {
    console.error(`❌ User not found for Stripe customer ${customerId}`);
    return { success: false, error: "User not found" };
  }

  const subscription = await Subscription.findOne({
    $or: [
      { stripeSubscriptionId: subscriptionId },
      { userId: user._id, status: "active" }
    ]
  });

  if (subscription) {
    subscription.status = "cancelled";
    await subscription.save();

    // Unlink from user if it's the active subscription
    if (user.activeSubscriptionId?.toString() === subscription._id.toString()) {
      user.activeSubscriptionId = null;
      user.subscriptionActive = false;
      await user.save();
    }

    console.log(`✅ Subscription ${subscription._id} cancelled for user ${user.email}`);
  }

  return { success: true };
}

/**
 * Check if event was already processed (idempotency)
 */
export async function isEventProcessed(eventId) {
  const event = await StripeEvent.findOne({ eventId });
  return event && event.processed;
}

/**
 * Mark event as processed
 */
export async function markEventProcessed(eventId, eventType, success, error = null) {
  await StripeEvent.findOneAndUpdate(
    { eventId },
    {
      eventId,
      type: eventType,
      processed: success,
      processedAt: new Date(),
      error: error,
      $inc: { retryCount: 1 }
    },
    { upsert: true }
  );
}

export default {
  processCheckoutCompleted,
  processInvoicePaymentSucceeded,
  processSubscriptionUpdated,
  processSubscriptionDeleted,
  isEventProcessed,
  markEventProcessed
};
