# Telnyx Cost Engine Implementation Guide

## ✅ Completed

1. **Pricing Configuration** (`backend/src/config/telnyxPricingSource.js`)
   - Voice pricing (per second)
   - SMS pricing (per message)
   - Number pricing (monthly)
   - Helper functions for cost calculation

2. **MongoDB Models**
   - `TelnyxPricing` - Admin-defined pricing from official Telnyx sources
   - `TelnyxCost` - Immutable cost ledger
   - `AdminUser` - Admin team management with roles

3. **Cost Calculator Service** (`backend/src/services/telnyxCostCalculator.js`)
   - `recordCallCost()` - Records call costs including ringing
   - `recordSmsCost()` - Records SMS costs
   - `recordNumberDailyCost()` - Records daily number accrual
   - `getTotalCosts()` - Aggregates costs for analytics

4. **User Deletion Route** (`backend/src/routes/admin/adminUsers.js`)
   - DELETE `/api/admin/users/:id` - Permanently deletes user and all data

## 🔄 Remaining Tasks

### 1. Update Cost Recording in Webhooks

**File: `backend/src/routes/webhooks/telnyxVoice.js`**
- After call ends, call `recordCallCost()` from `telnyxCostCalculator.js`
- Include ringing seconds, answered seconds, and billed seconds

**File: `backend/src/routes/webhooks/telnyxSms.js`**
- After SMS received/sent, call `recordSmsCost()` from `telnyxCostCalculator.js`

**File: `backend/src/routes/telnyxNumbers.js`**
- After number purchase, set up daily accrual job or call `recordNumberDailyCost()` daily

### 2. Update Admin Analytics

**File: `backend/src/routes/admin/adminAnalyticsEnhanced.js`**
- Replace cost calculations with aggregation from `TelnyxCost` collection
- Use `getTotalCosts()` or direct MongoDB aggregation
- Remove all hardcoded pricing logic

### 3. Admin Dashboard Frontend Updates

**File: `frontend/src/pages/admin/AdminDashboardEnterprise.jsx`**

#### Mobile Navigation:
- Convert header to sidebar on mobile (< 1024px)
- Keep time period filters (7d, 30d, 60d, 90d, All) at top
- Add hamburger menu for mobile sidebar

#### Header Updates:
- Replace "OTO DIAL" text with logo image + "Admin"
- Remove "Enterprise Analytics Dashboard" subtitle
- Logo should be in `frontend/public/logo.png` or similar

### 4. Admin Team Management

**Create: `frontend/src/pages/admin/AdminTeam.jsx`**
- List all admin users
- Invite new admin (email + role)
- Edit admin roles/permissions
- Deactivate admin accounts

**Create: `backend/src/routes/admin/adminTeam.js`**
- GET `/api/admin/team` - List all admins
- POST `/api/admin/team/invite` - Invite new admin
- PUT `/api/admin/team/:id` - Update admin role
- DELETE `/api/admin/team/:id` - Deactivate admin

### 5. User Deletion Frontend

**File: `frontend/src/pages/admin/AdminUserDetail.jsx`**
- Add "Delete User Permanently" button
- Show confirmation dialog
- Call DELETE `/api/admin/users/:id`
- Handle success/error states

## 📋 Implementation Priority

1. **High Priority:**
   - Update admin analytics to use TelnyxCost collection
   - Update webhooks to record costs
   - Admin dashboard mobile navigation

2. **Medium Priority:**
   - Admin header logo update
   - User deletion frontend

3. **Low Priority:**
   - Admin team management (can be done later)

## 🔍 Key Files to Modify

### Backend:
- `backend/src/routes/webhooks/telnyxVoice.js` - Add cost recording
- `backend/src/routes/webhooks/telnyxSms.js` - Add cost recording
- `backend/src/routes/admin/adminAnalyticsEnhanced.js` - Use TelnyxCost
- `backend/src/routes/admin/adminTeam.js` - Create admin management

### Frontend:
- `frontend/src/pages/admin/AdminDashboardEnterprise.jsx` - Mobile nav + header
- `frontend/src/pages/admin/AdminUserDetail.jsx` - Delete user button
- `frontend/src/pages/admin/AdminTeam.jsx` - Create new page

## ⚠️ Important Notes

1. **Cost Recording**: Costs must be recorded IMMEDIATELY when events occur (webhooks)
2. **No Recalculation**: Never recalculate past costs - they're immutable
3. **Pricing Updates**: When admin updates pricing, only NEW events use new prices
4. **Admin-Only**: Telnyx pricing should NEVER be exposed to end users
