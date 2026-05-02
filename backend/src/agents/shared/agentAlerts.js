import { emitAdminSocketEvent } from "../../services/adminLiveEventsService.js";
import { agentLog } from "./agentLogger.js";

export function emitAgentAlert(agent, severity, event, details = {}) {
  agentLog(agent, severity, event, details);
  try {
    emitAdminSocketEvent("agent:alert", {
      agent,
      severity,
      event,
      details,
    });
  } catch {
    /* admin realtime is best-effort */
  }
}
