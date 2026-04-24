-- Cow Data Table (Linked to Organizations)
-- This table is the "Single Source of Truth" for all animal data consolidated from multiple reports.

DROP TABLE IF EXISTS public.farmer_notes CASCADE;
DROP TABLE IF EXISTS public.cow_data CASCADE;

CREATE TABLE public.cow_data (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  
  -- Identifiers
  animal_number int NOT NULL,
  animal_tag_id text,
  animal_name text,
  
  -- Location & Grouping
  group_number text,
  location text,
  robot text,
  
  -- Cow Stats
  age float, -- Years.months format (e.g., 4.07)
  lactation_no int,
  lactation_days int,
  lactation_day_category int, -- 1-5 (converted from Roman)
  
  -- Reproduction
  days_pregnant int,
  reproduction_status text,
  days_since_heat int,
  last_heat text,
  last_insemination text,
  insemination_no int,

  heat_probability_max int,
  optimum_insemination_moment float, -- nCurrent/1080
  on_set_of_heat text,
  hours_since_heat int,
  sire text,
  expected_calving_date text,
  pregnancy_remark text,
  calving_remark text,
  health_remark text,
  insemination_remarks text,
  
  -- Production
  day_production float,
  day_production_deviation float,
  milk_yield_expected float,
  milk_frequency float,
  milkings float,
  failures float,
  failed_milking boolean,
  interval_exceeded int,
  time_away text,
  too_late_for_milking boolean,
  
  -- Health Status
  activity boolean,
  sick_chance boolean,
  disease_name text,
  
  -- Milk Separation
  milk_separation_status text,
  milk_separation_type text,
  milk_separation_tank text,
  milk_separation_start_date text,
  milk_separation_end_date text,
  milk_separation_remaining_days int,
  hot_rinse_activated boolean,
  
  -- Treatment Details
  medicine_name text,
  medicine_dosage float,
  dosage_unit text,
  treatment_plan_name text,
  treatment_description text,
  expected_application_date text,
  route_of_administration text,
  claw_teat text,
  last_routing_visit_direction text,
  mus_id int,
  
  -- Raw & Complex Data
  sensors jsonb, -- { "SensorName": "Value", ... }
  severeness jsonb, -- { "SensorName": 87, ... }
  
  updated_at timestamptz DEFAULT now(),
  
  UNIQUE(organization_id, animal_number)
);

-- Farmer Notes Table
CREATE TABLE public.farmer_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  content text NOT NULL,
  animal_number int,
  created_at timestamptz DEFAULT now()
);

-- Indexes for performance
CREATE INDEX idx_cow_data_org_id ON public.cow_data(organization_id);
CREATE INDEX idx_cow_data_animal_number ON public.cow_data(animal_number);
CREATE INDEX idx_cow_data_activity ON public.cow_data(activity);
CREATE INDEX idx_cow_data_sick_chance ON public.cow_data(sick_chance);
CREATE INDEX idx_farmer_notes_animal_number ON public.farmer_notes(animal_number);

-- RLS
ALTER TABLE public.cow_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.farmer_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can read their cow data" ON public.cow_data
  FOR SELECT USING (
    organization_id = (SELECT organization_id FROM public.profiles WHERE id = auth.uid())
  );

CREATE POLICY "Leaders can manage cow data" ON public.cow_data
  FOR ALL USING (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'boss' AND
    organization_id = (SELECT organization_id FROM public.profiles WHERE id = auth.uid())
  );

CREATE POLICY "Users can manage own organization notes" ON public.farmer_notes
  FOR ALL USING (
    organization_id = (SELECT organization_id FROM public.profiles WHERE id = auth.uid())
  );
