/**
 * Launch / deploy posture (observability & safety caps only — no billing math).
 * DEPLOYMENT_MODE=staging|production|safe
 */

export function getDeploymentMode() {
  const m = String(process.env.DEPLOYMENT_MODE || "production").toLowerCase().trim();
  if (m === "staging" || m === "production" || m === "safe") return m;
  return "production";
}

export function isSafeDeploymentMode() {
  return getDeploymentMode() === "safe";
}

/**
 * Applies conservative defaults only when unset (does not override explicit operator config).
 */
export function applySafeModeOperationalDefaults() {
  if (!isSafeDeploymentMode()) return;
  const setDefault = (key, value) => {
    if (process.env[key] == null || String(process.env[key]).trim() === "") {
      process.env[key] = String(value);
    }
  };
  setDefault("TELECOM_STRUCTURED_LOG", "1");
  setDefault("CALL_HEARTBEAT_STALE_MS", "90000");
  setDefault("CALL_CREDIT_MAX_CALLS", "80");
  setDefault("RECOVERY_STALE_TICK_MULTIPLIER", "1.5");
  setDefault("ECONOMIC_RECOVERY_STARTUP_LIMIT", "280");
  setDefault("CHAOS_ORPHAN_HEARTBEAT_MS", String(18 * 60 * 1000));
  setDefault("REPLAY_VERIFY_SAMPLE_LIMIT", "18");
}
