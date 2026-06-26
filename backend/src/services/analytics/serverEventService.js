import AnalyticsEvent from "../../models/analytics/AnalyticsEvent.js";

import { recordLiveHit, recordLiveCall, recordLiveSms } from "./analyticsLiveService.js";

import {

  REVENUE_EVENTS,

  SUBSCRIPTION_EVENTS,

  SIGNUP_EVENTS,

  CALL_EVENTS,

  ERROR_EVENTS,

  ANALYTICS_EVENTS

} from "../../constants/analyticsEvents.js";



function buildEventId(name, props = {}) {

  const tx = props.transactionId || props.invoiceId || props.stripeInvoiceId || props.callId || props.messageId;

  if (tx) return `srv:${name}:${tx}`;

  return null;

}



/**

 * recordServerEvent

 *

 * Records a trustworthy, server-originated analytics event (purchases,

 * number provisioning, call/SMS lifecycle) directly into the event stream.

 * Idempotent when transaction/call/message IDs are provided.

 */

export async function recordServerEvent({

  name,

  userId = null,

  value = 0,

  currency = "usd",

  props = {},

  country = null,

  channel = null,

  source = null,

  eventId = null

} = {}) {

  if (!name) return;

  const resolvedEventId = eventId || buildEventId(name, props);

  try {

    await AnalyticsEvent.create({

      name,

      category: props.category || "server",

      userId: userId || null,

      timestamp: new Date(),

      value: Number(value || 0) || 0,

      currency,

      country,

      channel,

      source,

      props: props && typeof props === "object" ? props : {},

      eventId: resolvedEventId

    });



    if (SIGNUP_EVENTS.has(name)) {

      recordLiveHit({ kind: "signup", label: name, country });

    } else if (REVENUE_EVENTS.has(name)) {

      recordLiveHit({

        kind: SUBSCRIPTION_EVENTS.has(name) ? "subscription" : "purchase",

        value: Number(value || 0) || 0,

        label: name,

        country

      });

    } else if (name === ANALYTICS_EVENTS.SMS_SENT) {

      recordLiveSms({});

    } else if (CALL_EVENTS.has(name)) {

      recordLiveCall({ status: name });

    } else if (ERROR_EVENTS.has(name)) {

      recordLiveHit({ kind: "error", label: name, country });

    }

  } catch (error) {

    if (error?.code === 11000) return;

    console.warn("[analytics] recordServerEvent error:", error?.message || error);

  }

}



export default { recordServerEvent };

