-- Migration: Merge report_preferences into profiles
-- Run this in the Supabase SQL Editor

-- 1. Add report preference columns to profiles (with defaults matching old table)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS report_delivery_method text DEFAULT 'email' CHECK (report_delivery_method IN ('email', 'none')),
  ADD COLUMN IF NOT EXISTS report_delivery_destination text,
  ADD COLUMN IF NOT EXISTS report_schedule_enabled boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS report_schedule_time time DEFAULT '18:00',
  ADD COLUMN IF NOT EXISTS report_timezone text DEFAULT 'America/Denver';

-- 2. Migrate existing data from report_preferences into profiles
UPDATE public.profiles p
SET
  report_delivery_method      = rp.delivery_method,
  report_delivery_destination = rp.delivery_destination,
  report_schedule_enabled     = rp.schedule_enabled,
  report_schedule_time        = rp.schedule_time,
  report_timezone             = rp.timezone
FROM public.report_preferences rp
WHERE p.id = rp.user_id;

-- 3. Drop the old report_preferences table (and its policies/constraints cascade)
DROP TABLE IF EXISTS public.report_preferences;
