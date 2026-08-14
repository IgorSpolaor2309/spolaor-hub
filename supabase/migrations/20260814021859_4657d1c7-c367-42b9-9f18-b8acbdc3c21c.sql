
ALTER TABLE public.leads 
ADD COLUMN IF NOT EXISTS responsible_profile_id UUID REFERENCES public.profiles(id),
ADD COLUMN IF NOT EXISTS priority TEXT DEFAULT 'média',
ADD COLUMN IF NOT EXISTS next_action_description TEXT,
ADD COLUMN IF NOT EXISTS next_action_date TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS internal_notes TEXT;
