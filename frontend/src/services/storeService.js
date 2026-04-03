import API from '../api';

export const getStores = async () => {
  const response = await API.get('/api/stores');
  if (response.error) {
    throw new Error(response.error || 'Failed to fetch stores');
  }

  const data = response.data?.stores || response.data || [];
  return Array.isArray(data) ? data : [];
};

