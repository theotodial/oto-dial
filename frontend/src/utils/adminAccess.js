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

const DEFAULT_PATH_BY_ROLE = {
  dashboard: "/adminbobby/dashboard",
  users: "/adminbobby/users",
  affiliates: "/adminbobby/affiliates",
  notifications: "/adminbobby/notifications",
  calls: "/adminbobby/calls",
  sms: "/adminbobby/sms",
  numbers: "/adminbobby/numbers",
  support: "/adminbobby/support",
  team: "/adminbobby/team",
  blog: "/adminbobby/blog",
  analytics: "/adminbobby/analytics"
};

const normalizeAdminRoles = (roles = []) => {
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

export const readStoredAdminProfile = () => {
  try {
    const raw = localStorage.getItem("adminProfile");
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

export const clearStoredAdminProfile = () => {
  localStorage.removeItem("adminProfile");
};

export const getAdminRoles = (adminProfile) => {
  if (!adminProfile) return [];

  const explicitRoles = normalizeAdminRoles(adminProfile.adminRoles);
  if (explicitRoles.length > 0) return explicitRoles;

  // Backward-compatible fallback for older admin payloads.
  if (adminProfile.role === "admin") {
    return [...ADMIN_ACCESS_AREAS];
  }

  return [];
};

export const hasAdminRole = (adminProfile, role) => {
  if (!role) return true;
  return getAdminRoles(adminProfile).includes(role);
};

export const getRequiredRoleForAdminPath = (pathname = "") => {
  if (!pathname.startsWith("/adminbobby")) return null;

  if (pathname.startsWith("/adminbobby/dashboard")) return "dashboard";
  if (pathname.startsWith("/adminbobby/users")) return "users";
  if (pathname.startsWith("/adminbobby/affiliates")) return "affiliates";
  if (pathname.startsWith("/adminbobby/notifications")) return "notifications";
  if (pathname.startsWith("/adminbobby/calls")) return "calls";
  if (pathname.startsWith("/adminbobby/sms")) return "sms";
  if (pathname.startsWith("/adminbobby/numbers")) return "numbers";
  if (pathname.startsWith("/adminbobby/support")) return "support";
  if (pathname.startsWith("/adminbobby/team")) return "team";
  if (pathname.startsWith("/adminbobby/blog")) return "blog";
  if (pathname.startsWith("/adminbobby/analytics")) return "analytics";

  return null;
};

export const canAccessAdminPath = (pathname, adminProfile) => {
  const requiredRole = getRequiredRoleForAdminPath(pathname);
  if (!requiredRole) return true;
  return hasAdminRole(adminProfile, requiredRole);
};

export const getFirstAccessibleAdminPath = (adminProfile) => {
  const priority = [
    "dashboard",
    "support",
    "analytics",
    "users",
    "affiliates",
    "notifications",
    "calls",
    "sms",
    "numbers",
    "blog",
    "team"
  ];

  for (const role of priority) {
    if (hasAdminRole(adminProfile, role)) {
      return DEFAULT_PATH_BY_ROLE[role];
    }
  }

  return "/adminbobby";
};
