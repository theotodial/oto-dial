import mongoose from "mongoose";
import AnalyticsVisitor from "../../models/analytics/AnalyticsVisitor.js";
import AnalyticsSession from "../../models/analytics/AnalyticsSession.js";
import AnalyticsPageView from "../../models/analytics/AnalyticsPageView.js";
import AnalyticsEvent from "../../models/analytics/AnalyticsEvent.js";
import {
  getInternalHostSet,
  resolveTrafficSource
} from "./attributionService.js";
import {
  extractClientIp,
  lookupGeo,
  parseUserAgent
} from "./enrichmentService.js";
import {
  recordLiveHit,
  recordLiveSms,
  recordLiveCall,
  upsertLiveSession
} from "./analyticsLiveService.js";
import { wasVisitorInserted } from "./visitorClassificationService.js";
import {
  ANALYTICS_EVENTS,
  SIGNUP_EVENTS,
  REVENUE_EVENTS,
  SUBSCRIPTION_EVENTS,
  CALL_EVENTS,
  ERROR_EVENTS
} from "../../constants/analyticsEvents.js";

const MAX_HITS_PER_BATCH = 50;

function toStr(value) {
  if (value === undefined || value === null) return null;
  const s = String(value).trim();
  return s.length ? s : null;
}

function clampString(value, max = 512) {
  const s = toStr(value);
  if (!s) return null;
  return s.length > max ? s.slice(0, max) : s;
}

function isValidObjectId(value) {
  return value && mongoose.Types.ObjectId.isValid(String(value));
}

/**
 * Ingest a batch of analytics hits from a single client.
 * Never throws; logs and continues so tracking can never break navigation.
 */
export async function ingestBatch(req, payload = {}) {
  try {
    const visitorId = clampString(payload.visitorId, 80);
    const sessionId = clampString(payload.sessionId, 100);
    if (!visitorId || !sessionId) return { ok: false, reason: "missing_ids" };

    const context = payload.context || {};
    const userId = isValidObjectId(payload.userId) ? String(payload.userId) : null;

    const hits = Array.isArray(payload.hits)
      ? payload.hits.slice(0, MAX_HITS_PER_BATCH)
      : [];
    if (hits.length === 0) return { ok: true, processed: 0 };

    // --- Enrichment (once per batch) ---
    const ipAddress = extractClientIp(req);
    const userAgent = clampString(context.userAgent || req.headers["user-agent"], 512);
    const geo = lookupGeo(ipAddress);
    const { device, browser, os, deviceBrand } = parseUserAgent(userAgent);

    const referrer = clampString(context.referrer, 1024);
    const landingPage = clampString(context.landingUrl || context.landingPage, 1024);
    const currentPage = clampString(context.page, 1024);

    const attribution = resolveTrafficSource(
      {
        referrer,
        userAgent,
        page: currentPage,
        landingUrl: landingPage,
        utmSource: context.utmSource,
        utmMedium: context.utmMedium,
        utmCampaign: context.utmCampaign,
        utmTerm: context.utmTerm,
        utmContent: context.utmContent,
        gclid: context.gclid,
        fbclid: context.fbclid,
        ttclid: context.ttclid,
        msclkid: context.msclkid,
        twclid: context.twclid,
        scid: context.scid,
        sourceHint: context.sourceHint
      },
      getInternalHostSet()
    );

    const now = new Date();

    // --- Visitor upsert (detect new vs returning) ---
    const visitorRaw = await AnalyticsVisitor.findOneAndUpdate(
      { visitorId },
      {
        $setOnInsert: {
          visitorId,
          firstSeenAt: now,
          firstTouch: {
            channel: attribution.channel,
            source: attribution.source,
            medium: attribution.medium,
            campaign: attribution.campaign,
            referrer: attribution.referrer,
            landingPage: attribution.landingPage
          }
        },
        $set: {
          lastSeenAt: now,
          lastTouch: {
            channel: attribution.channel,
            source: attribution.source,
            medium: attribution.medium,
            campaign: attribution.campaign,
            referrer: attribution.referrer,
            landingPage: attribution.landingPage
          },
          country: geo.country,
          countryCode: geo.countryCode,
          city: geo.city,
          region: geo.region,
          device,
          browser,
          os
        }
      },
      { upsert: true, new: false, rawResult: true }
    );
    const visitorIsNew = wasVisitorInserted(visitorRaw);

    // --- Session upsert (resolve attribution + new/returning at insert) ---
    const gaClientId = clampString(context.gaClientId, 120);
    const visitorType = userId ? "signed_in" : "anonymous";

    const sessionRaw = await AnalyticsSession.findOneAndUpdate(
      { sessionId },
      {
        $setOnInsert: {
          sessionId,
          visitorId,
          startedAt: now,
          isReturning: !visitorIsNew,
          entryPage: currentPage,
          channel: attribution.channel,
          source: attribution.source,
          medium: attribution.medium,
          campaign: attribution.campaign,
          term: attribution.term,
          content: attribution.content,
          referrer: attribution.referrer,
          landingPage: attribution.landingPage,
          socialPlatform: attribution.socialPlatform,
          influencerHandle: attribution.influencerHandle,
          attributionMethod: attribution.attributionMethod,
          utmSource: attribution.utmSource,
          utmMedium: attribution.utmMedium,
          utmCampaign: attribution.utmCampaign,
          gclid: attribution.gclid,
          fbclid: attribution.fbclid,
          ttclid: attribution.ttclid,
          msclkid: attribution.msclkid,
          twclid: attribution.twclid,
          scid: attribution.scid,
          ipAddress,
          country: geo.country,
          countryCode: geo.countryCode,
          city: geo.city,
          region: geo.region,
          latitude: geo.latitude,
          longitude: geo.longitude,
          device,
          deviceBrand,
          browser,
          os,
          screenResolution: clampString(context.screenResolution, 32),
          viewport: clampString(context.viewport, 32),
          language: clampString(context.language, 32),
          timezone: clampString(context.timezone, 64),
          prefersDarkMode:
            typeof context.prefersDarkMode === "boolean" ? context.prefersDarkMode : null,
          networkType: clampString(context.networkType, 32),
          gaClientId,
          gaSessionId: clampString(context.gaSessionId, 120)
        },
        $set: {
          lastActivityAt: now,
          ...(userId ? { userId, visitorType } : {}),
          ...(currentPage ? { exitPage: currentPage } : {})
        }
      },
      { upsert: true, new: true, rawResult: true }
    );
    const sessionDoc = sessionRaw?.value || null;

    // --- Link authenticated identity to the visitor ---
    if (userId) {
      await AnalyticsVisitor.updateOne(
        { visitorId },
        {
          $addToSet: { userIds: userId },
          $set: { firstUserId: visitorRaw?.value?.firstUserId || userId }
        }
      );
    }

    // --- Process hits ---
    let pageViewDelta = 0;
    let eventDelta = 0;
    let durationDelta = 0;
    let signedUpDelta = false;
    let subscriptionDelta = false;
    let revenueDelta = 0;
    let lastPage = currentPage;

    for (const hit of hits) {
      try {
        const hitType = hit.type === "event" ? "event" : "pageview";
        const eventId = clampString(hit.eventId, 80);
        const page = clampString(hit.page || currentPage, 1024);

        if (hitType === "pageview") {
          if (!page) continue;
          try {
            await AnalyticsPageView.create({
              visitorId,
              sessionId,
              userId,
              page,
              pageTitle: clampString(hit.pageTitle, 256),
              referrer: clampString(hit.referrer || referrer, 1024),
              timestamp: now,
              timeOnPageSeconds: Number(hit.timeOnPage || 0) || 0,
              isEntry: pageViewDelta === 0 && !sessionDoc?.pageViewCount,
              country: geo.country,
              device,
              channel: attribution.channel,
              source: attribution.source,
              eventId
            });
            pageViewDelta += 1;
            durationDelta += Number(hit.timeOnPage || 0) || 0;
            lastPage = page;
            recordLiveHit({ kind: "pageview", visitorId, country: geo.country });
          } catch (err) {
            if (err?.code !== 11000) throw err; // ignore idempotent duplicates
          }
        } else {
          const name = clampString(hit.name, 80);
          if (!name) continue;

          // Time-on-page finalization for a previously recorded page view.
          if (name === "__page_time") {
            const targetId = clampString(hit.props?.targetEventId, 80);
            const secs = Number(hit.props?.seconds || 0) || 0;
            if (targetId && secs > 0) {
              await AnalyticsPageView.updateOne(
                { eventId: targetId },
                { $max: { timeOnPageSeconds: secs } }
              );
              durationDelta += secs;
            }
            continue;
          }

          const value = Number(hit.value || 0) || 0;
          const currency = clampString(hit.currency, 8) || "usd";
          try {
            await AnalyticsEvent.create({
              name,
              category: clampString(hit.category, 64) || "general",
              visitorId,
              sessionId,
              userId,
              timestamp: now,
              value,
              currency,
              country: geo.country,
              device,
              browser,
              os,
              channel: attribution.channel,
              source: attribution.source,
              page,
              props: hit.props && typeof hit.props === "object" ? hit.props : {},
              eventId
            });
            eventDelta += 1;
          } catch (err) {
            if (err?.code !== 11000) throw err;
            continue;
          }

          // Conversion + live signal handling
          if (SIGNUP_EVENTS.has(name)) {
            signedUpDelta = true;
            recordLiveHit({ kind: "signup", visitorId, country: geo.country });
          }
          if (REVENUE_EVENTS.has(name)) {
            revenueDelta += value;
            if (SUBSCRIPTION_EVENTS.has(name)) subscriptionDelta = true;
            recordLiveHit({
              kind: SUBSCRIPTION_EVENTS.has(name) ? "subscription" : "purchase",
              visitorId,
              value,
              country: geo.country,
              label: name
            });
          }
          if (name === ANALYTICS_EVENTS.SMS_SENT) recordLiveSms({});
          if (CALL_EVENTS.has(name)) recordLiveCall({ status: name });
          if (ERROR_EVENTS.has(name)) recordLiveHit({ kind: "error", visitorId, label: name });
        }
      } catch (hitErr) {
        console.warn("[analytics] hit processing error:", hitErr?.message || hitErr);
      }
    }

    // --- Apply aggregate updates to session + visitor ---
    const sessionInc = {};
    if (pageViewDelta) sessionInc.pageViewCount = pageViewDelta;
    if (eventDelta) sessionInc.eventCount = eventDelta;
    if (durationDelta) sessionInc.durationSeconds = durationDelta;
    if (revenueDelta) sessionInc.revenue = revenueDelta;

    const sessionSet = { lastActivityAt: now };
    if (lastPage) sessionSet.exitPage = lastPage;
    if (signedUpDelta) sessionSet.signedUp = true;
    if (subscriptionDelta) {
      sessionSet.hasSubscription = true;
      sessionSet.converted = true;
      sessionSet.visitorType = "subscriber";
    } else if (signedUpDelta) {
      sessionSet.converted = true;
    }

    const projectedPageViews = (sessionDoc?.pageViewCount || 0) + pageViewDelta;
    sessionSet.isBounce = projectedPageViews <= 1;
    const startedAt = sessionDoc?.startedAt || now;
    sessionSet.durationSeconds = Math.max(
      sessionDoc?.durationSeconds || 0,
      Math.round((now.getTime() - new Date(startedAt).getTime()) / 1000)
    );

    await AnalyticsSession.updateOne(
      { sessionId },
      {
        ...(Object.keys(sessionInc).length ? { $inc: sessionInc } : {}),
        $set: sessionSet
      }
    );

    const visitorInc = {};
    if (pageViewDelta) visitorInc.pageViewCount = pageViewDelta;
    if (eventDelta) visitorInc.eventCount = eventDelta;
    const visitorSet = {};
    if (signedUpDelta) {
      visitorSet.signedUp = true;
      visitorSet.signedUpAt = now;
    }
    if (subscriptionDelta) {
      visitorSet.hasSubscription = true;
      visitorSet.subscribedAt = now;
    }
    if (Object.keys(visitorInc).length || Object.keys(visitorSet).length) {
      await AnalyticsVisitor.updateOne(
        { visitorId },
        {
          ...(Object.keys(visitorInc).length ? { $inc: visitorInc } : {}),
          ...(Object.keys(visitorSet).length ? { $set: visitorSet } : {})
        }
      );
    }

    // Increment visitor.sessionCount only when this session was newly created
    if (sessionRaw?.lastErrorObject?.upserted) {
      await AnalyticsVisitor.updateOne({ visitorId }, { $inc: { sessionCount: 1 } });
    }

    const visitorDoc = visitorRaw?.value || (await AnalyticsVisitor.findOne({ visitorId }).lean());
    const liveHits = hits.map((h) => ({
      type: h.type === "event" ? "event" : "pageview",
      name: h.name,
      page: h.page || currentPage,
      pageTitle: h.pageTitle,
      value: h.value,
      props: h.props
    }));

    await upsertLiveSession({
      visitorId,
      sessionId,
      userId,
      context: {
        ...context,
        page: lastPage || currentPage,
        userAgent
      },
      geo,
      attribution,
      device,
      browser,
      os,
      deviceBrand,
      ipAddress,
      isReturning: !visitorIsNew,
      hits: liveHits,
      visitorMeta: visitorDoc
        ? {
            firstSeenAt: visitorDoc.firstSeenAt,
            sessionCount: visitorDoc.sessionCount,
            eventCount: visitorDoc.eventCount
          }
        : null
    }).catch((e) => console.warn("[analytics] live intel:", e?.message || e));

    return { ok: true, processed: hits.length };
  } catch (error) {
    console.error("[analytics] ingestBatch error:", error?.message || error);
    return { ok: false, reason: "error" };
  }
}

export default { ingestBatch };
