import API from '../api';

export const signup = async (data) => {
  const response = await API.post('/api/auth/register', data);
  if (response.error) {
    throw new Error(response.error);
  }
  return response.data;
};

export const login = async (data) => {
  const response = await API.post('/api/auth/login', data);
  if (response.error) {
    throw new Error(response.error);
  }
  return response.data;
};

