
-- FASE S5: ATUALIZAÇÃO DA ESTRUTURA COMERCIAL
-- Objetivo: Renomear planos, atualizar preços e sincronizar serviços extras.

BEGIN;

-- Criar constraint unique para o nome do serviço se não existir
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'services_nome_key'
    ) THEN
        ALTER TABLE public.services ADD CONSTRAINT services_nome_key UNIQUE (nome);
    END IF;
END $$;

-- 1. DESATIVAR PLANO B ANTIGO (NÃO EXCLUIR PARA MANTER HISTÓRICO)
UPDATE public.plans 
SET status = 'inativo', 
    nome = 'Plano B (Antigo/Descontinuado)',
    observacoes_comerciais = 'Plano descontinuado em 2026-08-12. Substituído pela nova hierarquia.'
WHERE nome = 'Plano B';

-- 2. RENOMEAR PLANOS EXISTENTES E ATUALIZAR PREÇOS/DESCRIÇÕES
-- Plano C atual -> Plano B
UPDATE public.plans
SET nome = 'Plano B',
    valor_padrao = 300.00,
    descricao = 'Simples Nacional Anexo III. Faturamento mensal até R$ 8.400,00. Pró-labore para 1 sócio. Até 2 notas fiscais.',
    limite_faturamento = 8400.00
WHERE nome = 'Plano C';

-- Plano D atual -> Plano C
UPDATE public.plans
SET nome = 'Plano C',
    valor_padrao = 450.00,
    descricao = 'Simples Nacional Anexo III. Faturamento mensal até R$ 15.000,00. Pró-labore para 2 sócios. Até 5 notas fiscais.',
    limite_faturamento = 15000.00
WHERE nome = 'Plano D';

-- Plano E atual -> Plano D
UPDATE public.plans
SET nome = 'Plano D',
    valor_padrao = 700.00,
    descricao = 'Simples Nacional Anexo III. Faturamento mensal até R$ 100.000,00. Pró-labore para 3 sócios. Folha até 2 colaboradores. Até 10 notas fiscais.',
    limite_faturamento = 100000.00
WHERE nome = 'Plano E';

-- Plano Demais (valor sob orçamento)
UPDATE public.plans
SET nome = 'Plano Demais',
    valor_padrao = NULL,
    tipo_preco = 'sob_orcamento',
    descricao = 'Empresas sujeito ao fator "R" e demais anexos fora do Anexo III. Valores sob orçamento.'
WHERE nome IN ('Plano Demais', 'Demais enquadramentos');

-- 3. SINCRONIZAR SERVIÇOS EXTRAORDINÁRIOS
-- Atualizar preços dos serviços existentes baseados no DOCX/XLSX
UPDATE public.services SET valor_referencia = 1500.00 WHERE nome = 'Abertura de empresa';
UPDATE public.services SET valor_referencia = 1500.00 WHERE nome = 'Alteração de empresa';
UPDATE public.services SET valor_referencia = 2000.00 WHERE nome = 'Distrato ou baixa de empresa';
UPDATE public.services SET valor_referencia = 150.00 WHERE nome = 'Escrituração contábil para MEI';
UPDATE public.services SET valor_referencia = 20.00 WHERE nome = 'Declaração de faturamento';
UPDATE public.services SET valor_referencia = 50.00 WHERE nome = 'Pró-labore de sócio adicional';
UPDATE public.services SET valor_referencia = 80.00 WHERE nome = 'Admissão adicional de funcionário';
UPDATE public.services SET valor_referencia = 90.00 WHERE nome = 'Demissão adicional de funcionário';
UPDATE public.services SET valor_referencia = 250.00 WHERE nome = 'Gestão de empregado doméstico';
UPDATE public.services SET valor_referencia = 60.00 WHERE nome = 'Admissão de empregado doméstico';
UPDATE public.services SET valor_referencia = 60.00 WHERE nome = 'Demissão de empregado doméstico';
UPDATE public.services SET valor_referencia = 10.00 WHERE nome = 'Cálculo de hora extra';
UPDATE public.services SET valor_referencia = 500.00 WHERE nome = 'Solicitação de alvará na Prefeitura';
UPDATE public.services SET valor_referencia = 500.00 WHERE nome = 'Solicitação de alvará em conselho ou órgão de classe';
UPDATE public.services SET valor_referencia = 15.00 WHERE nome = 'Recálculo de DARF';
UPDATE public.services SET valor_referencia = 500.00 WHERE nome = 'Parcelamento';
UPDATE public.services SET valor_referencia = 750.00 WHERE nome = 'Reparcelamento';
UPDATE public.services SET valor_referencia = 20.00 WHERE nome = 'Preenchimento de formulário para banco';
UPDATE public.services SET valor_referencia = 20.00 WHERE nome = 'Preenchimento de formulário para o IBGE';
UPDATE public.services SET valor_referencia = 20.00 WHERE nome = 'Preenchimento de outros formulários';
UPDATE public.services SET valor_referencia = 280.00 WHERE nome = 'Certificado digital e-CNPJ A1 adicional';
UPDATE public.services SET valor_referencia = 200.00 WHERE nome = 'Certificado digital e-CPF A1 adicional';
UPDATE public.services SET valor_referencia = 300.00 WHERE nome = 'Declaração de Imposto de Renda da Pessoa Física';
UPDATE public.services SET valor_referencia = 100.00 WHERE nome = 'Retificação de declaração causada por informação incorreta ou atrasada do cliente';
UPDATE public.services SET valor_referencia = 100.00 WHERE nome = 'Livro Caixa' AND categoria = 'Contábil';
UPDATE public.services SET valor_referencia = 500.00 WHERE nome = 'Documentação contábil e fiscal para licitação';
UPDATE public.services SET valor_referencia = 150.00 WHERE nome = 'Conciliação bancária adicional';
UPDATE public.services SET valor_referencia = 80.00 WHERE nome = 'Acompanhamento fiscal';

-- Criar serviços que ainda não existem (usando categorias mapeadas)
INSERT INTO public.services (nome, categoria, valor_referencia, tipo_preco, valor_provisorio)
VALUES 
    ('Abertura, Alteração ou Baixa MEI', 'MEI', 250.00, 'fixo', false),
    ('Pedido de Alvará e Inscrição Municipal MEI', 'MEI', 150.00, 'fixo', false),
    ('Pedido de alvará registro IBAMA', 'Legalização', 500.00, 'fixo', false),
    ('Recálculo de folha de pagamento', 'Departamento Pessoal', 250.00, 'fixo', false),
    ('DEFIS', 'Fiscal', NULL, 'sob_orcamento', false),
    ('ECD', 'Contábil', NULL, 'sob_orcamento', false),
    ('13º salário', 'Departamento Pessoal', NULL, 'sob_orcamento', false),
    ('Balancete', 'Contábil', 100.00, 'fixo', false),
    ('Livro Caixa (Extra)', 'Contábil', 500.00, 'fixo', false),
    ('Estudo Tributário', 'Administrativo', 1500.00, 'fixo', false),
    ('Certidão negativa (mais taxas)', 'Legalização', 20.00, 'fixo', false),
    ('DCTFWeb', 'Fiscal', 250.00, 'fixo', false),
    ('Informes de Rendimentos por pessoa', 'Departamento Pessoal', 5.00, 'fixo', false),
    ('Emissão avulsa', 'Fiscal', 110.00, 'fixo', false),
    ('DME', 'Fiscal', 250.00, 'fixo', false),
    ('Perdcomp', 'Fiscal', NULL, 'sob_orcamento', false)
ON CONFLICT (nome) DO UPDATE SET valor_referencia = EXCLUDED.valor_referencia;

-- 4. VINCULAR ITENS ESPECÍFICOS AOS NOVOS PLANOS PARA GERAÇÃO DE CHECKLIST
DO $$
DECLARE 
    v_plan_d_id uuid;
    v_serv_form uuid;
    v_serv_cert uuid;
    v_serv_irpf uuid;
BEGIN
    SELECT id INTO v_plan_d_id FROM public.plans WHERE nome = 'Plano D' LIMIT 1;
    
    SELECT id INTO v_serv_form FROM public.services WHERE nome = 'Preenchimento de formulário para banco' LIMIT 1;
    SELECT id INTO v_serv_cert FROM public.services WHERE nome = 'Certidão negativa (mais taxas)' LIMIT 1;
    SELECT id INTO v_serv_irpf FROM public.services WHERE nome = 'Informes de Rendimentos por pessoa' LIMIT 1;

    IF v_plan_d_id IS NOT NULL THEN
        -- Formulário banco -> 'outro' (Administrativo mapeado)
        INSERT INTO public.plan_services (plan_id, service_id, tipo_inclusao)
        VALUES (v_plan_d_id, v_serv_form, 'incluido') ON CONFLICT DO NOTHING;
        
        INSERT INTO public.plan_items (plan_id, service_id, titulo, categoria, visivel_cliente)
        VALUES (v_plan_d_id, v_serv_form, 'Preencher formulários para bancos', 'outro', true) ON CONFLICT DO NOTHING;

        -- Certidões -> 'cadastro' (Legalização mapeada)
        INSERT INTO public.plan_services (plan_id, service_id, tipo_inclusao)
        VALUES (v_plan_d_id, v_serv_cert, 'incluido') ON CONFLICT DO NOTHING;
        
        INSERT INTO public.plan_items (plan_id, service_id, titulo, categoria, visivel_cliente)
        VALUES (v_plan_d_id, v_serv_cert, 'Certidões (Receita Federal, Estadual e Trabalhista)', 'cadastro', true) ON CONFLICT DO NOTHING;

        -- Informe rendimentos -> 'dp'
        INSERT INTO public.plan_services (plan_id, service_id, tipo_inclusao)
        VALUES (v_plan_d_id, v_serv_irpf, 'incluido') ON CONFLICT DO NOTHING;
        
        INSERT INTO public.plan_items (plan_id, service_id, titulo, categoria, visivel_cliente)
        VALUES (v_plan_d_id, v_serv_irpf, 'Informes de Rendimentos para IR', 'dp', true) ON CONFLICT DO NOTHING;
    END IF;
END $$;

COMMIT;
