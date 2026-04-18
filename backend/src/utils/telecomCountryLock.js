/**
 * Same-country-only outbound (calls + SMS) is opt-in for compliance / fraud control.
 * When unset or not "true", international destinations are allowed at the app layer
 * (subject to Telnyx messaging profile, voice outbound profile, fraud policy, and custom packages).
 */
export function isSameCountryOutboundOnlyEnabled() {
  return (
    String(process.env.TELECOM_SAME_COUNTRY_OUTBOUND_ONLY || "")
      .trim()
      .toLowerCase() === "true"
  );
}
