import API from "../api";

/**
 * Fetches read-only projected telecom credit balance (active calls + reservations).
 * @returns {Promise<{ ok: boolean, data?: object, error?: string }>}
 */
export async function fetchProjectedBalance() {
  const response = await API.get("/api/subscription/projected-balance");
  if (response.error) {
    return { ok: false, error: response.error };
  }
  const body = response.data;
  if (!body?.success) {
    return { ok: false, error: body?.error || "projected_balance_failed" };
  }
  return { ok: true, data: body };
}
