/**
 * Telnyx messaging webhooks (inbound + delivery lifecycle).
 * Mount at /webhooks/telnyx so POST /webhooks/telnyx and POST /webhooks/telnyx/sms both work.
 */
export { default } from "./telnyxSms.js";
