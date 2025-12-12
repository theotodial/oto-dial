const API_BASE_URL = 'http://localhost:5000';

export const getWallet = async () => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/wallet`);
    
    if (!response.ok) {
      throw new Error('Failed to fetch wallet');
    }
    
    const data = await response.json();
    return data;
  } catch (error) {
    throw error;
  }
};

export const getTransactions = async () => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/wallet/transactions`);
    
    if (!response.ok) {
      throw new Error('Failed to fetch transactions');
    }
    
    const data = await response.json();
    return Array.isArray(data) ? data : [];
  } catch (error) {
    throw error;
  }
};

export const topup = async (amount) => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/wallet/topup`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ amount }),
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to top up wallet');
    }
    
    const data = await response.json();
    return data;
  } catch (error) {
    throw error;
  }
};

