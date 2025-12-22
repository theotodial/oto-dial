const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

export const getMyNumbers = async () => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/numbers`);
    
    if (!response.ok) {
      throw new Error('Failed to fetch numbers');
    }
    
    const data = await response.json();
    return Array.isArray(data) ? data : [];
  } catch (error) {
    throw error;
  }
};

export const getAvailableNumbers = async (country) => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/numbers/search?country=${country}`);
    
    if (!response.ok) {
      throw new Error('Failed to fetch available numbers');
    }
    
    const data = await response.json();
    return Array.isArray(data) ? data : [];
  } catch (error) {
    throw error;
  }
};

export const buyNumber = async (data) => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/numbers/buy`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to buy number');
    }
    
    const result = await response.json();
    return result;
  } catch (error) {
    throw error;
  }
};

