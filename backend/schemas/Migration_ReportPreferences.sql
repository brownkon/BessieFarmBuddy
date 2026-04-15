-- Migration: Daily Report Preferences
-- Run this in Supabase SQL Editor

-- 1. Report Preferences Table
CREATE TABLE IF NOT EXISTS public.report_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
  delivery_method text DEFAULT 'email' CHECK (delivery_method IN ('email', 'none')),
  delivery_destination text,  -- email address
  schedule_enabled boolean DEFAULT true,
  schedule_time time DEFAULT '18:00',  -- local time for scheduled report
  timezone text DEFAULT 'America/Denver',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 2. Enable RLS
ALTER TABLE public.report_preferences ENABLE ROW LEVEL SECURITY;

-- 3. RLS Policy: Users can manage own report preferences
CREATE POLICY "Users can manage own report prefs" ON public.report_preferences
  FOR ALL USING (auth.uid() = user_id);

-- 4. Report Send Log (for rate limiting)
CREATE TABLE IF NOT EXISTS public.report_send_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  sent_at timestamptz DEFAULT now(),
  delivery_method text,
  success boolean DEFAULT true
);

ALTER TABLE public.report_send_log ENABLE ROW LEVEL SECURITY;

-- 5. RLS Policies for send log
CREATE POLICY "Users can read own send log" ON public.report_send_log
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own send log" ON public.report_send_log
  FOR INSERT WITH CHECK (auth.uid() = user_id);
