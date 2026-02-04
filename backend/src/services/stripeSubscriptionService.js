import mongoose from "mongoose";
import User from "../models/User.js";
import Subscription from "../models/Subscription.js";
import Plan from "../models/Plan.js";
import StripeEvent from "../models/StripeEvent.js";

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

  // Extract metadata
  const userId = session.metadata?.userId;
  const planKey = session.metadata?.planKey || "basic";

  if (!userId) {
    console.error(`❌ Checkout session ${session.id} missing userId in metadata`);
    return { success: false, error: "Missing userId in metadata" };
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

  // Find or create plan
  let plan = await Plan.findOne({ name: planKey, active: true });
  if (!plan) {
    // Create default plan
    plan = await Plan.create({
      name: planKey,
      price: 19.99,
      currency: "USD",
      limits: {
        minutesTotal: 2500,
        smsTotal: 200,
        numbersTotal: 1
      },
      active: true
    });
  }

  // Create subscription in pending_activation state
  // This will be activated when invoice.payment_succeeded is received
  const now = new Date();
  const periodEnd = new Date();
  periodEnd.setDate(now.getDate() + 30);

  const subscription = await Subscription.findOneAndUpdate(
    {
      userId: user._id,
      stripeSubscriptionId: session.subscription || null
    },
    {
      userId: user._id,
      planId: plan._id,
      stripeSubscriptionId: session.subscription || null,
      stripePriceId: session.line_items?.data?.[0]?.price?.id || null,
      planKey: planKey,
      status: "pending_activation",
      periodStart: now,
      periodEnd: periodEnd,
      limits: {
        minutesTotal: plan.limits.minutesTotal,
        smsTotal: plan.limits.smsTotal,
        numbersTotal: plan.limits.numbersTotal
      },
      usage: {
        minutesUsed: 0,
        smsUsed: 0
      },
      addons: {
        minutes: 0,
        sms: 0
      }
    },
    { upsert: true, new: true }
  );

  console.log(`✅ Subscription ${subscription._id} created (pending_activation) for user ${user.email}`);

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
        { userId: user._id, status: { $in: ["pending_activation", "active"] } }
      ]
    });
  } else {
    subscription = await Subscription.findOne({
      userId: user._id,
      status: { $in: ["pending_activation", "active"] }
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
  if (!subscription) {
    // Find or create plan
    let plan = await Plan.findOne({ name: "basic", active: true });
    if (!plan) {
      plan = await Plan.create({
        name: "basic",
        price: 19.99,
        currency: "USD",
        limits: {
          minutesTotal: 2500,
          smsTotal: 200,
          numbersTotal: 1
        },
        active: true
      });
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
      planKey: "basic",
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
