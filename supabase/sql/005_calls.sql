CREATE TABLE calls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  from_number TEXT,
  to_number TEXT,
  status TEXT,
  created_at TIMESTAMP DEFAULT now()
);

