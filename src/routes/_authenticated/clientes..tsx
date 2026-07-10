
// =====================================================================
// Histórico de Checklists por empresa (últimas 6 competências por padrão)
// =====================================================================
function formatCompLabel(comp: string) {
  const [y, m] = comp.split("-");
  const nomes = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
  const idx = Number(m) - 1;
  if (idx < 0 || idx > 11) return comp;
  return `${nomes[idx]}/${y}`;
}

function todayComp() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function ChecklistHistorySection({ clientId }: { clientId: string }) {
  const [expanded, setExpanded] = useState(false);

  const histQ = useQuery({
    queryKey: ["client-checklist-history", clientId],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_checklist_items")
        .select("competencia, status, prazo")
        .eq("client_id", clientId)
        .is("deleted_at", null)
        .not("competencia", "is", null);
      if (error) throw error;
      return data ?? [];
    },
  });

  const today = todayComp();
  const buckets = (() => {
    const map = new Map<string, { pend: number; rec: number; conc: number; canc: number; atr: number }>();
    for (const it of (histQ.data ?? []) as any[]) {
      const comp = it.competencia as string;
      if (!map.has(comp)) map.set(comp, { pend: 0, rec: 0, conc: 0, canc: 0, atr: 0 });
      const b = map.get(comp)!;
      if (it.status === "pendente") b.pend++;
      else if (it.status === "recebido") b.rec++;
      else if (it.status === "concluido") b.conc++;
      else if (it.status === "cancelado") b.canc++;
      if (it.prazo && it.status !== "concluido" && it.status !== "cancelado" && it.prazo < todayYmd()) b.atr++;
    }
    return map;
  })();

  const allComps = Array.from(buckets.keys()).sort().reverse();
  const compsToShow = expanded ? allComps : allComps.slice(0, 6);
  const totalComps = allComps.length;
  const ultima = allComps[0];
  const mediaPct = (() => {
    if (allComps.length === 0) return 0;
    let sum = 0, count = 0;
    for (const c of allComps) {
      const b = buckets.get(c)!;
      const validos = b.pend + b.rec + b.conc;
      if (validos > 0) { sum += Math.round((b.conc / validos) * 100); count++; }
    }
    return count ? Math.round(sum / count) : 0;
  })();

  if (histQ.isLoading) {
    return (
      <Card className="p-5">
        <div className="space-y-2" aria-busy="true">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-14 animate-pulse rounded bg-muted/60" />
          ))}
        </div>
      </Card>
    );
  }
  if (histQ.isError) {
    return (
      <Card className="p-5">
        <EmptyState title="Não foi possível carregar o histórico" description={(histQ.error as any)?.message ?? "Tente novamente."} action={
          <Button size="sm" variant="outline" onClick={() => histQ.refetch()}>Tentar novamente</Button>
        } />
      </Card>
    );
  }
  if (allComps.length === 0) {
    return (
      <Card className="p-5">
        <EmptyState title="Sem checklists registrados" description="Assim que houver competências geradas para esta empresa, elas aparecerão aqui." />
      </Card>
    );
  }

  return (
    <Card className="p-4">
      <div className="mb-3 grid gap-2 sm:grid-cols-3">
        <div className="rounded border p-3">
          <div className="text-xs uppercase text-muted-foreground">Competências</div>
          <div className="text-xl font-semibold">{totalComps}</div>
        </div>
        <div className="rounded border p-3">
          <div className="text-xs uppercase text-muted-foreground">Última competência</div>
          <div className="text-xl font-semibold">{ultima ? formatCompLabel(ultima) : "—"}</div>
        </div>
        <div className="rounded border p-3">
          <div className="text-xs uppercase text-muted-foreground">Média de conclusão</div>
          <div className="text-xl font-semibold">{mediaPct}%</div>
        </div>
      </div>

      <ul className="divide-y">
        {compsToShow.map((comp) => {
          const b = buckets.get(comp)!;
          const validos = b.pend + b.rec + b.conc;
          const pct = validos ? Math.round((b.conc / validos) * 100) : 0;
          const isAtual = comp === today;
          return (
            <li key={comp}>
              <Link
                to="/checklist"
                search={{ client: clientId, comp, expand: "1" }}
                className="flex items-center justify-between gap-3 px-2 py-3 hover:bg-muted/40"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2 font-medium">
                    {formatCompLabel(comp)}
                    {isAtual && <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-xs text-emerald-800">Atual</span>}
                    {b.atr > 0 && <span className="rounded bg-red-100 px-1.5 py-0.5 text-xs text-red-800">{b.atr} atrasado{b.atr > 1 ? "s" : ""}</span>}
                  </div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    {b.conc} concluído{b.conc === 1 ? "" : "s"} · {b.rec} recebido{b.rec === 1 ? "" : "s"} · {b.pend} pendente{b.pend === 1 ? "" : "s"}
                    {b.canc > 0 ? ` · ${b.canc} cancelado${b.canc === 1 ? "" : "s"}` : ""}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-lg font-semibold">{validos ? `${pct}%` : "—"}</div>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>

      {!expanded && totalComps > compsToShow.length && (
        <div className="mt-3 flex justify-center">
          <Button size="sm" variant="outline" onClick={() => setExpanded(true)}>
            Ver histórico completo ({totalComps - compsToShow.length} anteriores)
          </Button>
        </div>
      )}
    </Card>
  );
}

function todayYmd() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
