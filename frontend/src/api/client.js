/**
 * Central API helper
 * Automatically:
 * - attaches JWT token
 * - handles 401 logout
 */

export async function apiFetch(path, options = {}) {
    const token = localStorage.getItem("token");
  
    const response = await fetch(
      import.meta.env.VITE_API_URL + path,
      {
        method: options.method || "GET",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(options.headers || {})
        },
        body: options.body ? JSON.stringify(options.body) : undefined
      }
    );
  
    // Auto logout on auth failure
    if (response.status === 401) {
      localStorage.removeItem("token");
      window.location.href = "/login";
      return;
    }
  
    const data = await response.json();
  
    if (!response.ok) {
      throw new Error(data.error || "API error");
    }
  
    return data;
  }
  