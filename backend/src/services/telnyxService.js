import Telnyx from "telnyx";

let telnyxClient = null;

export default function getTelnyxClient() {
  if (!process.env.TELNYX_API_KEY) {
    console.warn("⚠️ TELNYX_API_KEY not set – Telnyx disabled");
    return null;
  }

  if (!telnyxClient) {
    // Telnyx SDK v4 - call as function, not constructor
    telnyxClient = Telnyx(process.env.TELNYX_API_KEY);
  }

  return telnyxClient;
}
