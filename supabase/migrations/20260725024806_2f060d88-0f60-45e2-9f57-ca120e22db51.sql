-- Fix Processos staff RLS and admin-only delete.
-- Idempotent: drops old permissive policies (if present) and recreates per-operation policies
-- scoped by user_has_client_access() for collaborators. Admin gets full CRUD.
-- Client (portal) access is not managed by these tables' policies — it goes through
-- SECURITY DEFINER RPCs (client_list_processes, client_process_detail, etc.), which are
-- preserved untouched.

BEGIN;

-- =============================================================================
-- company_processes
-- =============================================================================
DROP POLICY IF EXISTS "company_processes read staff"  ON public.company_processes;
DROP POLICY IF EXISTS "company_processes write staff" ON public.company_processes;
DROP POLICY IF EXISTS "company_processes select staff"   ON public.company_processes;
DROP POLICY IF EXISTS "company_processes insert staff"   ON public.company_processes;
DROP POLICY IF EXISTS "company_processes update staff"   ON public.company_processes;
DROP POLICY IF EXISTS "company_processes delete admin"   ON public.company_processes;

CREATE POLICY "company_processes select staff"
  ON public.company_processes FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR (public.has_role(auth.uid(), 'collaborator')
        AND public.user_has_client_access(auth.uid(), client_id))
  );

CREATE POLICY "company_processes insert staff"
  ON public.company_processes FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    OR (public.has_role(auth.uid(), 'collaborator')
        AND public.user_has_client_access(auth.uid(), client_id))
  );

CREATE POLICY "company_processes update staff"
  ON public.company_processes FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR (public.has_role(auth.uid(), 'collaborator')
        AND public.user_has_client_access(auth.uid(), client_id))
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    OR (public.has_role(auth.uid(), 'collaborator')
        AND public.user_has_client_access(auth.uid(), client_id))
  );

CREATE POLICY "company_processes delete admin"
  ON public.company_processes FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- =============================================================================
-- company_process_steps  (child — validate via parent's client_id)
-- =============================================================================
DROP POLICY IF EXISTS "company_process_steps read staff"   ON public.company_process_steps;
DROP POLICY IF EXISTS "company_process_steps write staff"  ON public.company_process_steps;
DROP POLICY IF EXISTS "company_process_steps select staff" ON public.company_process_steps;
DROP POLICY IF EXISTS "company_process_steps insert staff" ON public.company_process_steps;
DROP POLICY IF EXISTS "company_process_steps update staff" ON public.company_process_steps;
DROP POLICY IF EXISTS "company_process_steps delete admin" ON public.company_process_steps;

CREATE POLICY "company_process_steps select staff"
  ON public.company_process_steps FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.company_processes cp
      WHERE cp.id = company_process_steps.company_process_id
        AND (
          public.has_role(auth.uid(), 'admin')
          OR (public.has_role(auth.uid(), 'collaborator')
              AND public.user_has_client_access(auth.uid(), cp.client_id))
        )
    )
  );

CREATE POLICY "company_process_steps insert staff"
  ON public.company_process_steps FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.company_processes cp
      WHERE cp.id = company_process_steps.company_process_id
        AND (
          public.has_role(auth.uid(), 'admin')
          OR (public.has_role(auth.uid(), 'collaborator')
              AND public.user_has_client_access(auth.uid(), cp.client_id))
        )
    )
  );

CREATE POLICY "company_process_steps update staff"
  ON public.company_process_steps FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.company_processes cp
      WHERE cp.id = company_process_steps.company_process_id
        AND (
          public.has_role(auth.uid(), 'admin')
          OR (public.has_role(auth.uid(), 'collaborator')
              AND public.user_has_client_access(auth.uid(), cp.client_id))
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.company_processes cp
      WHERE cp.id = company_process_steps.company_process_id
        AND (
          public.has_role(auth.uid(), 'admin')
          OR (public.has_role(auth.uid(), 'collaborator')
              AND public.user_has_client_access(auth.uid(), cp.client_id))
        )
    )
  );

CREATE POLICY "company_process_steps delete admin"
  ON public.company_process_steps FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- =============================================================================
-- company_process_step_requirements  (child of steps — validate via grandparent)
-- =============================================================================
DROP POLICY IF EXISTS "cpsr read staff"   ON public.company_process_step_requirements;
DROP POLICY IF EXISTS "cpsr write staff"  ON public.company_process_step_requirements;
DROP POLICY IF EXISTS "cpsr select staff" ON public.company_process_step_requirements;
DROP POLICY IF EXISTS "cpsr insert staff" ON public.company_process_step_requirements;
DROP POLICY IF EXISTS "cpsr update staff" ON public.company_process_step_requirements;
DROP POLICY IF EXISTS "cpsr delete admin" ON public.company_process_step_requirements;

CREATE POLICY "cpsr select staff"
  ON public.company_process_step_requirements FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.company_process_steps s
      JOIN public.company_processes cp ON cp.id = s.company_process_id
      WHERE s.id = company_process_step_requirements.company_process_step_id
        AND (
          public.has_role(auth.uid(), 'admin')
          OR (public.has_role(auth.uid(), 'collaborator')
              AND public.user_has_client_access(auth.uid(), cp.client_id))
        )
    )
  );

CREATE POLICY "cpsr insert staff"
  ON public.company_process_step_requirements FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.company_process_steps s
      JOIN public.company_processes cp ON cp.id = s.company_process_id
      WHERE s.id = company_process_step_requirements.company_process_step_id
        AND (
          public.has_role(auth.uid(), 'admin')
          OR (public.has_role(auth.uid(), 'collaborator')
              AND public.user_has_client_access(auth.uid(), cp.client_id))
        )
    )
  );

CREATE POLICY "cpsr update staff"
  ON public.company_process_step_requirements FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.company_process_steps s
      JOIN public.company_processes cp ON cp.id = s.company_process_id
      WHERE s.id = company_process_step_requirements.company_process_step_id
        AND (
          public.has_role(auth.uid(), 'admin')
          OR (public.has_role(auth.uid(), 'collaborator')
              AND public.user_has_client_access(auth.uid(), cp.client_id))
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.company_process_steps s
      JOIN public.company_processes cp ON cp.id = s.company_process_id
      WHERE s.id = company_process_step_requirements.company_process_step_id
        AND (
          public.has_role(auth.uid(), 'admin')
          OR (public.has_role(auth.uid(), 'collaborator')
              AND public.user_has_client_access(auth.uid(), cp.client_id))
        )
    )
  );

CREATE POLICY "cpsr delete admin"
  ON public.company_process_step_requirements FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- =============================================================================
-- company_process_documents  (child — validate via parent's client_id)
-- =============================================================================
DROP POLICY IF EXISTS "cpd read staff"   ON public.company_process_documents;
DROP POLICY IF EXISTS "cpd write staff"  ON public.company_process_documents;
DROP POLICY IF EXISTS "cpd select staff" ON public.company_process_documents;
DROP POLICY IF EXISTS "cpd insert staff" ON public.company_process_documents;
DROP POLICY IF EXISTS "cpd update staff" ON public.company_process_documents;
DROP POLICY IF EXISTS "cpd delete staff" ON public.company_process_documents;

CREATE POLICY "cpd select staff"
  ON public.company_process_documents FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.company_processes cp
      WHERE cp.id = company_process_documents.company_process_id
        AND (
          public.has_role(auth.uid(), 'admin')
          OR (public.has_role(auth.uid(), 'collaborator')
              AND public.user_has_client_access(auth.uid(), cp.client_id))
        )
    )
  );

CREATE POLICY "cpd insert staff"
  ON public.company_process_documents FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.company_processes cp
      WHERE cp.id = company_process_documents.company_process_id
        AND (
          public.has_role(auth.uid(), 'admin')
          OR (public.has_role(auth.uid(), 'collaborator')
              AND public.user_has_client_access(auth.uid(), cp.client_id))
        )
    )
  );

CREATE POLICY "cpd update staff"
  ON public.company_process_documents FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.company_processes cp
      WHERE cp.id = company_process_documents.company_process_id
        AND (
          public.has_role(auth.uid(), 'admin')
          OR (public.has_role(auth.uid(), 'collaborator')
              AND public.user_has_client_access(auth.uid(), cp.client_id))
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.company_processes cp
      WHERE cp.id = company_process_documents.company_process_id
        AND (
          public.has_role(auth.uid(), 'admin')
          OR (public.has_role(auth.uid(), 'collaborator')
              AND public.user_has_client_access(auth.uid(), cp.client_id))
        )
    )
  );

-- Documents also carry an "attachment removal" flow used by collaborators
-- (ProcessDocumentsSection). Keep DELETE aligned with UPDATE (staff with access)
-- since a "remove attachment" is an operational action, not a destructive
-- process-level delete.
CREATE POLICY "cpd delete staff"
  ON public.company_process_documents FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.company_processes cp
      WHERE cp.id = company_process_documents.company_process_id
        AND (
          public.has_role(auth.uid(), 'admin')
          OR (public.has_role(auth.uid(), 'collaborator')
              AND public.user_has_client_access(auth.uid(), cp.client_id))
        )
    )
  );

COMMIT;