export const PRIMARY_ADMIN_EMAIL = "theotodial@gmail.com";

export const ADMIN_ACCESS_AREAS = [
  "dashboard",
  "users",
  "affiliates",
  "notifications",
  "calls",
  "sms",
  "numbers",
  "support",
  "team",
  "blog",
  "analytics"
];

export const ADMIN_ACCESS_LABELS = {
  dashboard: "Dashboard",
  users: "Users",
  affiliates: "Affiliates",
  notifications: "Notifications",
  calls: "Calls",
  sms: "SMS",
  numbers: "Numbers",
  support: "Support",
  team: "Team",
  blog: "Blog",
  analytics: "Analytics"
};

export const normalizeAdminRoles = (roles = []) => {
  if (!Array.isArray(roles)) return [];

  const unique = new Set();
  roles.forEach((role) => {
    const normalized = String(role || "").trim().toLowerCase();
    if (ADMIN_ACCESS_AREAS.includes(normalized)) {
      unique.add(normalized);
    }
  });
  return Array.from(unique);
};

export const getAllAdminRoles = () => [...ADMIN_ACCESS_AREAS];

export const getAdminRolesForUser = (user) => {
  if (!user || user.role !== "admin") {
    return [];
  }

  const userEmail = String(user.email || "").toLowerCase().trim();
  if (userEmail === PRIMARY_ADMIN_EMAIL) {
    return getAllAdminRoles();
  }

  if (Array.isArray(user.adminRoles)) {
    return normalizeAdminRoles(user.adminRoles);
  }

  // Backward compatibility for legacy admin records without explicit roles.
  return getAllAdminRoles();
};

export const getRequiredAdminRolesForPath = (path = "") => {
  const normalizedPath = String(path || "").split("?")[0];

  if (normalizedPath.startsWith("/api/analytics/admin")) return ["analytics"];
  if (normalizedPath.startsWith("/api/blog/admin")) return ["blog"];

  if (!normalizedPath.startsWith("/api/admin")) {
    return [];
  }

  if (normalizedPath.startsWith("/api/admin/analytics")) return ["analytics"];
  if (normalizedPath.startsWith("/api/admin/users")) return ["users"];
  if (normalizedPath.startsWith("/api/admin/actions")) return ["users"];
  if (normalizedPath.startsWith("/api/admin/affiliates")) return ["affiliates"];
  if (normalizedPath.startsWith("/api/admin/notifications")) return ["notifications"];
  if (normalizedPath.startsWith("/api/admin/calls")) return ["calls"];
  if (normalizedPath.startsWith("/api/admin/sms")) return ["sms"];
  if (normalizedPath.startsWith("/api/admin/numbers")) return ["numbers"];
  if (normalizedPath.startsWith("/api/admin/support")) return ["support"];
  if (normalizedPath.startsWith("/api/admin/team")) return ["team"];
  if (normalizedPath.startsWith("/api/admin/subscriptions")) return ["users"];
  if (normalizedPath.startsWith("/api/admin/stats")) return ["dashboard"];
  if (normalizedPath.startsWith("/api/admin/usage")) return ["dashboard"];
  if (normalizedPath.startsWith("/api/admin/plans")) return ["dashboard"];

  return [];
};

export const evaluateAdminAccessForPath = (user, path = "") => {
  const grantedRoles = getAdminRolesForUser(user);
  const requiredRoles = getRequiredAdminRolesForPath(path);

  if (requiredRoles.length === 0) {
    return { allowed: true, grantedRoles, requiredRoles };
  }

  const allowed = requiredRoles.some((requiredRole) =>
    grantedRoles.includes(requiredRole)
  );

  return { allowed, grantedRoles, requiredRoles };
};
