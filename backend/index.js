const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const supabase = require('./src/supabase');
const {
  createErrorResponse,
  createSuccessResponse,
  validationError,
  authenticationError,
  notFoundError,
  errorMiddleware,
  asyncHandler
} = require('./src/errorHandler');
const { logRequest, logError } = require('./src/logger');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
// CORS configuration: supports localhost frontends and deployed Vercel frontend
// Note: In production, consider restricting origin to specific URLs for better security
app.use(cors({
  origin: "*", // Allows all origins (localhost and Vercel deployments)
  methods: ["GET", "POST"], // Allowed HTTP methods
  allowedHeaders: ["Content-Type", "Authorization"], // Allowed request headers
  credentials: true
}));
app.use(express.json());

// Request logging middleware (auth, wallet, calls only)
app.use(logRequest);

// Health check route
app.get('/', (req, res) => {
  res.json({ status: 'OK' });
});

// ============================================================
// Auth Routes
// ============================================================

const handleSignup = asyncHandler(async (req, res) => {
  const { email, password, name, full_name } = req.body;

  // Validation
  if (!email || !password) {
    const error = validationError('Email and password are required');
    const { response, status } = createErrorResponse(error);
    return res.status(status).json(response);
  }

  if (password.length < 6) {
    const error = validationError('Password must be at least 6 characters');
    const { response, status } = createErrorResponse(error);
    return res.status(status).json(response);
  }

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
    // Map duplicate email error
    if (userError.code === '23505') {
      const error = validationError('An account with this email already exists');
      const { response, status } = createErrorResponse(error);
      return res.status(status).json(response);
    }
    const { response, status } = createErrorResponse(userError);
    return res.status(status).json(response);
  }

  // Create wallet row with balance 0
  const { error: walletError } = await supabase
    .from('wallets')
    .insert({
      user_id: user.id,
      balance: 0
    });

  if (walletError) {
    const { response, status } = createErrorResponse(walletError);
    return res.status(status).json(response);
  }

  res.json(createSuccessResponse({ id: user.id, email: user.email }));
});

const handleLogin = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  // Validation
  if (!email || !password) {
    const error = validationError('Email and password are required');
    const { response, status } = createErrorResponse(error);
    return res.status(status).json(response);
  }

  // Query users table by email
  const { data: user, error } = await supabase
    .from('users')
    .select('id, email, password_hash')
    .eq('email', email)
    .single();

  if (error || !user) {
    const authError = authenticationError('Invalid email or password');
    const { response, status } = createErrorResponse(authError);
    return res.status(status).json(response);
  }

  // Compare password with stored hash
  const isMatch = await bcrypt.compare(password, user.password_hash);
  if (!isMatch) {
    const authError = authenticationError('Invalid email or password');
    const { response, status } = createErrorResponse(authError);
    return res.status(status).json(response);
  }

  res.json(createSuccessResponse({ id: user.id, email: user.email }));
});

// Support both /api/auth/* and /api/* routes
app.post('/api/auth/signup', handleSignup);
app.post('/api/signup', handleSignup);
app.post('/api/auth/login', handleLogin);
app.post('/api/login', handleLogin);

// Supabase Auth signup endpoint
app.post('/api/auth/supabase/signup', asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  // Validation
  if (!email || !password) {
    const error = validationError('Email and password are required');
    const { response, status } = createErrorResponse(error);
    return res.status(status).json(response);
  }

  if (password.length < 6) {
    const error = validationError('Password must be at least 6 characters');
    const { response, status } = createErrorResponse(error);
    return res.status(status).json(response);
  }

  const { data, error } = await supabase.auth.signUp({
    email,
    password
  });

  if (error) {
    const { response, status } = createErrorResponse(error, 'Failed to create account');
    return res.status(status).json(response);
  }

  if (!data.user) {
    const { response, status } = createErrorResponse(null, 'Account creation failed');
    return res.status(status).json(response);
  }

  res.json(createSuccessResponse({ id: data.user.id, email: data.user.email }));
}));

// Supabase Auth login endpoint
app.post('/api/auth/supabase/login', asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  // Validation
  if (!email || !password) {
    const error = validationError('Email and password are required');
    const { response, status } = createErrorResponse(error);
    return res.status(status).json(response);
  }

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password
  });

  if (error) {
    const authError = authenticationError('Invalid email or password');
    const { response, status } = createErrorResponse(authError);
    return res.status(status).json(response);
  }

  if (!data.session || !data.user) {
    const authError = authenticationError('Login failed');
    const { response, status } = createErrorResponse(authError);
    return res.status(status).json(response);
  }

  res.json(createSuccessResponse({
    access_token: data.session.access_token,
    token_type: 'bearer',
    expires_in: data.session.expires_in,
    user: {
      id: data.user.id,
      email: data.user.email
    }
  }));
}));

// ============================================================
// Middleware to extract user from Authorization header
// ============================================================
const authenticateUser = asyncHandler(async (req, res, next) => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    const error = authenticationError('Authorization required');
    const { response, status } = createErrorResponse(error);
    return res.status(status).json(response);
  }

  const token = authHeader.substring(7);

  // Verify token with Supabase
  const { data: { user }, error } = await supabase.auth.getUser(token);

  if (error || !user) {
    const authError = authenticationError('Invalid or expired token');
    const { response, status } = createErrorResponse(authError);
    return res.status(status).json(response);
  }

  // Attach user to request
  req.user = user;
  next();
});

// ============================================================
// Wallet Routes
// ============================================================

// Get wallet (with auth)
app.get('/api/wallet', authenticateUser, asyncHandler(async (req, res) => {
  const userId = req.user.id;

  const { data: wallet, error } = await supabase
    .from('wallets')
    .select('balance')
    .eq('user_id', userId)
    .single();

  if (error || !wallet) {
    // Return default balance if wallet doesn't exist
    return res.json(createSuccessResponse({ balance: 0 }));
  }

  res.json(createSuccessResponse({ balance: wallet.balance }));
}));

// Legacy route (backward compatibility)
app.get('/api/wallet/:user_id', asyncHandler(async (req, res) => {
  const user_id = req.params.user_id;

  const { data: wallet, error } = await supabase
    .from('wallets')
    .select('balance')
    .eq('user_id', user_id)
    .single();

  if (error || !wallet) {
    return res.json(createSuccessResponse({ balance: 0 }));
  }

  res.json(createSuccessResponse({ balance: wallet.balance }));
}));

// Top up wallet
app.post('/api/wallet/topup', authenticateUser, asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { amount } = req.body;

  // Validation
  if (!amount || isNaN(amount) || amount <= 0) {
    const error = validationError('Amount must be a positive number');
    const { response, status } = createErrorResponse(error);
    return res.status(status).json(response);
  }

  // Get current balance
  const { data: wallet, error: fetchError } = await supabase
    .from('wallets')
    .select('balance')
    .eq('user_id', userId)
    .single();

  if (fetchError || !wallet) {
    const error = notFoundError('Wallet');
    const { response, status } = createErrorResponse(error);
    return res.status(status).json(response);
  }

  const newBalance = Number(wallet.balance) + Number(amount);

  // Update wallet balance
  const { data: updated, error: updateError } = await supabase
    .from('wallets')
    .update({ balance: newBalance, updated_at: new Date().toISOString() })
    .eq('user_id', userId)
    .select('balance')
    .single();

  if (updateError) {
    const { response, status } = createErrorResponse(updateError);
    return res.status(status).json(response);
  }

  res.json(createSuccessResponse({ balance: updated.balance }));
}));

// ============================================================
// Phone Numbers Routes
// ============================================================

// Buy a number
app.post('/api/numbers/buy', authenticateUser, asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { country } = req.body;

  // Generate fake number
  const fakeNumber = "+1" + Math.floor(1000000000 + Math.random() * 9000000000);

  // Check wallet balance first
  const { data: wallet } = await supabase
    .from('wallets')
    .select('balance')
    .eq('user_id', userId)
    .single();

  if (!wallet || wallet.balance < 1) {
    const error = validationError('Insufficient balance. Please top up your wallet');
    const { response, status } = createErrorResponse(error);
    return res.status(status).json(response);
  }

  // Insert into phone_numbers table
  const { data: createdNumber, error: insertError } = await supabase
    .from('phone_numbers')
    .insert({
      user_id: userId,
      number: fakeNumber,
      country: country || 'US'
    })
    .select()
    .single();

  if (insertError) {
    const { response, status } = createErrorResponse(insertError);
    return res.status(status).json(response);
  }

  // Deduct from wallet
  await supabase
    .from('wallets')
    .update({ 
      balance: Number(wallet.balance) - 1, 
      updated_at: new Date().toISOString() 
    })
    .eq('user_id', userId);

  res.json(createSuccessResponse({ number: createdNumber }));
}));

// Get user's numbers
app.get('/api/numbers', authenticateUser, asyncHandler(async (req, res) => {
  const userId = req.user.id;

  const { data: userNumbers, error } = await supabase
    .from('phone_numbers')
    .select('*')
    .eq('user_id', userId);

  if (error) {
    const { response, status } = createErrorResponse(error);
    return res.status(status).json(response);
  }

  res.json(createSuccessResponse({ numbers: userNumbers || [] }));
}));

// Legacy route (backward compatibility)
app.get('/api/numbers/:user_id', asyncHandler(async (req, res) => {
  const user_id = req.params.user_id;

  const { data: userNumbers, error } = await supabase
    .from('phone_numbers')
    .select('*')
    .eq('user_id', user_id);

  if (error) {
    const { response, status } = createErrorResponse(error);
    return res.status(status).json(response);
  }

  res.json(userNumbers || []);
}));

// ============================================================
// Call Routes
// ============================================================

// Create a call
app.post('/api/calls', authenticateUser, asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { from_number, to_number, status } = req.body;

  // Validation
  if (!from_number || !to_number) {
    const error = validationError('From number and to number are required');
    const { response, status } = createErrorResponse(error);
    return res.status(status).json(response);
  }

  const { data: call, error } = await supabase
    .from('calls')
    .insert({
      user_id: userId,
      from_number,
      to_number,
      status: status || 'completed'
    })
    .select()
    .single();

  if (error) {
    const { response, status } = createErrorResponse(error);
    return res.status(status).json(response);
  }

  res.json(createSuccessResponse({ call }));
}));

// Get user's calls
app.get('/api/calls', authenticateUser, asyncHandler(async (req, res) => {
  const userId = req.user.id;

  const { data: userCalls, error } = await supabase
    .from('calls')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) {
    const { response, status } = createErrorResponse(error);
    return res.status(status).json(response);
  }

  res.json(createSuccessResponse({ calls: userCalls || [] }));
}));

// Legacy route (backward compatibility)
app.get('/api/calls/:user_id', asyncHandler(async (req, res) => {
  const user_id = req.params.user_id;

  const { data: userCalls, error } = await supabase
    .from('calls')
    .select('*')
    .eq('user_id', user_id);

  if (error) {
    const { response, status } = createErrorResponse(error);
    return res.status(status).json(response);
  }

  res.json(userCalls || []);
}));

// ============================================================
// Chat Routes
// ============================================================

// Get chat messages
app.get('/api/chat', authenticateUser, asyncHandler(async (req, res) => {
  const userId = req.user.id;

  const { data: messages, error } = await supabase
    .from('messages')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: true });

  if (error) {
    const { response, status } = createErrorResponse(error);
    return res.status(status).json(response);
  }

  res.json(createSuccessResponse({ messages: messages || [] }));
}));

// Send chat message
app.post('/api/chat', authenticateUser, asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { text } = req.body;

  // Validation
  if (!text || text.trim().length === 0) {
    const error = validationError('Message text is required');
    const { response, status } = createErrorResponse(error);
    return res.status(status).json(response);
  }

  // Insert user message
  const { data: userMsg, error: userError } = await supabase
    .from('messages')
    .insert({
      user_id: userId,
      direction: 'outbound',
      content: text
    })
    .select()
    .single();

  if (userError) {
    const { response, status } = createErrorResponse(userError);
    return res.status(status).json(response);
  }

  // Insert bot reply
  const { data: botMsg, error: botError } = await supabase
    .from('messages')
    .insert({
      user_id: userId,
      direction: 'inbound',
      content: 'Echo: ' + text
    })
    .select()
    .single();

  if (botError) {
    const { response, status } = createErrorResponse(botError);
    return res.status(status).json(response);
  }

  res.json(createSuccessResponse({ user: userMsg, bot: botMsg }));
}));

// ============================================================
// Database Test Route
// ============================================================

app.get('/api/db-test', asyncHandler(async (req, res) => {
  const { data, error } = await supabase
    .from('users')
    .select('count')
    .limit(1);

  if (error) {
    const { response, status } = createErrorResponse(error);
    return res.status(status).json(response);
  }

  res.json(createSuccessResponse({ database: 'connected' }));
}));

// ============================================================
// Error Handling Middleware (must be last)
// ============================================================

app.use(errorMiddleware);

// ============================================================
// Start Server
// ============================================================

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log('Standardized API with consistent error handling ready');
});
