import Telnyx from "telnyx";

let telnyxInstance = null;

export function getTelnyx() {
  if (!telnyxInstance) {
    if (!process.env.TELNYX_API_KEY) {
      console.error("❌ TELNYX_API_KEY missing – Telnyx cannot start");
      return null;
    }

    // Telnyx SDK v4 - call as function, not constructor
    telnyxInstance = Telnyx(process.env.TELNYX_API_KEY);
    console.log("✅ Telnyx initialized");
  }

  return telnyxInstance;
}
