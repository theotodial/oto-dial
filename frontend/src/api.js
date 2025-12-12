import axios from "axios";

// Use VITE_API_URL from environment variables
// In development: uses Vite proxy (empty string = relative URLs)
// In production: uses VITE_API_URL if set, otherwise relative URLs
const baseURL = import.meta.env.VITE_API_URL || "";

const API = axios.create({
  baseURL: baseURL,
});

// Add request interceptor for better error handling
API.interceptors.request.use(
  (config) => {
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Add response interceptor for better error handling
API.interceptors.response.use(
  (response) => {
    return response;
  },
  (error) => {
    return Promise.reject(error);
  }
);

export default API;

