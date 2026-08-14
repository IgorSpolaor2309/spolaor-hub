-- Add setup_value to plans if missing (optional but good for consistency)
-- ALTER TABLE public.plans ADD COLUMN IF NOT EXISTS setup_value numeric(10,2) DEFAULT 0;

-- Update generated_contracts validation status
-- We might need a flag to indicate validation status if we were to enforce it DB-level, 
-- but for now we'll handle it in the application logic as requested.

-- Grant access to plans and plan_services for better data extraction
GRANT SELECT ON public.plans TO authenticated, service_role, anon;
GRANT SELECT ON public.plan_services TO authenticated, service_role, anon;
GRANT SELECT ON public.services TO authenticated, service_role, anon;

-- Ensure commercial_prospects has the necessary fields (already has original_value which we'll use for setup)
