import express from "express";
import authenticateUser from "../middleware/authenticateUser.js";
import loadSubscription from "../middleware/loadSubscription.js";
import getTelnyxClient from "../services/telnyxService.js";
import PhoneNumber from "../models/PhoneNumber.js";
import User from "../models/User.js";

const router = express.Router();

/**
 * GET /api/numbers/search
 * Search for available numbers with STRICT cost filters
 * Only returns cheapest local numbers (carrier group A or B, no premium features)
 */
router.get(
  "/search",
  authenticateUser,
  loadSubscription,
  async (req, res) => {
    try {
      // HARD STOP — NO SUBSCRIPTION
      if (!req.subscription || !req.subscription.active) {
        return res.status(403).json({ error: "Active subscription required" });
      }

      // HARD STOP — LIMIT CHECK
      if (req.subscription.numbers.length >= 1) {
        return res.status(400).json({ error: "Number limit reached" });
      }

      const telnyx = getTelnyxClient();
      if (!telnyx) {
        return res.status(500).json({ error: "Telnyx not configured" });
      }

      const { areaCode, searchPattern } = req.query;
      
      // Build filter - STRICT COST CONTROL
      // Note: Telnyx API filter structure may vary, so we filter results after fetching
      const filter = {
        country_code: "US",
        features: ["voice", "sms"]
      };

      // Add area code filter if provided (Telnyx uses npa for area code)
      if (areaCode && /^\d{3}$/.test(areaCode)) {
        filter.npa = areaCode; // NPA = Numbering Plan Area (area code)
      }

      // Search for available numbers - get more results to filter client-side
      const available = await telnyx.availablePhoneNumbers.list({
        filter,
        page: { size: 100 } // Get more results to filter
      });

      if (!available.data || available.data.length === 0) {
        return res.json({ numbers: [] });
      }

      // STRICT FILTERING - Only allow cheapest numbers
      // This is the CRITICAL cost control layer
      const filteredNumbers = available.data
        .filter(num => {
          // Must have phone_number
          if (!num.phone_number) {
            return false;
          }

          // No toll-free numbers (check various field names)
          const numberType = num.number_type || num.type || num.region_information?.region_type;
          if (numberType === 'toll-free' || numberType === 'toll_free' || 
              num.toll_free === true || num.is_toll_free === true) {
            return false;
          }

          // Only local numbers (explicitly reject non-local)
          if (numberType && numberType !== 'local' && numberType !== 'geographic') {
            return false;
          }

          // No short codes (must be 10+ digits)
          const cleanNumber = num.phone_number.replace(/\D/g, '');
          if (cleanNumber.length < 10) {
            return false;
          }

          // Only carrier group A or B (cheapest tiers)
          // Check multiple possible field locations
          const carrierGroup = num.carrier?.group || 
                              num.carrier_group || 
                              num.carrier?.carrier_group ||
                              num.region_information?.carrier_group;
          if (carrierGroup && !['A', 'B', 'a', 'b'].includes(String(carrierGroup).toUpperCase())) {
            return false;
          }

          // No premium features (check various field names)
          const features = num.features || num.capabilities || [];
          if (Array.isArray(features)) {
            if (features.some(f => 
              f === 'hd_calling' || 
              f === 'premium_routing' || 
              f === 'premium' ||
              f === 'toll_free'
            )) {
              return false;
            }
          }
          if (num.premium === true || num.is_premium === true) {
            return false;
          }

          // Check monthly cost - CRITICAL: Hard block expensive numbers
          // Check multiple possible field locations for cost
          const monthlyCost = num.monthly_cost || 
                             num.monthly_rate || 
                             num.cost?.monthly ||
                             num.region_information?.monthly_cost ||
                             num.pricing?.monthly ||
                             0;
          if (monthlyCost > 2.00) {
            console.log(`🚫 Blocked expensive number ${num.phone_number}: $${monthlyCost}/month`);
            return false;
          }

          // Check messaging rate - CRITICAL: Block numbers with extra messaging fees
          const messagingRate = num.messaging_rate || 
                               num.cost?.messaging || 
                               num.pricing?.messaging ||
                               num.region_information?.messaging_rate ||
                               0;
          if (messagingRate > 0.01) {
            console.log(`🚫 Blocked number with high messaging rate ${num.phone_number}: $${messagingRate}/msg`);
            return false;
          }

          // Apply search pattern if provided
          if (searchPattern) {
            const pattern = searchPattern.replace(/\D/g, '');
            if (!cleanNumber.includes(pattern)) {
              return false;
            }
          }

          return true;
        })
        .map(num => ({
          phone_number: num.phone_number,
          monthly_cost: num.monthly_cost || num.monthly_rate || num.cost?.monthly || 0,
          carrier_group: num.carrier?.group || num.carrier_group || 'Unknown',
          region_information: num.region_information || null,
          features: num.features || []
        }))
        // Sort by monthly cost (cheapest first)
        .sort((a, b) => a.monthly_cost - b.monthly_cost)
        .slice(0, 20); // Limit to 20 cheapest results

      res.json({ 
        success: true,
        numbers: filteredNumbers,
        count: filteredNumbers.length
      });
    } catch (err) {
      console.error("SEARCH NUMBERS ERROR:", err);
      res.status(500).json({ error: "Failed to search numbers", details: err.message });
    }
  }
);

/**
 * POST /api/numbers/purchase
 * Purchase a SPECIFIC number with RE-VALIDATION
 */
router.post(
  "/purchase",
  authenticateUser,
  loadSubscription,
  async (req, res) => {
    try {
      // HARD STOP — NO SUBSCRIPTION
      if (!req.subscription || !req.subscription.active) {
        return res.status(403).json({ error: "Active subscription required" });
      }

      // HARD STOP — LIMIT CHECK
      if (req.subscription.numbers.length >= 1) {
        return res.status(400).json({ error: "Number limit reached" });
      }

      const { phoneNumber } = req.body;

      if (!phoneNumber) {
        return res.status(400).json({ error: "Phone number required" });
      }

      const telnyx = getTelnyxClient();
      if (!telnyx) {
        return res.status(500).json({ error: "Telnyx not configured" });
      }

      // RE-VALIDATE NUMBER BEFORE PURCHASE (CRITICAL FOR COST CONTROL)
      try {
        const numberDetails = await telnyx.availablePhoneNumbers.list({
          filter: { 
            country_code: "US",
            phone_number: phoneNumber
          }
        });

        if (!numberDetails.data.length) {
          return res.status(400).json({ error: "Number not available" });
        }

        const num = numberDetails.data[0];

        // HARD BLOCK CHECKS - Same logic as search endpoint for consistency
        // Must have phone_number
        if (!num.phone_number) {
          return res.status(400).json({ error: "Invalid number data" });
        }

        // No toll-free numbers
        const numberType = num.number_type || num.type || num.region_information?.region_type;
        if (numberType === 'toll-free' || numberType === 'toll_free' || 
            num.toll_free === true || num.is_toll_free === true) {
          return res.status(403).json({ 
            error: "Number not eligible: Toll-free numbers not allowed" 
          });
        }

        // Only local numbers
        if (numberType && numberType !== 'local' && numberType !== 'geographic') {
          return res.status(403).json({ 
            error: "Number not eligible: Only local numbers allowed" 
          });
        }

        // No short codes
        const cleanNumber = num.phone_number.replace(/\D/g, '');
        if (cleanNumber.length < 10) {
          return res.status(403).json({ 
            error: "Number not eligible: Short codes not allowed" 
          });
        }

        // Only carrier group A or B
        const carrierGroup = num.carrier?.group || 
                            num.carrier_group || 
                            num.carrier?.carrier_group ||
                            num.region_information?.carrier_group;
        if (carrierGroup && !['A', 'B', 'a', 'b'].includes(String(carrierGroup).toUpperCase())) {
          return res.status(403).json({ 
            error: `Number not eligible: Carrier group ${carrierGroup} not allowed (only A or B allowed)` 
          });
        }

        // No premium features
        const features = num.features || num.capabilities || [];
        if (Array.isArray(features)) {
          if (features.some(f => 
            f === 'hd_calling' || 
            f === 'premium_routing' || 
            f === 'premium' ||
            f === 'toll_free'
          )) {
            return res.status(403).json({ 
              error: "Number not eligible: Premium features not allowed" 
            });
          }
        }
        if (num.premium === true || num.is_premium === true) {
          return res.status(403).json({ 
            error: "Number not eligible: Premium number not allowed" 
          });
        }

        // Check monthly cost - CRITICAL
        const monthlyCost = num.monthly_cost || 
                           num.monthly_rate || 
                           num.cost?.monthly ||
                           num.region_information?.monthly_cost ||
                           num.pricing?.monthly ||
                           0;
        if (monthlyCost > 2.00) {
          return res.status(403).json({ 
            error: `Number not eligible: Monthly cost ($${monthlyCost.toFixed(2)}) exceeds $2.00 limit` 
          });
        }

        // Check messaging rate - CRITICAL
        const messagingRate = num.messaging_rate || 
                             num.cost?.messaging || 
                             num.pricing?.messaging ||
                             num.region_information?.messaging_rate ||
                             0;
        if (messagingRate > 0.01) {
          return res.status(403).json({ 
            error: `Number not eligible: Messaging rate ($${messagingRate.toFixed(4)}) exceeds $0.01 limit` 
          });
        }

      } catch (validationErr) {
        console.error("Number validation error:", validationErr);
        return res.status(400).json({ 
          error: "Failed to validate number eligibility",
          details: validationErr.message 
        });
      }

      const user = await User.findById(req.user._id);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      // Ensure messaging profile with webhook URL
      const webhookUrl = process.env.BACKEND_URL 
        ? `${process.env.BACKEND_URL}/api/webhooks/telnyx/sms`
        : null;

      if (!user.messagingProfileId) {
        const profileData = {
          name: `user-${user._id}`,
          whitelisted_destinations: ["US", "CA"]
        };

        if (webhookUrl) {
          profileData.webhook_url = webhookUrl;
          profileData.webhook_failover_url = webhookUrl;
          profileData.webhook_api_version = "2";
        }

        const profile = await telnyx.messaging.messagingProfiles.create(profileData);
        user.messagingProfileId = profile.data.id;
        await user.save();
        
        console.log(`✅ Created messaging profile ${profile.data.id} for user ${user._id}`);
      } else if (webhookUrl) {
        try {
          await telnyx.messaging.messagingProfiles.update(user.messagingProfileId, {
            webhook_url: webhookUrl,
            webhook_failover_url: webhookUrl,
            webhook_api_version: "2"
          });
        } catch (updateErr) {
          console.warn(`⚠️ Could not update messaging profile webhook:`, updateErr.message);
        }
      }

      // PURCHASE NUMBER (ONLY AFTER ALL VALIDATIONS PASSED)
      const order = await telnyx.numberOrders.create({
        phone_numbers: [{ phone_number: phoneNumber }]
      });

      // SAVE IMMEDIATELY
      await PhoneNumber.create({
        userId: user._id,
        phoneNumber,
        telnyxPhoneNumberId: order.data.id,
        messagingProfileId: user.messagingProfileId,
        status: "active"
      });

      // ATTACH TO MESSAGING PROFILE
      await telnyx.messaging.messagingProfiles.phoneNumbers.create(
        user.messagingProfileId,
        { phone_number: phoneNumber }
      );

      // CONFIGURE VOICE - Set connection ID for incoming calls
      const connectionId = process.env.TELNYX_CONNECTION_ID;
      if (connectionId) {
        try {
          await telnyx.phoneNumbers.update(phoneNumber, {
            connection_id: connectionId
          });
          console.log(`✅ Voice connection ${connectionId} set for ${phoneNumber}`);
        } catch (voiceErr) {
          console.warn(`⚠️ Could not set voice connection:`, voiceErr.message);
        }
      }

      res.json({ success: true, phoneNumber });
    } catch (err) {
      console.error("PURCHASE NUMBER ERROR:", err);
      res.status(500).json({ error: "Failed to purchase number", details: err.message });
    }
  }
);

/**
 * POST /api/numbers/buy
 * DEPRECATED: Use /api/numbers/purchase instead
 * Kept for backward compatibility but disabled auto-assignment
 */
router.post(
  "/buy",
  authenticateUser,
  loadSubscription,
  async (req, res) => {
    try {
      // HARD STOP — NO SUBSCRIPTION
      if (!req.subscription || !req.subscription.active) {
        return res.status(403).json({ error: "Active subscription required" });
      }

      // HARD STOP — LIMIT CHECK
      if (req.subscription.numbers.length >= 1) {
        return res.status(400).json({ error: "Number limit reached" });
      }

      const telnyx = getTelnyxClient();
      if (!telnyx) {
        return res.status(500).json({ error: "Telnyx not configured" });
      }

      const user = await User.findById(req.user._id);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      // Ensure messaging profile with webhook URL
      const webhookUrl = process.env.BACKEND_URL 
        ? `${process.env.BACKEND_URL}/api/webhooks/telnyx/sms`
        : null;

      if (!user.messagingProfileId) {
        const profileData = {
          name: `user-${user._id}`,
          whitelisted_destinations: ["US", "CA"]
        };

        // Add webhook URL if backend URL is configured
        if (webhookUrl) {
          profileData.webhook_url = webhookUrl;
          profileData.webhook_failover_url = webhookUrl;
          profileData.webhook_api_version = "2";
        }

        const profile = await telnyx.messaging.messagingProfiles.create(profileData);

        user.messagingProfileId = profile.data.id;
        await user.save();
        
        console.log(`✅ Created messaging profile ${profile.data.id} for user ${user._id}`);
        if (webhookUrl) {
          console.log(`✅ Webhook URL set to: ${webhookUrl}`);
        } else {
          console.warn(`⚠️ No BACKEND_URL set - inbound SMS won't work!`);
        }
      } else {
        // Update existing profile with webhook URL if not set
        if (webhookUrl) {
          try {
            await telnyx.messaging.messagingProfiles.update(user.messagingProfileId, {
              webhook_url: webhookUrl,
              webhook_failover_url: webhookUrl,
              webhook_api_version: "2"
            });
            console.log(`✅ Updated webhook URL for existing profile ${user.messagingProfileId}`);
          } catch (updateErr) {
            console.warn(`⚠️ Could not update messaging profile webhook:`, updateErr.message);
          }
        }
      }

      // AUTO-ASSIGNMENT DISABLED FOR COST CONTROL
      // Users must explicitly select a number via /api/numbers/search and /api/numbers/purchase
      return res.status(400).json({ 
        error: "Auto-assignment disabled. Please use /api/numbers/search to find available numbers and /api/numbers/purchase to buy a specific number."
      });

      // BUY NUMBER (ONLY AFTER ALL CHECKS PASSED)
      const order = await telnyx.numberOrders.create({
        phone_numbers: [{ phone_number: phoneNumber }]
      });

      // SAVE IMMEDIATELY
      await PhoneNumber.create({
        userId: user._id,
        phoneNumber,
        telnyxPhoneNumberId: order.data.id,
        messagingProfileId: user.messagingProfileId,
        status: "active"
      });

      // ATTACH TO MESSAGING PROFILE
      await telnyx.messaging.messagingProfiles.phoneNumbers.create(
        user.messagingProfileId,
        { phone_number: phoneNumber }
      );

      // CONFIGURE VOICE - Set connection ID for incoming calls
      const connectionId = process.env.TELNYX_CONNECTION_ID;
      if (connectionId) {
        try {
          // Update the phone number to use our voice connection
          await telnyx.phoneNumbers.update(phoneNumber, {
            connection_id: connectionId
          });
          console.log(`✅ Voice connection ${connectionId} set for ${phoneNumber}`);
        } catch (voiceErr) {
          console.warn(`⚠️ Could not set voice connection:`, voiceErr.message);
        }
      } else {
        console.warn(`⚠️ TELNYX_CONNECTION_ID not set - incoming calls won't work!`);
      }

      res.json({ success: true, phoneNumber });
    } catch (err) {
      console.error("BUY NUMBER ERROR:", err);
      res.status(500).json({ error: "Failed to buy number" });
    }
  }
);

/**
 * POST /api/numbers/fix-voice
 * Fix voice connection for existing phone numbers
 */
router.post(
  "/fix-voice",
  authenticateUser,
  loadSubscription,
  async (req, res) => {
    try {
      const telnyx = getTelnyxClient();
      if (!telnyx) {
        return res.status(500).json({ error: "Telnyx not configured" });
      }

      const connectionId = process.env.TELNYX_CONNECTION_ID;
      if (!connectionId) {
        return res.status(500).json({ 
          error: "TELNYX_CONNECTION_ID not configured",
          hint: "Set TELNYX_CONNECTION_ID environment variable"
        });
      }

      // Find user's active phone numbers
      const phoneNumbers = await PhoneNumber.find({ 
        userId: req.user._id, 
        status: "active" 
      });

      if (phoneNumbers.length === 0) {
        return res.status(400).json({ error: "No active phone numbers found" });
      }

      const results = [];
      for (const pn of phoneNumbers) {
        try {
          await telnyx.phoneNumbers.update(pn.phoneNumber, {
            connection_id: connectionId
          });
          results.push({ phoneNumber: pn.phoneNumber, status: "updated" });
          console.log(`✅ Voice connection set for ${pn.phoneNumber}`);
        } catch (err) {
          results.push({ phoneNumber: pn.phoneNumber, status: "failed", error: err.message });
          console.error(`❌ Failed to update ${pn.phoneNumber}:`, err.message);
        }
      }

      res.json({ 
        success: true, 
        message: "Voice connections updated",
        connectionId,
        results
      });
    } catch (err) {
      console.error("FIX VOICE ERROR:", err);
      res.status(500).json({ error: "Failed to fix voice connection", details: err.message });
    }
  }
);

/**
 * POST /api/numbers/fix-messaging
 * Fix messaging profile webhook URL for existing users
 */
router.post(
  "/fix-messaging",
  authenticateUser,
  loadSubscription,
  async (req, res) => {
    try {
      const telnyx = getTelnyxClient();
      if (!telnyx) {
        return res.status(500).json({ error: "Telnyx not configured" });
      }

      const user = await User.findById(req.user._id);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      if (!user.messagingProfileId) {
        return res.status(400).json({ error: "No messaging profile found. Buy a number first." });
      }

      const webhookUrl = process.env.BACKEND_URL 
        ? `${process.env.BACKEND_URL}/api/webhooks/telnyx/sms`
        : null;

      if (!webhookUrl) {
        return res.status(500).json({ 
          error: "BACKEND_URL not configured. Cannot set webhook URL.",
          hint: "Set BACKEND_URL environment variable to your public API URL"
        });
      }

      // Update the messaging profile with webhook URL
      const updated = await telnyx.messaging.messagingProfiles.update(user.messagingProfileId, {
        webhook_url: webhookUrl,
        webhook_failover_url: webhookUrl,
        webhook_api_version: "2"
      });

      console.log(`✅ Fixed messaging profile ${user.messagingProfileId} for user ${user._id}`);
      console.log(`✅ Webhook URL: ${webhookUrl}`);

      res.json({ 
        success: true, 
        message: "Messaging profile updated",
        messagingProfileId: user.messagingProfileId,
        webhookUrl: webhookUrl
      });
    } catch (err) {
      console.error("FIX MESSAGING ERROR:", err);
      res.status(500).json({ error: "Failed to fix messaging profile", details: err.message });
    }
  }
);

/**
 * GET /api/numbers/check-messaging
 * Check messaging profile status
 */
router.get(
  "/check-messaging",
  authenticateUser,
  loadSubscription,
  async (req, res) => {
    try {
      const telnyx = getTelnyxClient();
      if (!telnyx) {
        return res.status(500).json({ error: "Telnyx not configured" });
      }

      const user = await User.findById(req.user._id);
      if (!user || !user.messagingProfileId) {
        return res.json({ 
          success: true,
          hasProfile: false,
          message: "No messaging profile configured"
        });
      }

      // Get the messaging profile details from Telnyx
      const profile = await telnyx.messaging.messagingProfiles.retrieve(user.messagingProfileId);
      
      const phone = await PhoneNumber.findOne({ userId: user._id, status: "active" });

      res.json({ 
        success: true,
        hasProfile: true,
        messagingProfileId: user.messagingProfileId,
        webhookUrl: profile.data.webhook_url || null,
        webhookApiVersion: profile.data.webhook_api_version || null,
        phoneNumber: phone?.phoneNumber || null,
        phoneNumberHasProfile: !!phone?.messagingProfileId,
        expectedWebhookUrl: process.env.BACKEND_URL 
          ? `${process.env.BACKEND_URL}/api/webhooks/telnyx/sms`
          : "BACKEND_URL not set"
      });
    } catch (err) {
      console.error("CHECK MESSAGING ERROR:", err);
      res.status(500).json({ error: "Failed to check messaging profile", details: err.message });
    }
  }
);

/**
 * POST /api/numbers/fix-all
 * Fix both voice and messaging for all user's phone numbers
 */
router.post(
  "/fix-all",
  authenticateUser,
  loadSubscription,
  async (req, res) => {
    try {
      const telnyx = getTelnyxClient();
      if (!telnyx) {
        return res.status(500).json({ error: "Telnyx not configured" });
      }

      const user = await User.findById(req.user._id);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      const connectionId = process.env.TELNYX_CONNECTION_ID;
      const webhookUrl = process.env.BACKEND_URL 
        ? `${process.env.BACKEND_URL}/api/webhooks/telnyx/sms`
        : null;

      const results = {
        voice: { fixed: false, error: null },
        messaging: { fixed: false, error: null },
        numbers: []
      };

      // Fix messaging profile
      if (user.messagingProfileId && webhookUrl) {
        try {
          await telnyx.messaging.messagingProfiles.update(user.messagingProfileId, {
            webhook_url: webhookUrl,
            webhook_failover_url: webhookUrl,
            webhook_api_version: "2"
          });
          results.messaging.fixed = true;
          console.log(`✅ Messaging webhook fixed for user ${user._id}`);
        } catch (err) {
          results.messaging.error = err.message;
        }
      }

      // Fix voice for all numbers
      if (connectionId) {
        const phoneNumbers = await PhoneNumber.find({ 
          userId: req.user._id, 
          status: "active" 
        });

        for (const pn of phoneNumbers) {
          try {
            await telnyx.phoneNumbers.update(pn.phoneNumber, {
              connection_id: connectionId
            });
            results.numbers.push({ phoneNumber: pn.phoneNumber, voiceFixed: true });
            console.log(`✅ Voice fixed for ${pn.phoneNumber}`);
          } catch (err) {
            results.numbers.push({ phoneNumber: pn.phoneNumber, voiceFixed: false, error: err.message });
          }
        }
        results.voice.fixed = results.numbers.some(n => n.voiceFixed);
      }

      res.json({ 
        success: true, 
        message: "Configuration fixed",
        connectionId: connectionId || "NOT SET",
        webhookUrl: webhookUrl || "NOT SET",
        results
      });
    } catch (err) {
      console.error("FIX ALL ERROR:", err);
      res.status(500).json({ error: "Failed to fix configuration", details: err.message });
    }
  }
);

/**
 * GET /api/numbers/check-all
 * Check both voice and messaging configuration
 */
router.get(
  "/check-all",
  authenticateUser,
  loadSubscription,
  async (req, res) => {
    try {
      const telnyx = getTelnyxClient();
      if (!telnyx) {
        return res.status(500).json({ error: "Telnyx not configured" });
      }

      const user = await User.findById(req.user._id);
      const phoneNumbers = await PhoneNumber.find({ 
        userId: req.user._id, 
        status: "active" 
      });

      const config = {
        user: user?._id,
        messagingProfileId: user?.messagingProfileId || null,
        messagingWebhook: null,
        connectionId: process.env.TELNYX_CONNECTION_ID || "NOT SET",
        backendUrl: process.env.BACKEND_URL || "NOT SET",
        expectedWebhookUrl: process.env.BACKEND_URL 
          ? `${process.env.BACKEND_URL}/api/webhooks/telnyx/sms`
          : "BACKEND_URL not set",
        numbers: []
      };

      // Check messaging profile
      if (user?.messagingProfileId) {
        try {
          const profile = await telnyx.messaging.messagingProfiles.retrieve(user.messagingProfileId);
          config.messagingWebhook = profile.data.webhook_url || "NOT SET";
        } catch (e) {
          config.messagingWebhook = "ERROR: " + e.message;
        }
      }

      // Check each phone number's voice configuration
      for (const pn of phoneNumbers) {
        try {
          const numDetails = await telnyx.phoneNumbers.retrieve(pn.phoneNumber);
          config.numbers.push({
            phoneNumber: pn.phoneNumber,
            connectionId: numDetails.data.connection_id || "NOT SET",
            voiceEnabled: !!numDetails.data.connection_id
          });
        } catch (e) {
          config.numbers.push({
            phoneNumber: pn.phoneNumber,
            error: e.message
          });
        }
      }

      res.json({ success: true, config });
    } catch (err) {
      console.error("CHECK ALL ERROR:", err);
      res.status(500).json({ error: "Failed to check configuration", details: err.message });
    }
  }
);

/**
 * GET /api/numbers/webhook-urls
 * Show the expected webhook URLs that should be configured in Telnyx
 */
router.get("/webhook-urls", async (req, res) => {
  const backendUrl = process.env.BACKEND_URL || "YOUR_BACKEND_URL";
  
  res.json({
    success: true,
    info: "Configure these URLs in your Telnyx dashboard",
    webhooks: {
      voiceWebhook: `${backendUrl}/api/webhooks/telnyx/voice`,
      smsWebhook: `${backendUrl}/api/webhooks/telnyx/sms`,
      voiceWebhookDescription: "Set this on your Telnyx Connection (TeXML App or SIP Connection)",
      smsWebhookDescription: "Set this on your Messaging Profile (automatically set when buying numbers)"
    },
    configuration: {
      backendUrl: process.env.BACKEND_URL || "NOT SET",
      connectionId: process.env.TELNYX_CONNECTION_ID || "NOT SET",
      sipUsername: process.env.TELNYX_SIP_USERNAME ? "SET" : "NOT SET",
      telnyxApiKey: process.env.TELNYX_API_KEY ? "SET" : "NOT SET"
    }
  });
});

export default router;
