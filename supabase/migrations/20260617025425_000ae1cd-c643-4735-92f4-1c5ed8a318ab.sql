
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS cnpj text,
  ADD COLUMN IF NOT EXISTS situacao_cadastral text,
  ADD COLUMN IF NOT EXISTS data_abertura date,
  ADD COLUMN IF NOT EXISTS cnae_principal_codigo text,
  ADD COLUMN IF NOT EXISTS cnae_principal_descricao text,
  ADD COLUMN IF NOT EXISTS cep text,
  ADD COLUMN IF NOT EXISTS logradouro text,
  ADD COLUMN IF NOT EXISTS numero text,
  ADD COLUMN IF NOT EXISTS complemento text,
  ADD COLUMN IF NOT EXISTS bairro text,
  ADD COLUMN IF NOT EXISTS cidade text,
  ADD COLUMN IF NOT EXISTS uf text,
  ADD COLUMN IF NOT EXISTS porte text,
  ADD COLUMN IF NOT EXISTS natureza_juridica text,
  ADD COLUMN IF NOT EXISTS capital_social numeric,
  ADD COLUMN IF NOT EXISTS simples_nacional boolean,
  ADD COLUMN IF NOT EXISTS mei boolean,
  ADD COLUMN IF NOT EXISTS qsa_json jsonb,
  ADD COLUMN IF NOT EXISTS dados_receita_json jsonb,
  ADD COLUMN IF NOT EXISTS ultima_consulta_receita timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS clients_cnpj_unique
  ON public.clients ((regexp_replace(coalesce(cnpj,''), '\D', '', 'g')))
  WHERE cnpj IS NOT NULL AND length(regexp_replace(cnpj, '\D', '', 'g')) = 14;
