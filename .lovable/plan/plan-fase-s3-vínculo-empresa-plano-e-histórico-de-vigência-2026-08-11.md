# Plan: FASE S3 — VÍNCULO EMPRESA × PLANO E HISTÓRICO DE VIGÊNCIA

This phase implements a secure, historical tracking system for company-plan associations. It ensures that changes to a company's plan are recorded over time, preventing retrospective changes to operation and maintaining a clear audit trail of which plan was active during any given competence.

## Structural Audit & Diagnosis

1.  **`plans` & `services`:** Catalog structures from S1/S2 are stable and will be reused as the source for valid plans and services.
2.  **`client_commercial`:** Currently acts as a flat record of commercial data (`plan_id`, `valor_mensalidade`, etc.). While it could hold a "current" pointer, it doesn't naturally support historical competence-based lookups.
3.  **Historical Source of Truth:** We will introduce a new table `client_plan_history` as the canonical source for historical vigency. `client_commercial.plan_id` will be kept as a "denormalized current plan" for fast lookups, but the history table will be the source of truth for specific competences.

## Technical Details

### Database Changes (Migration)

1.  **Create `public.client_plan_history`**:
    *   `id` (uuid, PK)
    *   `client_id` (uuid, FK to clients)
    *   `plan_id` (uuid, FK to plans)
    *   `competencia_inicio` (text, e.g., '2026-08')
    *   `competencia_fim` (text, nullable)
    *   `status` (text: 'ativo', 'encerrado')
    *   `created_at`, `updated_at`, `created_by` (audit fields)
    *   **Constraint**: No overlapping periods for the same `client_id`.

2.  **Security (RLS)**:
    *   `Admin`: Full CRUD.
    *   `Staff`: SELECT only.
    *   `Client`: No access.
    *   `GRANT` statements for `authenticated` and `service_role`.

3.  **Functions/RPCs**:
    *   `get_plan_for_competence(p_client_id uuid, p_competence text)`: STABLE function to find the effective plan.
    *   `assign_client_plan(p_client_id uuid, p_plan_id uuid, p_start_competence text)`: Procedure to handle new assignments and close existing ones.

### Logic (Shared Library)

*   **`src/lib/client-plans.ts`**:
    *   `getEffectivePlan(history, competence)`: Helper to find the plan in a list of history rows.
    *   `validatePeriod(history, newStart)`: Check for overlaps.

### User Interface

*   **Update `/planos`**:
    *   Add a new tab/section "Vínculos de Empresas".
    *   Allow Admins to select a company and assign a plan with a starting competence.
    *   Display a table of current company -> plan mappings.
    *   Provide a "Historico" view per company to see past vigencies.

## Validation Plan

1.  **Test Suite (`tests/client-plans.test.ts`)**:
    *   Assign first plan: Verify record created with no end date.
    *   Change plan: Verify previous record closed at `N-1` and new record starts at `N`.
    *   Historical query: Verify `get_plan_for_competence` returns correct plan for past, current, and future months.
    *   Overlap prevention: Attempt to insert a start date that falls within an existing range.
    *   RLS check: Ensure clients cannot read history.
    *   Regression: Run full 252-test suite.

2.  **Visual Check**:
    *   Verify BRL formatting in plan selection.
    *   Ensure no mobile overflow in the new history table.

3.  **Constraint Check**:
    *   Confirm no automatic backfill occurred.
    *   Confirm no checklists or competences were generated.
