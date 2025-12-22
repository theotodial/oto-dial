const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

export const getStores = async () => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/stores`);
    
    if (!response.ok) {
      throw new Error('Failed to fetch stores');
    }
    
    const data = await response.json();
    return Array.isArray(data) ? data : [];
  } catch (error) {
    throw error;
  }
};

