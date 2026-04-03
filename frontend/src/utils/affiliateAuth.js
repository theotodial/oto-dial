export const AFFILIATE_TOKEN_KEY = 'affiliateToken';

export function getAffiliateToken() {
  return localStorage.getItem(AFFILIATE_TOKEN_KEY);
}

export function setAffiliateToken(token) {
  if (token) {
    localStorage.setItem(AFFILIATE_TOKEN_KEY, token);
  }
}

export function clearAffiliateToken() {
  localStorage.removeItem(AFFILIATE_TOKEN_KEY);
}
