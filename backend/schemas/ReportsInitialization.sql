-- Drop the table if it already exists (useful for development/resets)
DROP TABLE IF EXISTS public.cow_data CASCADE;

-- Cow Data Table (Linked to Organizations)
CREATE TABLE public.cow_data (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  animal_number text NOT NULL,
  cow_group text,
  lactation_days int,
  day_production float,
  sensors jsonb, -- Stores cleaned sensor data: { "SensorName": "Value", ... }
  severeness jsonb, -- Stores parsed severeness levels: { "SensorName": 87, ... }
  sick_chance int,
  sick_change_status text,
  updated_at timestamptz DEFAULT now(),
  UNIQUE(organization_id, animal_number)
);

-- Enable RLS
ALTER TABLE public.cow_data ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Members can read their organization's cow data
CREATE POLICY "Members can read their cow data" ON public.cow_data
  FOR SELECT USING (
    organization_id IN (
      SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()
    )
  );

-- RLS Policy: Leaders can manage cow data
CREATE POLICY "Leaders can manage cow data" ON public.cow_data
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.organization_members 
      WHERE organization_id = public.cow_data.organization_id 
      AND user_id = auth.uid() 
      AND role = 'boss'
    )
  );
