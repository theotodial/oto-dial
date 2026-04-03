import API from '../api';

export const getWallet = async () => {
  const response = await API.get('/api/wallet');
  if (response.error) {
    return { balance: 0 };
  }
  return response.data || { balance: 0 };
};

export const getTransactions = async () => {
  const response = await API.get('/api/wallet/transactions');
  if (response.error) {
    return [];
  }
  const data = response.data?.transactions || response.data;
  return Array.isArray(data) ? data : [];
};

export const topup = async (amount) => {
  const response = await API.post('/api/wallet/topup', { amount });
  if (response.error) {
    throw new Error(response.error);
  }
  return response.data;
};
