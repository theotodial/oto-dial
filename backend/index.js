const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const supabase = require('./src/supabase');

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

// Health check route
app.get('/', (req, res) => {
  res.json({ status: 'OK' });
});

// Auth Routes
const handleSignup = async (req, res) => {
  const { email, password, name, full_name } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  try {
    // Hash password before storing
    const hashedPassword = await bcrypt.hash(password, 10);

    // Insert user into users table
    const { data: user, error: userError } = await supabase
      .from('users')
      .insert({
        email,
        password_hash: hashedPassword,
        name: name || full_name || null
      })
      .select('id, email')
      .single();

    if (userError) {
      if (userError.code === '23505') {
        return res.status(400).json({ error: 'User already exists' });
      }
      return res.status(500).json({ error: userError.message });
    }

    // Create wallet row with balance 0
    const { error: walletError } = await supabase
      .from('wallets')
      .insert({
        user_id: user.id,
        balance: 0
      });

    if (walletError) {
      return res.status(500).json({ error: walletError.message });
    }

    res.json({ id: user.id, email: user.email });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const handleLogin = async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  try {
    // Query users table by email
    const { data: user, error } = await supabase
      .from('users')
      .select('id, email, password_hash')
      .eq('email', email)
      .single();

    if (error || !user) {
      return res.status(400).json({ error: 'User not found' });
    }

    // Compare password with stored hash
    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(400).json({ error: 'Wrong password' });
    }

    res.json({ id: user.id, email: user.email });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Support both /api/auth/* and /api/* routes
app.post('/api/auth/signup', handleSignup);
app.post('/api/signup', handleSignup);
app.post('/api/auth/login', handleLogin);
app.post('/api/login', handleLogin);

// Supabase Auth signup endpoint
app.post('/api/auth/supabase/signup', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  try {
    const { data, error } = await supabase.auth.signUp({
      email,
      password
    });

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    if (!data.user) {
      return res.status(400).json({ error: 'User creation failed' });
    }

    res.json({ id: data.user.id, email: data.user.email });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Supabase Auth login endpoint
app.post('/api/auth/supabase/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    if (error) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    if (!data.session || !data.user) {
      return res.status(401).json({ error: 'Login failed' });
    }

    res.json({
      access_token: data.session.access_token,
      token_type: 'bearer',
      expires_in: data.session.expires_in,
      user: {
        id: data.user.id,
        email: data.user.email
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Wallet Routes
app.get('/api/wallet/:user_id', async (req, res) => {
  const user_id = req.params.user_id;

  try {
    const { data: wallet, error } = await supabase
      .from('wallets')
      .select('balance')
      .eq('user_id', user_id)
      .single();

    if (error || !wallet) {
      return res.json({ balance: 0 });
    }

    res.json({ balance: wallet.balance });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/wallet/topup', async (req, res) => {
  const { user_id, amount } = req.body;

  try {
    // Get current balance
    const { data: wallet, error: fetchError } = await supabase
      .from('wallets')
      .select('balance')
      .eq('user_id', user_id)
      .single();

    if (fetchError || !wallet) {
      return res.status(404).json({ error: 'Wallet not found' });
    }

    const newBalance = Number(wallet.balance) + Number(amount);

    // Update wallet balance
    const { data: updated, error: updateError } = await supabase
      .from('wallets')
      .update({ balance: newBalance, updated_at: new Date().toISOString() })
      .eq('user_id', user_id)
      .select('balance')
      .single();

    if (updateError) {
      return res.status(500).json({ error: updateError.message });
    }

    res.json({ success: true, balance: updated.balance });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Numbers Routes
app.post('/api/numbers/buy', async (req, res) => {
  const { user_id, country } = req.body;

  try {
    const fakeNumber = "+1" + Math.floor(1000000000 + Math.random() * 9000000000);

    // Insert into phone_numbers table
    const { data: createdNumber, error: insertError } = await supabase
      .from('phone_numbers')
      .insert({
        user_id,
        number: fakeNumber,
        country: country || 'US'
      })
      .select()
      .single();

    if (insertError) {
      return res.status(500).json({ error: insertError.message });
    }

    // Deduct from wallet
    const { data: wallet } = await supabase
      .from('wallets')
      .select('balance')
      .eq('user_id', user_id)
      .single();

    if (wallet) {
      await supabase
        .from('wallets')
        .update({ balance: Number(wallet.balance) - 1, updated_at: new Date().toISOString() })
        .eq('user_id', user_id);
    }

    res.json({ number: createdNumber });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/numbers/:user_id', async (req, res) => {
  const user_id = req.params.user_id;

  try {
    const { data: userNumbers, error } = await supabase
      .from('phone_numbers')
      .select('*')
      .eq('user_id', user_id);

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    res.json(userNumbers || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Call Routes
app.post('/api/calls', async (req, res) => {
  const { user_id, from_number, to_number, status } = req.body;

  try {
    const { data: call, error } = await supabase
      .from('calls')
      .insert({
        user_id,
        from_number,
        to_number,
        status: status || 'completed'
      })
      .select()
      .single();

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    res.json(call);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/calls/:user_id', async (req, res) => {
  const user_id = req.params.user_id;

  try {
    const { data: userCalls, error } = await supabase
      .from('calls')
      .select('*')
      .eq('user_id', user_id);

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    res.json(userCalls || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Chat Routes
app.get('/api/chat', async (req, res) => {
  try {
    const { data: messages, error } = await supabase
      .from('messages')
      .select('*')
      .order('created_at', { ascending: true });

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    res.json(messages || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/chat', async (req, res) => {
  const { user_id, text } = req.body;

  try {
    // Insert user message
    const { data: userMsg, error: userError } = await supabase
      .from('messages')
      .insert({
        user_id,
        direction: 'outbound',
        content: text
      })
      .select()
      .single();

    if (userError) {
      return res.status(500).json({ error: userError.message });
    }

    // Insert bot reply
    const { data: botMsg, error: botError } = await supabase
      .from('messages')
      .insert({
        user_id,
        direction: 'inbound',
        content: 'Echo: ' + text
      })
      .select()
      .single();

    if (botError) {
      return res.status(500).json({ error: botError.message });
    }

    res.json({ user: userMsg, bot: botMsg });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Database test route
app.get('/api/db-test', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .limit(1);

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log('In-memory API ready');
});

