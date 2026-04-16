-- Drop the table if it already exists (useful for development/resets)
DROP TABLE IF EXISTS public.cow_data CASCADE;

-- Cow Data Table (Linked to Organizations)
CREATE TABLE public.cow_data (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  animal_number text NOT NULL,
  cow_group text,
  location text,
  robot text,
  animal_tag_id text,
  animal_life_no text,
  lactation_no int,
  lactation_days int,
  day_production float,
  day_production_deviation float,
  reproduction_status text,
  last_insemination text,
  days_pregnant int,
  days_to_dry_off int,
  expected_calving_date text,
  production_status text,
  gender text,
  
  -- Additional fields from Actual 1 & 2 reports
  rest_feed float,
  failures int,
  failed_milking int,
  milkings_lactation float,
  milkings_milk float,
  fat_protein_ratio float,
  nr_of_refusal int,
  color_code text,
  end_milk_till text,
  milk_separation text,
  body_score float,
  intake_total float,
  rest_feed_total float,
  scc_indication int,
  last_fertility_diagnose text,
  last_fertility_remarks text,
  last_fertility text,
  days_since_heat int,
  insemination_no int,
  pregnancy_check_date text,
  lf float,
  lr float,
  rr float,
  rf float,
  milk_temperature float,
  rumination_herd int,
  rumination_att_count int,
  inversion_ketosis text,
  activity_deviation int,
  rumination_minutes int,
  sire text,
  inseminate text,
  too_late_for_milking text,
  milk_visit_yield float,
  last_milk text,
  train_cow text,
  calving_date text,
  sick_chance int,
  sick_change_status text,

  sensors jsonb, -- Stores cleaned sensor data: { "SensorName": "Value", ... }
  severeness jsonb, -- Stores parsed severeness levels: { "SensorName": 87, ... }
  updated_at timestamptz DEFAULT now(),
  UNIQUE(organization_id, animal_number)
);

-- Enable RLS
ALTER TABLE public.cow_data ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Members can read their organization's cow data
CREATE POLICY "Members can read their cow data" ON public.cow_data
  FOR SELECT USING (
    organization_id = public.get_auth_user_org_id()
  );

-- RLS Policy: Leaders can manage cow data
CREATE POLICY "Leaders can manage cow data" ON public.cow_data
  FOR ALL USING (
    organization_id = public.get_auth_user_org_id() AND public.get_auth_user_role() = 'boss'
  );

-- Farmer Notes Table
DROP TABLE IF EXISTS public.farmer_notes CASCADE;
CREATE TABLE public.farmer_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  content text NOT NULL,
  animal_number text,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.farmer_notes ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can view notes for their organization
CREATE POLICY "Users can read their organization's notes" ON public.farmer_notes
  FOR SELECT USING (
    organization_id = public.get_auth_user_org_id()
  );

-- RLS Policy: Users can insert their own notes
CREATE POLICY "Users can insert their own notes" ON public.farmer_notes
  FOR INSERT WITH CHECK (
    user_id = auth.uid() AND
    organization_id = public.get_auth_user_org_id()
  );
