import { recoverActiveCallEconomics } from "../../services/economicRecoveryService.js";

const AGENT = "economic-recovery-agent";
const DEFAULT_INTERVAL_MS = Number(process.env.AGENT_ECONOMIC_RECOVERY_INTERVAL_MS || 6 * 60 * 1000);
const LEASE_MS = Number(process.env.AGENT_ECONOMIC_RECOVERY_LEASE_MS || 5 * 60 * 1000);

export const economicRecoveryAgent = {
  name: AGENT,
  intervalMs: DEFAULT_INTERVAL_MS,
  leaseMs: LEASE_MS,

  async run({ log }) {
    const r = await recoverActiveCallEconomics({ mode: "sweep", limit: 80 });
    log("info", "economic_recovery_sweep", { processed: r.processed });
    return { processed: r.processed };
  },
};
