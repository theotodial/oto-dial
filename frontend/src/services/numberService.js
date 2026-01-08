import API from '../api';

export async function getMyNumbers() {
  const response = await API.get('/api/numbers');
  if (response.error) {
    return [];
  }
  return response.data?.numbers || response.data || [];
}

export async function getAvailableNumbers(country) {
  const response = await API.get(`/api/numbers/available?country=${country}`);
  if (response.error) {
    return [];
  }
  return response.data?.numbers || response.data || [];
}

export async function buyNumber(payload) {
  const response = await API.post('/api/numbers/buy', payload);
  if (response.error) {
    throw new Error(response.error);
  }
  return response.data;
}
