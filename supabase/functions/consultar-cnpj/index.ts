// Edge Function: consultar-cnpj
// Consulta dados públicos de CNPJ via API Minha Receita (https://minhareceita.org)
// Recebe: { cnpj: string }
// Retorna: dados tratados ou erro amigável

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Método não suportado." }, 405);

  let payload: { cnpj?: string };
  try {
    payload = await req.json();
  } catch {
    return json({ error: "Requisição inválida." }, 400);
  }

  const cnpjLimpo = String(payload?.cnpj ?? "").replace(/\D/g, "");
  if (cnpjLimpo.length !== 14) {
    return json({ error: "CNPJ inválido. Verifique os números digitados." }, 400);
  }

  let resp: Response;
  try {
    resp = await fetch(`https://minhareceita.org/${cnpjLimpo}`, {
      headers: { Accept: "application/json" },
    });
  } catch (e) {
    console.error("consultar-cnpj fetch error", e);
    return json(
      { error: "Não foi possível consultar o CNPJ agora. Tente novamente em alguns instantes." },
      502,
    );
  }

  if (resp.status === 400) return json({ error: "CNPJ inválido." }, 400);
  if (resp.status === 404) return json({ error: "CNPJ não encontrado." }, 404);
  if (!resp.ok) {
    console.error("consultar-cnpj upstream status", resp.status);
    return json(
      { error: "Não foi possível consultar o CNPJ agora. Tente novamente em alguns instantes." },
      502,
    );
  }

  let raw: any;
  try {
    raw = await resp.json();
  } catch {
    return json(
      { error: "Não foi possível consultar o CNPJ agora. Tente novamente em alguns instantes." },
      502,
    );
  }

  const data = {
    cnpj: cnpjLimpo,
    razao_social: raw.razao_social ?? null,
    nome_fantasia: raw.nome_fantasia ?? null,
    descricao_situacao_cadastral: raw.descricao_situacao_cadastral ?? null,
    data_inicio_atividade: raw.data_inicio_atividade ?? null,
    cnae_fiscal: raw.cnae_fiscal != null ? String(raw.cnae_fiscal) : null,
    cnae_fiscal_descricao: raw.cnae_fiscal_descricao ?? null,
    cep: raw.cep ?? null,
    logradouro: raw.logradouro ?? null,
    numero: raw.numero ?? null,
    complemento: raw.complemento ?? null,
    bairro: raw.bairro ?? null,
    municipio: raw.municipio ?? null,
    uf: raw.uf ?? null,
    porte: raw.porte ?? null,
    natureza_juridica: raw.natureza_juridica ?? null,
    qsa: Array.isArray(raw.qsa) ? raw.qsa : [],
    simples: raw?.opcao_pelo_simples ?? raw?.simples?.optante ?? null,
    mei: raw?.opcao_pelo_mei ?? raw?.simei?.optante ?? null,
    capital_social: raw.capital_social ?? null,
    _raw: raw,
  };

  return json(data, 200);
});
