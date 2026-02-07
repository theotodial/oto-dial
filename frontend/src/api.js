import axios from "axios";

// Use VITE_API_URL from environment variables
// In development: uses Vite proxy (empty string = relative URLs)
// In production: uses VITE_API_URL if set, otherwise relative URLs
const baseURL = import.meta.env.VITE_API_URL || "";

const axiosInstance = axios.create({
  baseURL: baseURL,
});

// Add request interceptor to include auth token
axiosInstance.interceptors.request.use(
  (config) => {
    // CRITICAL: Only use adminToken for /api/admin/* and /api/blog/admin/* routes
    // Use userToken for all other routes to prevent conflicts
    const isAdminRoute = config.url && (
      config.url.startsWith('/api/admin') || 
      config.url.startsWith('/api/blog/admin')
    );
    
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
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Safe API wrapper that never throws - always returns response-like structure
const safeRequest = async (requestFn) => {
  try {
    const response = await requestFn();
    return response;
  } catch (error) {
    // Log error for debugging but don't throw
    console.error('API Error:', error.response?.data || error.message);
    console.error('API Error Status:', error.response?.status);
    console.error('API Error URL:', error.config?.url);
    
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

// Create safe API wrapper
const API = {
  get: async (path, config = {}) => {
    return safeRequest(() => axiosInstance.get(path, config));
  },
  post: async (path, data, config = {}) => {
    return safeRequest(() => axiosInstance.post(path, data, config));
  },
  patch: async (path, data) => {
    return safeRequest(() => axiosInstance.patch(path, data));
  },
  put: async (path, data, config = {}) => {
    return safeRequest(() => axiosInstance.put(path, data, config));
  },
  delete: async (path) => {
    return safeRequest(() => axiosInstance.delete(path));
  }
};

export default API;

