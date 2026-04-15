-- 1. Enable UUID Extension (usually enabled by default)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

--------------------------------------------------------------------------------
-- TABLES
--------------------------------------------------------------------------------

-- Organizations Table (Top-level groups)
CREATE TABLE IF NOT EXISTS public.organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  billing_info text,
  location text,
  access_code text UNIQUE,
  created_at timestamptz DEFAULT now()
);

-- Profiles Table (Extended user data, links to auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text UNIQUE,
  display_name text,
  organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  role text DEFAULT 'employee' CHECK (role IN ('boss', 'employee')),
  created_at timestamptz DEFAULT now()
);


-- Chat Sessions Table (Groups of messages)
CREATE TABLE IF NOT EXISTS public.chat_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  title text DEFAULT 'New Chat',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Chats Table (Interaction history)
CREATE TABLE IF NOT EXISTS public.chats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid REFERENCES public.chat_sessions(id) ON DELETE CASCADE,
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  prompt text NOT NULL,
  response text NOT NULL,
  timestamp timestamptz DEFAULT now(),
  gps_coordinates jsonb,
  tools_used jsonb
);

CREATE INDEX IF NOT EXISTS idx_chats_session_id ON public.chats(session_id);

--------------------------------------------------------------------------------
-- ROW LEVEL SECURITY (RLS)
--------------------------------------------------------------------------------

-- Enable RLS on all tables
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chats ENABLE ROW LEVEL SECURITY;

-- 1. Profiles: Users can read/write their own profile
CREATE POLICY "Users can manage own profile" ON public.profiles
  FOR ALL USING (auth.uid() = id);

-- 2. Organizations: Users can read organizations they belong to
CREATE POLICY "Members can read their organizations" ON public.organizations
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE organization_id = public.organizations.id 
      AND id = auth.uid()
    )
  );

-- 3. Profiles: Users can see teammates
CREATE POLICY "Users can see teammates" ON public.profiles
  FOR SELECT USING (
    organization_id IN (
      SELECT organization_id FROM public.profiles WHERE id = auth.uid()
    )
  );

-- 4. Chat Sessions: Users can manage own sessions
CREATE POLICY "Users can manage own sessions" ON public.chat_sessions
  FOR ALL USING (auth.uid() = user_id);

-- 5. Chats: Users can read/write their own chat history
CREATE POLICY "Users can manage own chats" ON public.chats
  FOR ALL USING (auth.uid() = user_id);

-- 5. Organization Leaders: 'boss' role can read/write for anyone in their organization
CREATE POLICY "Leaders can manage organization chats" ON public.chats
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE organization_id IN (
        SELECT organization_id FROM public.profiles WHERE id = auth.uid() AND role = 'boss'
      )
      AND id = public.chats.user_id
    )
  );

CREATE POLICY "Leaders can manage team profiles" ON public.profiles
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.organization_id = public.profiles.organization_id 
      AND p.id = auth.uid() 
      AND p.role = 'boss'
    )
  );

--------------------------------------------------------------------------------
-- AUTOMATION & BACKFILLS
--------------------------------------------------------------------------------

-- Function to handle auto-profile creation on signup
CREATE OR REPLACE FUNCTION public.handle_new_user() 
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, email, display_name)
  VALUES (new.id, new.email, new.raw_user_meta_data->>'display_name');
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to execute the function after a new user confirms signup
CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Backfill existing users into profiles (Run this once if you already have users)
INSERT INTO public.profiles (id, email)
SELECT id, email FROM auth.users
ON CONFLICT (id) DO NOTHING;
