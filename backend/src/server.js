const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// In-memory stores
const users = [];
const wallets = {};
const numbers = [];
const calls = [];
const messages = [];

// Phone number counter for incrementing
let phoneNumberCounter = 1;

// Helper function to generate fake phone number
const generatePhoneNumber = (country) => {
  const prefix = country === 'UK' ? '+44' : country === 'CA' ? '+1' : '+1';
  const counter = phoneNumberCounter++;
  const lastFour = String(counter).padStart(4, '0');
  return `${prefix}-555-000-${lastFour}`;
};

// Health check route
app.get('/', (req, res) => {
  res.json({ status: 'OK' });
});

// AUTH Routes
app.post('/api/auth/signup', (req, res) => {
  const { email, password, name } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Missing email or password' });
  }

  // Check if user exists
  const existingUser = users.find(u => u.email === email);
  if (existingUser) {
    return res.status(400).json({ error: 'user exists' });
  }

  // Create user
  const user = {
    id: users.length + 1,
    email,
    password,
    name: name || ''
  };
  users.push(user);

  // Initialize wallet
  wallets[email] = 0;

  res.json({ ok: true, user: { id: user.id, email: user.email, name: user.name } });
});

app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Missing email or password' });
  }

  const user = users.find(u => u.email === email && u.password === password);
  if (!user) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  res.json({ ok: true, user: { id: user.id, email: user.email, name: user.name } });
});

// WALLET Routes
app.get('/api/wallet/:email', (req, res) => {
  const { email } = req.params;
  const balance = wallets[email] || 0;
  res.json({ balance });
});

app.post('/api/wallet/topup', (req, res) => {
  const { email, amount } = req.body;

  if (!email || amount === undefined) {
    return res.status(400).json({ error: 'Missing email or amount' });
  }

  if (typeof amount !== 'number' || amount <= 0) {
    return res.status(400).json({ error: 'Amount must be a positive number' });
  }

  if (wallets[email] === undefined) {
    wallets[email] = 0;
  }

  wallets[email] += amount;
  res.json({ ok: true, balance: wallets[email] });
});

// NUMBERS Routes
app.post('/api/numbers/buy', (req, res) => {
  const { email, country } = req.body;

  if (!email) {
    return res.status(400).json({ error: 'Missing email' });
  }

  // Validate email exists
  const user = users.find(u => u.email === email);
  if (!user) {
    return res.status(400).json({ error: 'User not found' });
  }

  // Generate fake number
  const phoneNumber = generatePhoneNumber(country || 'US');
  const number = {
    id: numbers.length + 1,
    ownerEmail: email,
    number: phoneNumber,
    country: country || 'US',
    purchasedAt: new Date().toISOString()
  };
  numbers.push(number);

  res.json({ ok: true, number: phoneNumber });
});

app.get('/api/numbers/:email', (req, res) => {
  const { email } = req.params;
  const userNumbers = numbers.filter(n => n.ownerEmail === email);
  res.json(userNumbers);
});

// CALLS Routes
app.post('/api/call', (req, res) => {
  const { from, to } = req.body;

  if (!from || !to) {
    return res.status(400).json({ error: 'Missing from or to' });
  }

  const call = {
    id: calls.length + 1,
    from,
    to,
    ts: new Date().toISOString()
  };
  calls.push(call);

  res.json({ ok: true, record: call });
});

app.get('/api/calls/:email', (req, res) => {
  const { email } = req.params;
  const userCalls = calls.filter(c => c.from === email || c.to === email);
  res.json(userCalls);
});

// CHAT Routes
app.get('/api/chat', (req, res) => {
  res.json(messages);
});

app.post('/api/chat', (req, res) => {
  const { text, from } = req.body;

  if (!text || !from) {
    return res.status(400).json({ error: 'Missing text or from' });
  }

  // Push user message
  const userMessage = {
    id: messages.length + 1,
    text,
    from,
    ts: new Date().toISOString()
  };
  messages.push(userMessage);

  // Push bot echo message
  const botMessage = {
    id: messages.length + 1,
    text: `Echo: ${text}`,
    from: 'oto-bot',
    ts: new Date().toISOString()
  };
  messages.push(botMessage);

  res.json({ ok: true });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log('In-memory API ready');
});
