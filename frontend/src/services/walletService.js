import { supabase } from '../lib/supabase';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

// Helper function to get auth headers
const getAuthHeaders = async () => {
  const { data: { session }, error } = await supabase.auth.getSession();
  
  if (error || !session) {
    throw new Error('Not authenticated');
  }
  
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${session.access_token}`,
  };
};

export const getWallet = async () => {
  try {
    const headers = await getAuthHeaders();
    const response = await fetch(`${API_BASE_URL}/api/wallet`, {
      headers,
    });
    
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
    const headers = await getAuthHeaders();
    const response = await fetch(`${API_BASE_URL}/api/wallet/transactions`, {
      headers,
    });
    
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
    const headers = await getAuthHeaders();
    const response = await fetch(`${API_BASE_URL}/api/wallet/topup`, {
      method: 'POST',
      headers,
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

