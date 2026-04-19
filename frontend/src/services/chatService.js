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

export const sendMessage = async (message, phoneNumber, options = {}) => {
  if (!phoneNumber) {
    throw new Error('Phone number is required to send a message');
  }

  const idempotencyKey =
    options.idempotencyKey ??
    (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `sms-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`);

  const response = await API.post(
    '/api/sms/send',
    {
      to: phoneNumber,
      text: message,
      idempotencyKey,
    },
    { timeout: 90000 }
  );

  if (response.error) {
    throw new Error(response.error || 'Failed to send message');
  }

  /** @type {{ success?: boolean, messageId?: string, mongoId?: string, queued?: boolean, status?: string, idempotent?: boolean }} */
  const data = response.data;
  return data;
};

