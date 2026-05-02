export function agentLog(agent, severity, event, details = {}) {
  console.log("[AGENT]", {
    agent,
    severity,
    event,
    details,
    timestamp: new Date().toISOString(),
  });
}

export function compactError(error) {
  return String(error?.message || error || "unknown_error").slice(0, 1000);
}
