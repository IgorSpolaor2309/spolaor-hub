
-- FASE S5: ATUALIZAÇÃO DA ESTRUTURA COMERCIAL
-- Objetivo: Renomear planos, atualizar preços e sincronizar serviços extras conforme documentos oficiais.

BEGIN;

-- 1. GARANTIR CONSTRAINT UNIQUE PARA SERVIÇOS
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'services_nome_key') THEN
        ALTER TABLE public.services ADD CONSTRAINT services_nome_key UNIQUE (nome);
    END IF;
END $$;

-- 2. HIERARQUIA DE PLANOS (RENOMEAÇÃO E INATIVAÇÃO)
-- Inativar Plano B antigo
UPDATE public.plans 
SET status = 'inativo', 
    nome = 'Plano B (Descontinuado)',
    observacoes_comerciais = 'Substituído pela nova hierarquia em 2026-08-12.'
WHERE nome = 'Plano B';

-- Renomear C -> B
UPDATE public.plans
SET nome = 'Plano B',
    valor_padrao = 300.00,
    descricao = 'Até R$ 8.400 mensal. 1 sócio. 2 notas fiscais.',
    limite_faturamento = 8400.00
WHERE nome = 'Plano C';

-- Renomear D -> C
UPDATE public.plans
SET nome = 'Plano C',
    valor_padrao = 450.00,
    descricao = 'Até R$ 15.000 mensal. 2 sócios. 5 notas fiscais.',
    limite_faturamento = 15000.00
WHERE nome = 'Plano D';

-- Renomear E -> D
UPDATE public.plans
SET nome = 'Plano D',
    valor_padrao = 700.00,
    descricao = 'Até R$ 100.000 mensal. 3 sócios. 10 notas fiscais.',
    limite_faturamento = 100000.00
WHERE nome = 'Plano E';

-- Plano A (MEI)
UPDATE public.plans
SET valor_padrao = 180.00,
    descricao = 'MEI. 1 nota fiscal.'
WHERE nome = 'Plano A';

-- 3. SINCRONIZAÇÃO DE SERVIÇOS (PREÇOS E CATEGORIAS)
-- Categorias permitidas: 'Fiscal', 'Contábil', 'Departamento Pessoal', 'Legalização', 'MEI', 'Consultoria', 'Administrativo', 'Pessoa Física'
-- Nota: Na migration anterior falhou por check constraint em plan_items, mas aqui em services temos mais liberdade.

INSERT INTO public.services (nome, categoria, valor_referencia, tipo_preco)
VALUES 
    ('Abertura de empresa', 'Legalização', 1500.00, 'fixo'),
    ('Alteração de empresa', 'Legalização', 1500.00, 'fixo'),
    ('Distrato ou baixa de empresa', 'Legalização', 2000.00, 'fixo'),
    ('Escrituração contábil para MEI', 'MEI', 150.00, 'fixo'),
    ('Declaração de faturamento', 'Contábil', 20.00, 'fixo'),
    ('Pró-labore de sócio adicional', 'Departamento Pessoal', 50.00, 'fixo'),
    ('Admissão adicional de funcionário', 'Departamento Pessoal', 80.00, 'fixo'),
    ('Demissão adicional de funcionário', 'Departamento Pessoal', 90.00, 'fixo'),
    ('Gestão de empregado doméstico', 'Departamento Pessoal', 250.00, 'fixo'),
    ('Admissão de empregado doméstico', 'Departamento Pessoal', 60.00, 'fixo'),
    ('Demissão de empregado doméstico', 'Departamento Pessoal', 60.00, 'fixo'),
    ('Cálculo de hora extra', 'Departamento Pessoal', 10.00, 'fixo'),
    ('Solicitação de alvará na Prefeitura', 'Legalização', 500.00, 'fixo'),
    ('Solicitação de alvará em conselho ou órgão de classe', 'Legalização', 500.00, 'fixo'),
    ('Recálculo de DARF', 'Fiscal', 15.00, 'fixo'),
    ('Parcelamento', 'Fiscal', 500.00, 'fixo'),
    ('Reparcelamento', 'Fiscal', 750.00, 'fixo'),
    ('Preenchimento de formulário para banco', 'Administrativo', 20.00, 'fixo'),
    ('Preenchimento de formulário para o IBGE', 'Administrativo', 20.00, 'fixo'),
    ('Certificado digital e-CNPJ A1 adicional', 'Administrativo', 280.00, 'fixo'),
    ('Certificado digital e-CPF A1 adicional', 'Administrativo', 200.00, 'fixo'),
    ('Declaração de Imposto de Renda da Pessoa Física', 'Pessoa Física', 300.00, 'fixo'),
    ('Retificação de declaração (IRPF)', 'Pessoa Física', 100.00, 'fixo'),
    ('Livro Caixa (Contábil)', 'Contábil', 100.00, 'fixo'),
    ('Documentação contábil e fiscal para licitação', 'Contábil', 500.00, 'fixo'),
    ('Conciliação bancária adicional', 'Contábil', 150.00, 'fixo'),
    ('Acompanhamento fiscal', 'Fiscal', 80.00, 'fixo'),
    ('Abertura, Alteração ou Baixa MEI', 'MEI', 250.00, 'fixo'),
    ('Pedido de Alvará e Inscrição Municipal MEI', 'MEI', 150.00, 'fixo'),
    ('DEFIS', 'Fiscal', NULL, 'sob_orcamento'),
    ('ECD', 'Contábil', NULL, 'sob_orcamento'),
    ('13º salário', 'Departamento Pessoal', NULL, 'sob_orcamento'),
    ('Balancete', 'Contábil', 100.00, 'fixo'),
    ('Livro Caixa (Extra)', 'Contábil', 500.00, 'fixo'),
    ('Certidão negativa (mais taxas)', 'Legalização', 20.00, 'fixo'),
    ('DCTFWeb', 'Fiscal', 250.00, 'fixo'),
    ('Informes de Rendimentos por pessoa', 'Departamento Pessoal', 5.00, 'fixo'),
    ('Emissão avulsa NF-e', 'Fiscal', 110.00, 'fixo'),
    ('DME', 'Fiscal', 250.00, 'fixo'),
    ('Perdcomp', 'Fiscal', NULL, 'sob_orcamento')
ON CONFLICT (nome) DO UPDATE SET 
    valor_referencia = EXCLUDED.valor_referencia,
    categoria = EXCLUDED.categoria;

-- 4. VÍNCULO DE ITENS DO CHECKLIST (CORRIGINDO CATEGORIAS DO CHECK CONSTRAINT)
-- Categorias válidas para plan_items: 'fiscal', 'contabil', 'dp', 'financeiro', 'juridico', 'cadastro', 'outro'
DO $$
DECLARE 
    v_plan_d_id uuid;
    v_serv_form uuid;
    v_serv_cert uuid;
    v_serv_irpf uuid;
BEGIN
    SELECT id INTO v_plan_d_id FROM public.plans WHERE nome = 'Plano D' AND status = 'ativo' LIMIT 1;
    
    SELECT id INTO v_serv_form FROM public.services WHERE nome = 'Preenchimento de formulário para banco' LIMIT 1;
    SELECT id INTO v_serv_cert FROM public.services WHERE nome = 'Certidão negativa (mais taxas)' LIMIT 1;
    SELECT id INTO v_serv_irpf FROM public.services WHERE nome = 'Informes de Rendimentos por pessoa' LIMIT 1;

    IF v_plan_d_id IS NOT NULL THEN
        -- Banco -> outro
        INSERT INTO public.plan_services (plan_id, service_id, tipo_inclusao)
        VALUES (v_plan_d_id, v_serv_form, 'incluido') ON CONFLICT DO NOTHING;
        
        INSERT INTO public.plan_items (plan_id, service_id, titulo, categoria, visivel_cliente)
        VALUES (v_plan_d_id, v_serv_form, 'Preencher formulários para bancos', 'outro', true) ON CONFLICT DO NOTHING;

        -- Certidões -> cadastro
        INSERT INTO public.plan_services (plan_id, service_id, tipo_inclusao)
        VALUES (v_plan_d_id, v_serv_cert, 'incluido') ON CONFLICT DO NOTHING;
        
        INSERT INTO public.plan_items (plan_id, service_id, titulo, categoria, visivel_cliente)
        VALUES (v_plan_d_id, v_serv_cert, 'Certidões Negativas (Receita, Estado, Trabalho)', 'cadastro', true) ON CONFLICT DO NOTHING;

        -- IR -> dp
        INSERT INTO public.plan_services (plan_id, service_id, tipo_inclusao)
        VALUES (v_plan_d_id, v_serv_irpf, 'incluido') ON CONFLICT DO NOTHING;
        
        INSERT INTO public.plan_items (plan_id, service_id, titulo, categoria, visivel_cliente)
        VALUES (v_plan_d_id, v_serv_irpf, 'Informes de Rendimentos para sócios/funcionários', 'dp', true) ON CONFLICT DO NOTHING;
    END IF;
END $$;

COMMIT;
