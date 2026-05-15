/** Monotonic boot timeline for `[BOOT TIMING] <stage> +<ms>`. */
const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();

export function bootMark(stage) {
  const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
  console.log(`[BOOT TIMING] ${stage} +${Math.round(now - t0)}ms`);
}
