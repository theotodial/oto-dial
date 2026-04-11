import axios from "axios";

// Use VITE_API_URL from environment variables
// In development: uses Vite proxy (empty string = relative URLs)
// In production: uses VITE_API_URL if set, otherwise relative URLs
const baseURL = import.meta.env.VITE_API_URL || "";

const axiosInstance = axios.create({ baseURL });
const sameOriginAxios = axios.create({ baseURL: "" });

const getRequestPath = (rawUrl = "") => {
  if (!rawUrl || typeof rawUrl !== "string") return "";

  if (/^https?:\/\//i.test(rawUrl)) {
    try {
      const parsed = new URL(rawUrl);
      return parsed.pathname || "";
    } catch {
      return rawUrl.split("?")[0];
    }
  }

  const normalized = rawUrl.split("?")[0];
  return normalized.startsWith("/") ? normalized : `/${normalized}`;
};

const isAdminRequest = (url = "") => {
  const path = getRequestPath(url);
  return (
    path.startsWith("/api/admin") ||
    path.startsWith("/api/blog/admin") ||
    path.startsWith("/api/analytics/admin")
  );
};

const attachAuthHeaders = (config) => {
  const isAdminRoute = isAdminRequest(config.url);

  if (!config.headers) {
    config.headers = {};
  }

  if (isAdminRoute) {
    // Admin routes: use adminToken only
    const adminToken = localStorage.getItem('adminToken');
    if (adminToken && !config.headers.Authorization) {
      config.headers.Authorization = `Bearer ${adminToken}`;
    }
  } else {
    // User routes: use userToken only (never adminToken)
    const userToken = localStorage.getItem('token');
    if (userToken && !config.headers.Authorization) {
      config.headers.Authorization = `Bearer ${userToken}`;
    }
  }

  return config;
};

axiosInstance.interceptors.request.use(attachAuthHeaders, (error) => Promise.reject(error));
sameOriginAxios.interceptors.request.use(attachAuthHeaders, (error) => Promise.reject(error));

const canRetryOnSameOrigin = (error) => {
  const path = getRequestPath(error?.config?.url || "");
  if (!baseURL || !path.startsWith("/api/")) return false;
  if (error?.config?._retriedSameOrigin) return false;

  const status = Number(error?.response?.status || 0);
  return !status || status === 502 || status === 503 || status === 504;
};

const retryOnSameOrigin = async (error) => {
  const cfg = error?.config;
  if (!cfg) throw error;

  const retryConfig = {
    ...cfg,
    baseURL: "",
    _retriedSameOrigin: true,
    headers: { ...(cfg.headers || {}) },
  };

  console.warn(
    "[API FALLBACK] Retrying against same-origin /api after upstream failure:",
    cfg.url,
    error?.response?.status || error?.message
  );

  return sameOriginAxios.request(retryConfig);
};

// Safe API wrapper that never throws - always returns response-like structure
const safeRequest = async (requestFn) => {
  try {
    const response = await requestFn();
    return response;
  } catch (error) {
    if (canRetryOnSameOrigin(error)) {
      try {
        return await retryOnSameOrigin(error);
      } catch (retryError) {
        error = retryError;
      }
    }

    const url = error.config?.url || "";
    const tag = url.includes("/api/calls") ? "[CALL ERROR FRONTEND] API" : "API Error";
    if (error.code === "ERR_CANCELED" || error.message === "canceled") {
      console.error(
        tag + " (canceled — often React StrictMode remount, navigation, or duplicate request):",
        url
      );
    }
    console.error(tag + ":", error.response?.data || error.message);
    console.error(tag + " Status:", error.response?.status);
    console.error(tag + " URL:", url);
    
    // Return response-like structure that mimics axios response
    // Include the actual response data if available for better error messages
    return {
      data: error.response?.data || null,
      error: error.response?.data?.error || error.response?.data?.message || error.response?.data?.detail || error.message || 'API request failed',
      status: error.response?.status || 500,
      response: error.response
    };
  }
};

/** Deduplicate concurrent identical GETs (e.g. StrictMode + multiple mounts) */
const inFlightGet = new Map();

function getDedupeKey(path, config = {}) {
  const params = config.params;
  if (params && typeof params === "object" && Object.keys(params).length > 0) {
    const entries = Object.entries(params)
      .filter(([, v]) => v !== undefined && v !== null)
      .sort(([a], [b]) => String(a).localeCompare(String(b)));
    const qs = new URLSearchParams(entries.map(([k, v]) => [k, String(v)])).toString();
    return qs ? `${path}?${qs}` : path;
  }
  return path;
}

// Create safe API wrapper
const API = {
  get: async (path, config = {}) => {
    const key = getDedupeKey(path, config);
    if (inFlightGet.has(key)) {
      return inFlightGet.get(key);
    }
    const promise = safeRequest(() => axiosInstance.get(path, config)).finally(() => {
      inFlightGet.delete(key);
    });
    inFlightGet.set(key, promise);
    return promise;
  },
  post: async (path, data, config = {}) => {
    return safeRequest(() => axiosInstance.post(path, data, config));
  },
  patch: async (path, data, config) => {
    return safeRequest(() => axiosInstance.patch(path, data, config));
  },
  put: async (path, data, config = {}) => {
    return safeRequest(() => axiosInstance.put(path, data, config));
  },
  delete: async (path, config) => {
    return safeRequest(() => axiosInstance.delete(path, config));
  }
};

export default API;

