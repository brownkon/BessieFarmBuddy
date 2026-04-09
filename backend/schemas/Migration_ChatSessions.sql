-- Migration: Add Chat Sessions support

-- 1. Create chat_sessions table
CREATE TABLE IF NOT EXISTS public.chat_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  title text DEFAULT 'New Chat',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 2. Add session_id to chats table
ALTER TABLE public.chats ADD COLUMN IF NOT EXISTS session_id uuid REFERENCES public.chat_sessions(id) ON DELETE CASCADE;

-- 3. Create index for performance
CREATE INDEX IF NOT EXISTS idx_chats_session_id ON public.chats(session_id);

-- 4. Enable RLS on chat_sessions
ALTER TABLE public.chat_sessions ENABLE ROW LEVEL SECURITY;

-- 5. Add RLS Policies for chat_sessions
CREATE POLICY "Users can manage own sessions" ON public.chat_sessions
  FOR ALL USING (auth.uid() = user_id);

-- 6. Update Chats RLS Policy to reflect session-based access (optional, existing policy already covers user_id)
-- Existing policy: CREATE POLICY "Users can manage own chats" ON public.chats FOR ALL USING (auth.uid() = user_id);

-- 7. Backfill: Create a default session for each user who has existing chats and link them
DO $$
DECLARE
    r RECORD;
    new_session_id uuid;
BEGIN
    FOR r IN SELECT DISTINCT user_id FROM public.chats WHERE session_id IS NULL LOOP
        INSERT INTO public.chat_sessions (user_id, title)
        VALUES (r.user_id, 'Legacy Chat History')
        RETURNING id INTO new_session_id;

        UPDATE public.chats
        SET session_id = new_session_id
        WHERE user_id = r.user_id AND session_id IS NULL;
    END LOOP;
END $$;
