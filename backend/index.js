const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
// CORS configuration: supports localhost frontends and deployed Vercel frontend
// Note: In production, consider restricting origin to specific URLs for better security
app.use(cors({
  origin: "*", // Allows all origins (localhost and Vercel deployments)
  methods: ["GET", "POST"], // Allowed HTTP methods
  allowedHeaders: ["Content-Type"], // Allowed request headers
  credentials: true
}));
app.use(express.json());

// In-memory storage
const users = [];
const wallets = {}; // Store by user_id
const numbers = [];
const calls = [];
const messages = [];

// Helper function to generate fake phone number
const generatePhoneNumber = (country) => {
  const prefixes = {
    US: '+1',
    UK: '+44',
    CA: '+1',
    AU: '+61',
    DE: '+49'
  };
  const prefix = prefixes[country] || '+1';
  const random = Math.floor(Math.random() * 1000000000).toString().padStart(10, '0');
  return `${prefix}${random}`;
};

// Health check route
app.get('/', (req, res) => {
  res.json({ status: 'OK' });
});

// Auth Routes
const handleSignup = (req, res) => {
  const { email, password, name, full_name } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  const existingUser = users.find(u => u.email === email);
  if (existingUser) {
    return res.status(400).json({ error: 'User already exists' });
  }

  const userId = Date.now(); // Simple ID generation
  users.push({ 
    id: userId,
    email, 
    password, 
    name: name || full_name || email 
  });
  wallets[userId] = 0; // Store by user_id

  res.json({ success: true });
};

const handleLogin = (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  const user = users.find(u => u.email === email);
  if (!user) {
    return res.status(400).json({ error: 'User not found' });
  }

  if (user.password !== password) {
    return res.status(400).json({ error: 'Wrong password' });
  }

  // Generate a simple token (in production, use JWT)
  const token = `token_${user.id}_${Date.now()}`;
  
  // Return the structure expected by frontend
  res.json({
    access_token: token,
    token_type: 'bearer',
    user: {
      id: user.id || Date.now(), // Ensure ID exists
      email: user.email,
      name: user.name
    }
  });
};

// Support both /api/auth/* and /api/* routes
app.post('/api/auth/signup', handleSignup);
app.post('/api/signup', handleSignup);
app.post('/api/auth/login', handleLogin);
app.post('/api/login', handleLogin);

// Wallet Routes
app.get('/api/wallet/:user_id', (req, res) => {
  const user_id = parseInt(req.params.user_id);
  
  if (wallets[user_id] === undefined) {
    wallets[user_id] = 0;
  }
  
  res.json({ balance: wallets[user_id] });
});

app.post('/api/wallet/topup', (req, res) => {
  const { user_id, amount } = req.body;
  const userId = parseInt(user_id);

  if (wallets[userId] === undefined) {
    wallets[userId] = 0;
  }

  wallets[userId] += amount;
  res.json({ success: true, balance: wallets[userId] });
});

// Numbers Routes
app.post('/api/numbers/buy', (req, res) => {
  const { user_id, country } = req.body;
  const userId = parseInt(user_id);

  const fakeNumber = "+1" + Math.floor(1000000000 + Math.random() * 9000000000);
  const createdNumberObj = { 
    id: Date.now(), 
    user_id: userId, 
    number: fakeNumber, 
    country: country || 'US',
    created_at: new Date().toISOString()
  };

  numbers.push(createdNumberObj);

  if (wallets[userId] !== undefined) {
    wallets[userId] -= 1;
  }

  res.json({ number: createdNumberObj });
});

app.get('/api/numbers/:user_id', (req, res) => {
  const user_id = parseInt(req.params.user_id);

  const userNumbers = numbers.filter(n => n.user_id === user_id);
  res.json(userNumbers);
});

// Call Routes
app.post('/api/calls', (req, res) => {
  const { user_id, from_number, to_number, transcript } = req.body;
  const userId = parseInt(user_id);

  const call = { 
    id: Date.now(), 
    user_id: userId,
    from_number, 
    to_number, 
    transcript: transcript || null,
    created_at: new Date().toISOString()
  };
  calls.push(call);

  res.json(call);
});

app.get('/api/calls/:user_id', (req, res) => {
  const user_id = parseInt(req.params.user_id);

  const userCalls = calls.filter(c => c.user_id === user_id);
  res.json(userCalls);
});

// Chat Routes
app.get('/api/chat', (req, res) => {
  res.json(messages);
});

app.post('/api/chat', (req, res) => {
  const { from, text } = req.body;

  const msg = { id: Date.now(), from, text, timestamp: new Date() };
  messages.push(msg);

  const reply = { id: Date.now() + 1, from: "bot", text: "Echo: " + text };
  messages.push(reply);

  res.json({ user: msg, bot: reply });
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log('In-memory API ready');
});

