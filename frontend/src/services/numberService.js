import API from '../api';

export async function getMyNumbers() {
  const response = await API.get('/api/numbers');
  if (response.error) {
    return [];
  }
  return response.data?.numbers || response.data || [];
}

export async function searchNumbers(areaCode, searchPattern) {
  const params = new URLSearchParams();
  if (areaCode) params.append('areaCode', areaCode);
  if (searchPattern) params.append('searchPattern', searchPattern);
  
  const response = await API.get(`/api/numbers/search?${params.toString()}`);
  if (response.error) {
    throw new Error(response.error);
  }
  return response.data?.numbers || [];
}

export async function purchaseNumber(phoneNumber) {
  const response = await API.post('/api/numbers/purchase', { phoneNumber });
  if (response.error) {
    throw new Error(response.error);
  }
  return response.data;
}

// Legacy function - kept for backward compatibility
export async function getAvailableNumbers(country) {
  return searchNumbers();
}

export async function buyNumber(payload) {
  // If phoneNumber is provided, use new purchase endpoint
  if (payload.phoneNumber) {
    return purchaseNumber(payload.phoneNumber);
  }
  // Otherwise, throw error directing to search
  throw new Error('Please search for and select a number first');
}
