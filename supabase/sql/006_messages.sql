CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  direction TEXT, -- inbound or outbound
  content TEXT,
  created_at TIMESTAMP DEFAULT now()
);

