
-- 1) Soft delete fields
ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.chat_messages
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.tax_guides
  ADD COLUMN IF NOT EXISTS comprovante_uploaded_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

-- 2) Normalize legacy document types so filters match
UPDATE public.documents SET tipo = 'extrato_bancario'
 WHERE lower(coalesce(tipo,'')) IN ('extrato bancário','extrato bancario');
UPDATE public.documents SET tipo = 'nota_fiscal'
 WHERE lower(coalesce(tipo,'')) IN ('nota fiscal','notas fiscais','notas fiscal');
UPDATE public.documents SET tipo = 'folha_pagamento'
 WHERE lower(coalesce(tipo,'')) IN ('folha de pagamento','folha pagamento');
UPDATE public.documents SET tipo = 'contrato'
 WHERE lower(coalesce(tipo,'')) IN ('contrato','contratos');
UPDATE public.documents SET tipo = 'comprovante'
 WHERE lower(coalesce(tipo,'')) IN ('comprovante','comprovante de pagamento','pró-labore','pro-labore');

-- 3) Replace delete policies with author-only rules
DROP POLICY IF EXISTS "Docs: admin delete" ON public.documents;
CREATE POLICY "Docs: uploader delete"
  ON public.documents FOR DELETE TO authenticated
  USING (uploaded_by = auth.uid());

DROP POLICY IF EXISTS "Admin can delete guides" ON public.tax_guides;
CREATE POLICY "Guides: creator delete"
  ON public.tax_guides FOR DELETE TO authenticated
  USING (created_by = auth.uid());

-- 4) Allow chat sender to update their own message (used for soft delete)
DROP POLICY IF EXISTS "Chat msg: sender update" ON public.chat_messages;
CREATE POLICY "Chat msg: sender update"
  ON public.chat_messages FOR UPDATE TO authenticated
  USING (sender_profile_id = auth.uid())
  WITH CHECK (sender_profile_id = auth.uid());
