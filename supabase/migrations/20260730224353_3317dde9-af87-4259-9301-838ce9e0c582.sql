-- Fase D3.2 — hardening: UPDATE em objetos de chat somente para Administrador.
-- Substitui a policy ampla de UPDATE por uma versão com a mesma semântica para
-- caminhos não-chat, mas restrita a admin no prefixo <uuid>/chat/**.
-- Policies permissivas se combinam com OR: por isso a policy ampla é removida.
DROP POLICY IF EXISTS "Docs storage: update access" ON storage.objects;

CREATE POLICY "Docs storage: update access"
ON storage.objects
FOR UPDATE
USING (
  bucket_id = 'documents'
  AND (
    is_admin(auth.uid())
    OR (
      split_part(name, '/', 2) <> 'chat'
      AND user_has_client_access(auth.uid(), (split_part(name, '/', 1))::uuid)
    )
  )
)
WITH CHECK (
  bucket_id = 'documents'
  AND (
    is_admin(auth.uid())
    OR (
      split_part(name, '/', 2) <> 'chat'
      AND user_has_client_access(auth.uid(), (split_part(name, '/', 1))::uuid)
    )
  )
);