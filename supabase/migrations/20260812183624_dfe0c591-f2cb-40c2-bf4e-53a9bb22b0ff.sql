
-- Permitir leitura anon nos planos e serviços (geralmente seguro para catálogos comerciais)
CREATE POLICY "plans_select_anon" ON public.plans FOR SELECT TO anon USING (true);
CREATE POLICY "services_select_anon" ON public.services FOR SELECT TO anon USING (true);

-- Garantir GRANTs
GRANT SELECT ON public.plans TO anon;
GRANT SELECT ON public.services TO anon;
