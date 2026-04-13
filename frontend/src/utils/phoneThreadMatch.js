/** Digits only for comparison */
export function phoneDigits(phone) {
  return String(phone || '').replace(/\D/g, '');
}

/**
 * Whether `threadPhone` (active chat tab) refers to the same party as `peerPhone`
 * (the other party on an SMS row: phone_number / to / from). Handles NANP 10 vs +1.
 */
export function threadMatchesPeerPhone(threadPhone, peerPhone) {
  const a = phoneDigits(threadPhone);
  const b = phoneDigits(peerPhone);
  if (!a || !b) return false;
  if (a === b) return true;
  const stripUsTrunk = (d) => (d.length === 11 && d.startsWith('1') ? d.slice(1) : d);
  const na = stripUsTrunk(a);
  const nb = stripUsTrunk(b);
  if (na === nb) return true;
  if (na.length >= 10 && nb.length >= 10 && na.slice(-10) === nb.slice(-10)) return true;
  return false;
}
