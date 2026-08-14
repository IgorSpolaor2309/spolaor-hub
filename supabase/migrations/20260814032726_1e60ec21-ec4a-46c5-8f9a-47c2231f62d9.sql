-- 1. Fix mutable search_path on remaining functions
ALTER FUNCTION public.update_updated_at_column() SET search_path = public;
ALTER FUNCTION public.validate_contract_model_activation() SET search_path = public;

-- 2. commercial_prospect_history: remove blanket ALL policy (staff policies already exist)
DROP POLICY IF EXISTS "history_admin_all" ON public.commercial_prospect_history;
CREATE POLICY "history_staff_manage" ON public.commercial_prospect_history
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'collaborator'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'collaborator'::app_role));

-- 3. commercial_prospects: remove anon/authenticated unrestricted UPDATE policies
DROP POLICY IF EXISTS "Public can update own prospect journey" ON public.commercial_prospects;
DROP POLICY IF EXISTS "Public can update prospects" ON public.commercial_prospects;
DROP POLICY IF EXISTS "commercial_prospects_public_update" ON public.commercial_prospects;

-- 4. commercial_prospects: remove permissive SELECT for any authenticated user
DROP POLICY IF EXISTS "commercial_prospects_admin_select" ON public.commercial_prospects;

-- 5. custom_proposals: scope management to staff roles
DROP POLICY IF EXISTS "Authenticated users can manage proposals" ON public.custom_proposals;
CREATE POLICY "custom_proposals_staff_manage" ON public.custom_proposals
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'collaborator'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'collaborator'::app_role));

-- 6. leads: remove anon unrestricted UPDATE (writes go through trusted server functions)
DROP POLICY IF EXISTS "Public can update their own leads" ON public.leads;

-- 7. leads: scope SELECT to staff roles
DROP POLICY IF EXISTS "Authenticated users can see leads" ON public.leads;
CREATE POLICY "leads_staff_select" ON public.leads
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'collaborator'::app_role));

-- 8. proposal_history / lead_history: scope to staff roles
DROP POLICY IF EXISTS "Authenticated users can see history" ON public.proposal_history;
DROP POLICY IF EXISTS "Authenticated users can insert history" ON public.proposal_history;
CREATE POLICY "proposal_history_staff_select" ON public.proposal_history
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'collaborator'::app_role));
CREATE POLICY "proposal_history_staff_insert" ON public.proposal_history
  FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'collaborator'::app_role));

DROP POLICY IF EXISTS "Authenticated can see lead history" ON public.lead_history;
DROP POLICY IF EXISTS "Authenticated can insert lead history" ON public.lead_history;
CREATE POLICY "lead_history_staff_select" ON public.lead_history
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'collaborator'::app_role));
CREATE POLICY "lead_history_staff_insert" ON public.lead_history
  FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'collaborator'::app_role));