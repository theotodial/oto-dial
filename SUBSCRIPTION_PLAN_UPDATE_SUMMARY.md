# Subscription Plan Logic Update - Implementation Summary

## ✅ Completed Changes

### 1. **Plan Model Updated** (`backend/src/models/Plan.js`)
- Added `stripeProductId` and `stripePriceId` fields
- Changed `status` enum to `active` boolean for consistency

### 2. **Stripe Checkout Route Updated** (`backend/src/routes/stripeCheckoutRoutes.js`)
- Now accepts `planId` (MongoDB plan ID) instead of `planKey`
- Uses existing Stripe price ID from MongoDB plan: `price_1SlbCBCxZc7GK7QKVTtMnI97`
- Stores `planId` and `planName` in checkout session metadata
- Validates plan has Stripe configuration before creating checkout

### 3. **Stripe Webhook Service Updated** (`backend/src/services/stripeSubscriptionService.js`)
- `processCheckoutCompleted`: Fetches plan from MongoDB using `planId` from metadata
- No longer creates default plans - requires planId in metadata
- Limits are ALWAYS fetched from MongoDB plan (single source of truth)
- Updated fallback logic in `processSubscriptionUpdated` to use "Basic Plan" instead of "basic"

### 4. **Admin Subscription Actions Updated** (`backend/src/routes/admin/adminActions.js`)
- `assign`: Creates Stripe subscription using plan's `stripePriceId`
- `change-plan`: Updates Stripe subscription to new price ID
- Both operations sync MongoDB and Stripe atomically
- Stores planId in Stripe subscription metadata

### 5. **Admin Subscription Repair Updated** (`backend/src/routes/admin/adminSubscriptionRepair.js`)
- Tries to get planId from Stripe subscription metadata first
- Falls back to "Basic Plan" if metadata not found
- Uses plan name instead of hardcoded "basic"

### 6. **Public Plans API Endpoint** (`backend/src/routes/subscription.js`)
- Added `GET /api/subscription/plans` endpoint
- Returns all active plans with limits
- Used by frontend to display pricing

### 7. **Frontend Billing Page Updated** (`frontend/src/pages/Billing.jsx`)
- Fetches plans from API instead of hardcoded array
- Shows Basic Plan ($19.99) and Super Plan ($29.99)
- Displays current subscription status
- Sends MongoDB `planId` to checkout endpoint

### 8. **Homepage Pricing Section Updated** (`frontend/src/components/homepage/NewPricingSection.jsx`)
- Fetches plans dynamically from API
- Shows Basic and Super plans with correct limits
- Links to billing page for subscription

### 9. **Plan Initialization Script** (`backend/scripts/initializePlans.js`)
- Script to create/update the two required plans in MongoDB
- Uses existing Stripe IDs: `prod_Tj3I37A5KEUqJG` and `price_1SlbCBCxZc7GK7QKVTtMnI97`

## 📋 Required Plans in MongoDB

### Basic Plan
```json
{
  "name": "Basic Plan",
  "price": 19.99,
  "currency": "USD",
  "stripeProductId": "prod_Tj3I37A5KEUqJG",
  "stripePriceId": "price_1SlbCBCxZc7GK7QKVTtMnI97",
  "limits": {
    "minutesTotal": 1500,
    "smsTotal": 100,
    "numbersTotal": 1
  },
  "active": true
}
```

### Super Plan
```json
{
  "name": "Super Plan",
  "price": 29.99,
  "currency": "USD",
  "stripeProductId": "prod_Tj3I37A5KEUqJG",
  "stripePriceId": "price_1SlbCBCxZc7GK7QKVTtMnI97",
  "limits": {
    "minutesTotal": 2500,
    "smsTotal": 200,
    "numbersTotal": 1
  },
  "active": true
}
```

## 🚀 Next Steps

### 1. Initialize Plans in MongoDB
Run the initialization script:
```bash
cd backend
node scripts/initializePlans.js
```

Or manually create the plans using MongoDB shell or admin interface.

### 2. Verify Stripe Configuration
- Ensure `STRIPE_SECRET_KEY` is set in environment
- Ensure `STRIPE_WEBHOOK_SECRET` is configured
- Verify webhook endpoint is registered in Stripe dashboard

### 3. Test Flow
1. **User selects plan** → Frontend sends `planId` to `/api/stripe/checkout`
2. **Checkout created** → Uses `price_1SlbCBCxZc7GK7QKVTtMnI97` (same for both plans)
3. **Metadata stored** → `planId` (MongoDB ID) stored in checkout session
4. **Webhook received** → `checkout.session.completed` extracts `planId`
5. **Plan fetched** → MongoDB plan fetched using `planId`
6. **Limits applied** → Limits from MongoDB plan applied to subscription

### 4. Admin Testing
- Test admin plan assignment
- Test plan change functionality
- Verify Stripe subscriptions are created correctly

## ⚠️ Critical Points

1. **DO NOT create new Stripe products or prices** - Use existing IDs only
2. **MongoDB is single source of truth** - Limits come from MongoDB, not Stripe
3. **planId in metadata** - Always store MongoDB planId in Stripe metadata
4. **Same Stripe price for both plans** - Differentiation happens via planId
5. **Webhook must extract planId** - Never infer plan from Stripe price

## 🔍 Verification Checklist

- [ ] Plans initialized in MongoDB with correct Stripe IDs
- [ ] Checkout flow sends planId correctly
- [ ] Webhook extracts planId from metadata
- [ ] Limits applied from MongoDB plan
- [ ] Admin assignment creates Stripe subscription
- [ ] Plan switching works correctly
- [ ] Frontend displays correct plan details
- [ ] No duplicate subscriptions created

## 📝 Notes

- Both plans share the same Stripe product and price IDs
- Plan differentiation is handled entirely in MongoDB
- The `planKey` field in Subscription model is kept for backward compatibility but uses plan name
- All limits are stored in MongoDB Plan documents, never in Stripe metadata
