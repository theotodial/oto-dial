const API_BASE_URL = 'http://localhost:5000';

export const getChat = async (number_id) => {
  try {
    const url = number_id 
      ? `${API_BASE_URL}/api/chat?number_id=${number_id}`
      : `${API_BASE_URL}/api/chat`;
    
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error('Failed to fetch chat messages');
    }
    
    const data = await response.json();
    return Array.isArray(data) ? data : (data.messages || []);
  } catch (error) {
    throw error;
  }
};

export const sendMessage = async (message, number_id) => {
  try {
    const body = number_id 
      ? { text: message, number_id }
      : { text: message };
    
    const response = await fetch(`${API_BASE_URL}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to send message');
    }
    
    const data = await response.json();
    return data;
  } catch (error) {
    throw error;
  }
};

