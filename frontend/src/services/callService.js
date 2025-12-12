const API_BASE_URL = 'http://localhost:5000';

export const getCalls = async () => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/calls`);
    
    if (!response.ok) {
      throw new Error('Failed to fetch calls');
    }
    
    const data = await response.json();
    return Array.isArray(data) ? data : [];
  } catch (error) {
    throw error;
  }
};

