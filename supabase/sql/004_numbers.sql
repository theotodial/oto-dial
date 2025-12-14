CREATE TABLE phone_numbers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  number TEXT UNIQUE,
  country TEXT,
  created_at TIMESTAMP DEFAULT now()
);

