import API from '../api';

export const getChat = async (phoneNumber) => {
  const response = phoneNumber
    ? await API.get('/api/messages', {
        params: { thread: phoneNumber, limit: 20 }
      })
    : await API.get('/api/messages', { params: { limit: 20 } });
  if (response.error) {
    throw new Error(response.error || 'Failed to fetch chat messages');
  }

  const messages = response.data?.messages || response.data || [];
  if (!phoneNumber) {
    return messages;
  }

  const normalized = String(phoneNumber).replace(/\D/g, '');
  return messages.filter((msg) => {
    const candidate = msg.phone_number || msg.to || msg.from || '';
    return String(candidate).replace(/\D/g, '') === normalized;
  });
};

export const sendMessage = async (message, phoneNumber) => {
  if (!phoneNumber) {
    throw new Error('Phone number is required to send a message');
  }

  const response = await API.post('/api/sms/send', {
    to: phoneNumber,
    text: message
  });

  if (response.error) {
    throw new Error(response.error || 'Failed to send message');
  }

  return response.data;
};

