export const IDENTITY_BANNER_PATHS = new Set([
  '/dashboard',
  '/subscription-details',
  '/profile',
  '/recents',
  '/voice',
  '/campaign',
  '/support',
]);

export function needsIdentityVerification(status) {
  return status === 'not_submitted' || status === 'rejected' || !status;
}

export function shouldShowIdentityBanner({ token, user, pathname }) {
  if (!token || !user?.email) return false;
  const path = pathname || '';
  if (!IDENTITY_BANNER_PATHS.has(path) || path === '/identity-verification') return false;
  const status = user.identityVerificationStatus || 'not_submitted';
  return needsIdentityVerification(status);
}
