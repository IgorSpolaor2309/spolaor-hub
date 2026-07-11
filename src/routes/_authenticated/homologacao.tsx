import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { PageHeader } from "@/components/sc/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { useState } from "react";
import { AlertTriangle, FlaskConical, RotateCw, Trash2, Sparkles, Copy, ExternalLink, EyeOff, CheckCircle2, XCircle, ShieldCheck } from "lucide-react";
import {
  homologSummary, homologCreateEnvironment, homologWipe, homologWipePreview, homologReset,
  homologListBatches, homologListAudit, homologContaminationReport, homologRepairCaseA,
  homologPurgeOrphanAuthUsers, homologValidateBatch,
  homologListValidationRuns, homologListManualSteps, homologUpdateManualStep,
} from "@/lib/homologacao.functions";
import { homologAccessDiagnostic } from "@/lib/access-diagnostics.functions";

export const Route = createFileRoute("/_authenticated/homologacao")({
  component: HomologPage,
});

function fmtDate(s?: string | null) {
  if (!s) return "—";
  const d = new Date(s);
  return d.toLocaleString("pt-BR");
}

type Persona = { label: string; role: string; email: string; magic_link: string | null };

function HomologPage() {
  const qc = useQueryClient();
  const [label, setLabel] = useState("Ambiente demo");
  const [wipePreview, setWipePreview] = useState<Record<string, number> | null>(null);
  const [sessionPersonas, setSessionPersonas] = useState<Persona[] | null>(null);
  const [validateBatchId, setValidateBatchId] = useState<string>("");
  const [validation, setValidation] = useState<any>(null);

  const summaryFn = useServerFn(homologSummary);
  const createFn = useServerFn(homologCreateEnvironment);
  const wipeFn = useServerFn(homologWipe);
  const wipePreviewFn = useServerFn(homologWipePreview);
  const resetFn = useServerFn(homologReset);
  const batchesFn = useServerFn(homologListBatches);
  const auditFn = useServerFn(homologListAudit);
  const diagnosticFn = useServerFn(homologAccessDiagnostic);
  const contaminationFn = useServerFn(homologContaminationReport);
  const repairFn = useServerFn(homologRepairCaseA);
  const purgeOrphanFn = useServerFn(homologPurgeOrphanAuthUsers);
  const validateFn = useServerFn(homologValidateBatch);

  const summary = useQuery({ queryKey: ["homolog-summary"], queryFn: () => summaryFn({}) });
  const batches = useQuery({ queryKey: ["homolog-batches"], queryFn: () => batchesFn({}) });
  const audit = useQuery({ queryKey: ["homolog-audit"], queryFn: () => auditFn({}) });
  const diagnostic = useQuery({ queryKey: ["homolog-access-diagnostic"], queryFn: () => diagnosticFn({}) });
  const contamination = useQuery({ queryKey: ["homolog-contamination"], queryFn: () => contaminationFn({}) });

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ["homolog-summary"] });
    qc.invalidateQueries({ queryKey: ["homolog-batches"] });
    qc.invalidateQueries({ queryKey: ["homolog-audit"] });
    qc.invalidateQueries({ queryKey: ["homolog-access-diagnostic"] });
    qc.invalidateQueries({ queryKey: ["homolog-contamination"] });
  };

  const repairMut = useMutation({
    mutationFn: () => repairFn({}),
    onSuccess: (r: any) => {
      toast.success(`Caso A corrigido: ${r.processes_fixed} processo(s), ${r.steps_fixed} etapa(s).`);
      invalidateAll();
    },
    onError: (e: any) => toast.error(e?.message || "Falha ao corrigir contaminação."),
  });

  const createMut = useMutation({
    mutationFn: () => createFn({ data: { label } }),
    onSuccess: (r: any) => {
      setSessionPersonas((r?.personas ?? []) as Persona[]);
      toast.success("Ambiente demo criado. Copie os links agora — não serão exibidos novamente.");
      invalidateAll();
    },
    onError: (e: any) => toast.error(e?.message || "Falha ao criar ambiente."),
  });
  const wipeMut = useMutation({
    mutationFn: () => wipeFn({ data: {} }),
    onSuccess: () => { setSessionPersonas(null); toast.success("Dados de demonstração e contas removidos."); invalidateAll(); },
    onError: (e: any) => toast.error(e?.message || "Falha ao limpar dados."),
  });
  const resetMut = useMutation({
    mutationFn: () => resetFn({ data: { label } }),
    onSuccess: (r: any) => {
      setSessionPersonas((r?.created?.personas ?? []) as Persona[]);
      toast.success("Ambiente recriado. Novos links gerados.");
      invalidateAll();
    },
    onError: (e: any) => toast.error(e?.message || "Falha ao recriar ambiente."),
  });

  const purgeOrphanMut = useMutation({
    mutationFn: () => purgeOrphanFn({}),
    onSuccess: (r: any) => {
      toast.success(
        `Higienização concluída: ${r.deleted} conta(s) removida(s), ${r.failed} falha(s), ${r.candidates} candidato(s).`,
      );
      invalidateAll();
    },
    onError: (e: any) => toast.error(e?.message || "Falha ao higienizar contas órfãs."),
  });

  const validateMut = useMutation({
    mutationFn: () => validateFn({ data: { batch_id: validateBatchId } }),
    onSuccess: (r: any) => {
      setValidation(r);
      const msg = r.overall === "pass" ? "Ambiente aprovado." : r.overall === "warn" ? "Ambiente com atenção." : "Ambiente reprovado.";
      (r.overall === "fail" ? toast.error : r.overall === "warn" ? toast.warning : toast.success)(msg);
      qc.invalidateQueries({ queryKey: ["homolog-audit"] });
      qc.invalidateQueries({ queryKey: ["homolog-runs"] });
    },
    onError: (e: any) => toast.error(e?.message || "Falha ao validar ambiente."),
  });


  const totalDemo = summary.data
    ? Object.entries(summary.data)
        .filter(([k]) => k !== "batches")
        .reduce((acc, [, v]) => acc + (Number(v) || 0), 0)
    : 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Homologação e Testes"
        description="Ambiente isolado para testar fluxos com dados fictícios — dados reais nunca são afetados."
      />

      <div className="flex items-center gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
        <AlertTriangle className="h-4 w-4 text-amber-600" />
        <span>
          Você está na <strong>Central de Homologação</strong>. Todas as ações desta página operam
          exclusivamente sobre registros marcados como demonstração (<code>is_demo = true</code>).
        </span>
      </div>

      {/* Ambiente de demonstração */}
      <Card className="p-4 space-y-4">
        <div className="flex items-center gap-2">
          <FlaskConical className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold">Ambiente de demonstração</h2>
        </div>

        <div className="grid gap-3 md:grid-cols-4">
          <SummaryCard label="Registros de demo" value={totalDemo} loading={summary.isLoading} />
          <SummaryCard label="Empresas demo" value={summary.data?.clients ?? 0} loading={summary.isLoading} />
          <SummaryCard label="Checklists demo" value={summary.data?.client_checklist_items ?? 0} loading={summary.isLoading} />
          <SummaryCard label="Lotes ativos" value={summary.data?.batches ?? 0} loading={summary.isLoading} />
        </div>

        <div className="grid gap-3 md:grid-cols-[1fr_auto]">
          <div>
            <Label>Rótulo do lote</Label>
            <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Ambiente demo" />
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <Button onClick={() => createMut.mutate()} disabled={createMut.isPending}>
              <Sparkles className="h-4 w-4 mr-1" /> Criar ambiente
            </Button>

            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" disabled={resetMut.isPending}>
                  <RotateCw className="h-4 w-4 mr-1" /> Recriar ambiente
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Recriar ambiente de demonstração?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Todos os dados marcados como demonstração serão removidos e um novo ambiente
                    será criado. <strong>Os dados reais não serão afetados.</strong>
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction onClick={() => resetMut.mutate()}>Recriar</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>

            <AlertDialog
              onOpenChange={(open) => {
                if (open) {
                  wipePreviewFn({ data: {} })
                    .then((r) => setWipePreview(r as Record<string, number>))
                    .catch(() => setWipePreview(null));
                } else {
                  setWipePreview(null);
                }
              }}
            >
              <AlertDialogTrigger asChild>
                <Button variant="destructive" disabled={wipeMut.isPending}>
                  <Trash2 className="h-4 w-4 mr-1" /> Limpar demonstração
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Remover todos os dados de demonstração?</AlertDialogTitle>
                  <AlertDialogDescription asChild>
                    <div className="space-y-2">
                      <div>
                        Esta ação removerá <strong>somente</strong> os dados criados pela Central de
                        Homologação (<code>is_demo = true</code>). Os dados reais não serão afetados.
                      </div>
                      <div>Total atual de registros de demo: <strong>{totalDemo}</strong>.</div>
                      {wipePreview === null ? (
                        <div className="text-xs text-muted-foreground">Calculando o que será removido…</div>
                      ) : (
                        <div className="rounded-md border p-2 text-xs">
                          <div className="font-medium mb-1">Serão removidos:</div>
                          <div className="grid grid-cols-2 gap-1">
                            {Object.entries(wipePreview)
                              .filter(([, v]) => Number(v) > 0)
                              .map(([k, v]) => (
                                <div key={k} className="flex justify-between">
                                  <span className="text-muted-foreground">{k}</span>
                                  <span className="font-medium">{Number(v)}</span>
                                </div>
                              ))}
                            {Object.values(wipePreview).every((v) => Number(v) === 0) && (
                              <div className="col-span-2 text-muted-foreground">Nenhum registro demo encontrado.</div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction onClick={() => wipeMut.mutate()}>Limpar tudo</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>

            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" disabled={purgeOrphanMut.isPending} title="Remove contas de autenticação demo sem perfil correspondente">
                  <Trash2 className="h-4 w-4 mr-1" /> Higienizar contas órfãs
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Remover contas de autenticação demo órfãs?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Serão removidas apenas contas com e-mail <code>demo-*@homolog.spolaor.local</code>
                    {" "}que <strong>não possuem mais perfil</strong> no banco (sobras de lotes apagados diretamente pelo banco).
                    Nenhuma conta real será afetada.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction onClick={() => purgeOrphanMut.mutate()}>Higienizar</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>

        {summary.data && (
          <div className="rounded-md border p-3">
            <div className="text-xs font-medium text-muted-foreground mb-2">Detalhamento por tabela</div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
              {Object.entries(summary.data)
                .filter(([k]) => k !== "batches")
                .map(([k, v]) => (
                  <div key={k} className="flex justify-between">
                    <span className="text-muted-foreground">{k}</span>
                    <span className="font-medium">{v as number}</span>
                  </div>
                ))}
            </div>
          </div>
        )}
      </Card>

      {sessionPersonas && sessionPersonas.length > 0 && (
        <Card className="p-4 space-y-3 border-amber-400/60 bg-amber-50/40">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-lg font-semibold">Credenciais desta sessão</h2>
              <p className="text-xs text-muted-foreground">
                Estes links de acesso são <strong>temporários</strong>, gerados apenas para esta sessão do administrador.
                Não são gravados no banco. Ao recarregar a página eles somem — copie ou abra agora.
                Recomendado: abrir em <strong>janela anônima</strong> para não conflitar com sua sessão real.
              </p>
            </div>
            <Button size="sm" variant="outline" onClick={() => setSessionPersonas(null)}>
              <EyeOff className="mr-1 h-4 w-4" /> Ocultar
            </Button>
          </div>
          <div className="grid gap-2">
            {sessionPersonas.map((p) => (
              <div key={p.email} className="rounded-md border bg-background p-2 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary">{p.role}</Badge>
                  <span className="font-medium">{p.label}</span>
                  <code className="text-xs text-muted-foreground">{p.email}</code>
                </div>
                {p.magic_link ? (
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={async () => {
                        try { await navigator.clipboard.writeText(p.magic_link!); toast.success("Link copiado."); }
                        catch { toast.error("Não foi possível copiar."); }
                      }}
                    >
                      <Copy className="mr-1 h-3 w-3" /> Copiar link
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => window.open(p.magic_link!, "_blank", "noopener,noreferrer")}
                    >
                      <ExternalLink className="mr-1 h-3 w-3" /> Abrir em nova aba
                    </Button>
                    <span className="text-xs text-muted-foreground">
                      Dica: abra em janela anônima para simular a persona.
                    </span>
                  </div>
                ) : (
                  <div className="mt-2 text-xs text-destructive">
                    Não foi possível gerar magic link para esta conta.
                  </div>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Contaminação */}
      <Card className="p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">Verificar contaminação</h2>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => contamination.refetch()} disabled={contamination.isFetching}>
              Atualizar
            </Button>
            <Button
              size="sm"
              onClick={() => repairMut.mutate()}
              disabled={repairMut.isPending}
            >
              Corrigir Caso A
            </Button>
          </div>
        </div>
        {contamination.isLoading ? (
          <div className="text-sm text-muted-foreground">Carregando…</div>
        ) : contamination.error ? (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            {(contamination.error as Error).message}
          </div>
        ) : contamination.data && (
          <div className="space-y-3 text-sm">
            {Object.entries(contamination.data).map(([key, rows]) => {
              const list = (rows as any[]) ?? [];
              return (
                <div key={key} className="rounded-md border p-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium uppercase text-muted-foreground">{key}</span>
                    <Badge variant={list.length ? "destructive" : "outline"}>{list.length}</Badge>
                  </div>
                  {list.length > 0 && (
                    <pre className="whitespace-pre-wrap break-all text-xs text-muted-foreground">
                      {JSON.stringify(list, null, 2)}
                    </pre>
                  )}
                </div>
              );
            })}
            <p className="text-xs text-muted-foreground">
              <strong>Caso A</strong>: processo criado dentro do lote demo mas sem a marcação — corrigível automaticamente.
              <br />
              <strong>Caso B</strong> (empresa real vinculada a tipo demo): requer intervenção administrativa manual — reatribuir a um tipo real equivalente. A limpeza permanece bloqueada enquanto houver Caso B.
            </p>
          </div>
        )}
      </Card>

      {/* Diagnóstico temporário */}
      <Card className="p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">Diagnóstico de acesso</h2>
          <Button variant="outline" size="sm" onClick={() => diagnostic.refetch()} disabled={diagnostic.isFetching}>
            Atualizar diagnóstico
          </Button>
        </div>
        {diagnostic.isLoading ? (
          <div className="text-sm text-muted-foreground">Carregando diagnóstico…</div>
        ) : diagnostic.error ? (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            {(diagnostic.error as Error).message}
          </div>
        ) : diagnostic.data && (
          <div className="space-y-4 text-sm">
            <div className="grid gap-2 md:grid-cols-3">
              <DiagnosticItem label="Usuário autenticado" value={diagnostic.data.current_profile?.email || diagnostic.data.current_user} />
              <DiagnosticItem label="Papel atual" value={(diagnostic.data.current_roles ?? []).join(", ") || "—"} />
              <DiagnosticItem label="Status" value={diagnostic.data.current_status || "—"} />
              <DiagnosticItem label="Perfil encontrado" value={diagnostic.data.current_profile?.full_name || "—"} />
              <DiagnosticItem label="Colaborador relacionado" value={diagnostic.data.current_collaborator?.nome || "—"} />
              <DiagnosticItem label="Empresas acessíveis" value={String(diagnostic.data.accessible_companies_count ?? 0)} />
              <DiagnosticItem label="Total de colaboradores" value={String(diagnostic.data.total_collaborators ?? 0)} />
              <DiagnosticItem label="Colaboradores visíveis" value={String(diagnostic.data.visible_collaborators_count ?? 0)} />
              <DiagnosticItem label="Query Empresas" value={`${diagnostic.data.page_query_counts?.empresas ?? 0} registros`} />
            </div>

            <div className="rounded-md border p-3">
              <div className="mb-2 text-xs font-medium uppercase text-muted-foreground">Últimos erros das queries</div>
              <div className="grid gap-1 text-xs md:grid-cols-2">
                <div>Empresas: {diagnostic.data.last_errors?.empresas || "sem erro"}</div>
                <div>Colaboradores: {diagnostic.data.last_errors?.colaboradores || "sem erro"}</div>
              </div>
            </div>

            <div className="rounded-md border p-3">
              <div className="mb-2 text-xs font-medium uppercase text-muted-foreground">Empresas retornadas</div>
              <div className="flex flex-wrap gap-2">
                {(diagnostic.data.accessible_companies ?? []).map((client: any) => (
                  <Badge key={client.id} variant={client.is_demo ? "secondary" : "outline"}>{client.razao_social}</Badge>
                ))}
              </div>
            </div>

            <div className="rounded-md border p-3">
              <div className="mb-2 text-xs font-medium uppercase text-muted-foreground">Bruno e Igor</div>
              <div className="space-y-2">
                {(diagnostic.data.target_accounts ?? []).map((account: any) => (
                  <div key={account.user_id} className="rounded border bg-muted/30 p-2 text-xs">
                    <div className="font-medium">{account.profile?.full_name || account.auth_email || account.user_id}</div>
                    <div className="text-muted-foreground">
                      Auth: {account.auth_email || "—"} · Papel: {(account.roles ?? []).join(", ") || "—"} · Colaborador: {account.collaborator?.nome || "—"} · Status: {account.collaborator?.status || account.profile?.status || "—"}
                    </div>
                    <div className="mt-1 text-muted-foreground">
                      Empresas vinculadas: {(account.linked_clients ?? []).map((client: any) => client.razao_social).join("; ") || "nenhuma"}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </Card>

      {/* Validar ambiente */}
      <Card className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold">Validar ambiente</h2>
        </div>
        <p className="text-xs text-muted-foreground">
          Executa validação completa (somente leitura) do lote demo selecionado. Não altera nenhum registro
          e não corrige dados automaticamente. Cada execução é registrada na auditoria.
        </p>
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-[280px] flex-1">
            <Label>Lote demo</Label>
            <select
              className="w-full rounded-md border bg-background p-2 text-sm"
              value={validateBatchId}
              onChange={(e) => setValidateBatchId(e.target.value)}
            >
              <option value="">Selecione um lote…</option>
              {(batches.data ?? []).map((b: any) => (
                <option key={b.id} value={b.id}>
                  {b.label} · {fmtDate(b.created_at)} · {b.id.slice(0, 8)}
                </option>
              ))}
            </select>
          </div>
          <Button
            onClick={() => validateMut.mutate()}
            disabled={!validateBatchId || validateMut.isPending}
          >
            <ShieldCheck className="mr-1 h-4 w-4" />
            {validateMut.isPending ? "Validando…" : "Validar ambiente"}
          </Button>
        </div>

        {validation && (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge
                variant={validation.overall === "pass" ? "default" : validation.overall === "warn" ? "secondary" : "destructive"}
              >
                {validation.overall === "pass" ? "Aprovado" : validation.overall === "warn" ? "Atenção" : "Reprovado"}
              </Badge>
              <span className="text-sm font-medium">{validation.label}</span>
              <span className="text-xs text-muted-foreground">{fmtDate(validation.validated_at)}</span>
            </div>
            <div className="grid gap-1">
              {(validation.checks ?? []).map((c: any) => (
                <div key={c.code} className="flex items-start justify-between gap-2 rounded border p-2 text-sm">
                  <div className="flex items-start gap-2">
                    {c.status === "pass" ? (
                      <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-600" />
                    ) : c.status === "warn" ? (
                      <AlertTriangle className="mt-0.5 h-4 w-4 text-amber-600" />
                    ) : (
                      <XCircle className="mt-0.5 h-4 w-4 text-destructive" />
                    )}
                    <div>
                      <div className="font-medium">{c.label}</div>
                      <div className="text-xs text-muted-foreground">{c.detail}</div>
                    </div>
                  </div>
                  <Badge variant="outline" className="shrink-0">{c.code}</Badge>
                </div>
              ))}
            </div>
          </div>
        )}
      </Card>

      {/* Histórico de validações e roteiro manual por persona */}
      <ValidationHistoryCard batchId={validateBatchId} />



      {/* Lotes */}
      <Card className="p-4 space-y-3">
        <h2 className="text-lg font-semibold">Lotes de demonstração</h2>
        {batches.isLoading ? (
          <div className="text-sm text-muted-foreground">Carregando…</div>
        ) : (batches.data ?? []).length === 0 ? (
          <div className="text-sm text-muted-foreground">Nenhum lote criado ainda.</div>
        ) : (
          <div className="space-y-2">
            {(batches.data ?? []).map((b: any) => (
              <div key={b.id} className="flex flex-wrap items-center justify-between gap-2 rounded border p-2 text-sm">
                <div className="flex items-center gap-2">
                  <Badge variant={b.status === "active" ? "default" : "secondary"}>{b.status}</Badge>
                  <span className="font-medium">{b.label}</span>
                  <span className="text-xs text-muted-foreground">{fmtDate(b.created_at)}</span>
                </div>
                <div className="text-xs text-muted-foreground">
                  {Object.entries(b.counts_json ?? {}).map(([k, v]) => `${k}: ${v}`).join(" · ") || "—"}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Auditoria */}
      <Card className="p-4 space-y-3">
        <h2 className="text-lg font-semibold">Histórico das execuções</h2>
        {audit.isLoading ? (
          <div className="text-sm text-muted-foreground">Carregando…</div>
        ) : (audit.data ?? []).length === 0 ? (
          <div className="text-sm text-muted-foreground">Sem registros ainda.</div>
        ) : (
          <div className="space-y-1 text-sm">
            {(audit.data ?? []).map((e: any) => (
              <div key={e.id} className="flex flex-wrap justify-between gap-2 border-b py-1">
                <div>
                  <Badge variant="outline" className="mr-2">{e.action}</Badge>
                  <span className="text-xs text-muted-foreground">{fmtDate(e.created_at)}</span>
                </div>
                <code className="text-xs text-muted-foreground">
                  {e.batch_id ? e.batch_id.slice(0, 8) : "—"}
                </code>
              </div>
            ))}
          </div>
        )}
      </Card>

      <p className="text-xs text-muted-foreground">
        Próximas fases: contas de teste, gerador de cenários, execução de automações em modo
        simulação, painel de saúde do sistema e checklist de homologação.
      </p>
    </div>
  );
}

function SummaryCard({ label, value, loading }: { label: string; value: number; loading?: boolean }) {
  return (
    <div className="rounded-lg border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-2xl font-semibold">{loading ? "…" : value}</div>
    </div>
  );
}

function DiagnosticItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-muted/30 p-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="truncate font-medium">{value}</div>
    </div>
  );
}

function ValidationHistoryCard({ batchId }: { batchId: string }) {
  const qc = useQueryClient();
  const runsFn = useServerFn(homologListValidationRuns);
  const stepsFn = useServerFn(homologListManualSteps);
  const updateFn = useServerFn(homologUpdateManualStep);
  const [selectedRun, setSelectedRun] = useState<string>("");

  const runs = useQuery({
    queryKey: ["homolog-runs", batchId || null],
    queryFn: () => runsFn({ data: { batch_id: batchId || null } }),
  });
  const steps = useQuery({
    queryKey: ["homolog-manual-steps", selectedRun],
    queryFn: () => stepsFn({ data: { run_id: selectedRun } }),
    enabled: !!selectedRun,
  });

  const updateMut = useMutation({
    mutationFn: (v: { step_id: string; status: "pending" | "pass" | "fail" | "skip"; notes?: string | null }) =>
      updateFn({ data: v }),
    onSuccess: () => {
      toast.success("Passo atualizado.");
      qc.invalidateQueries({ queryKey: ["homolog-manual-steps", selectedRun] });
    },
    onError: (e: any) => toast.error(e?.message || "Falha ao atualizar passo."),
  });

  const runsList: any[] = (runs.data as any[]) ?? [];
  const stepsByPersona = ((steps.data as any[]) ?? []).reduce<Record<string, any[]>>((acc, s) => {
    const key = `${s.persona_role}::${s.persona_email}::${s.persona_label}`;
    (acc[key] ||= []).push(s);
    return acc;
  }, {});

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center gap-2">
        <ShieldCheck className="h-5 w-5 text-primary" />
        <h2 className="text-lg font-semibold">Histórico de validações e roteiro manual</h2>
      </div>
      <p className="text-xs text-muted-foreground">
        Cada execução de <em>Validar ambiente</em> é persistida e semeia automaticamente um roteiro de testes manuais
        por persona (magic link). Selecione uma execução para registrar os resultados dos testes manuais.
      </p>

      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-[320px] flex-1">
          <Label>Execução</Label>
          <select
            className="w-full rounded-md border bg-background p-2 text-sm"
            value={selectedRun}
            onChange={(e) => setSelectedRun(e.target.value)}
          >
            <option value="">Selecione uma execução…</option>
            {runsList.map((r: any) => (
              <option key={r.id} value={r.id}>
                {r.run_label || "—"} · {r.overall.toUpperCase()} · {new Date(r.created_at).toLocaleString("pt-BR")} · {r.id.slice(0, 8)}
              </option>
            ))}
          </select>
        </div>
      </div>

      {runs.isLoading ? (
        <div className="text-sm text-muted-foreground">Carregando execuções…</div>
      ) : runsList.length === 0 ? (
        <div className="text-sm text-muted-foreground">Nenhuma execução registrada ainda.</div>
      ) : (
        <div className="grid gap-1 text-sm">
          {runsList.slice(0, 5).map((r: any) => (
            <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded border p-2">
              <div className="flex items-center gap-2">
                <Badge variant={r.overall === "pass" ? "default" : r.overall === "warn" ? "secondary" : "destructive"}>
                  {r.overall}
                </Badge>
                <span className="font-medium">{r.run_label || "—"}</span>
                <span className="text-xs text-muted-foreground">
                  {new Date(r.created_at).toLocaleString("pt-BR")}
                </span>
              </div>
              <Button size="sm" variant="outline" onClick={() => setSelectedRun(r.id)}>
                Abrir roteiro
              </Button>
            </div>
          ))}
        </div>
      )}

      {selectedRun && (
        <div className="space-y-3 pt-2">
          <h3 className="text-sm font-semibold">Roteiro manual por persona</h3>
          {steps.isLoading ? (
            <div className="text-sm text-muted-foreground">Carregando passos…</div>
          ) : Object.keys(stepsByPersona).length === 0 ? (
            <div className="text-sm text-muted-foreground">Nenhum passo semeado para esta execução.</div>
          ) : (
            Object.entries(stepsByPersona).map(([key, list]) => {
              const [role, email, label] = key.split("::");
              return (
                <div key={key} className="rounded border p-3 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">{role}</Badge>
                    <span className="font-medium text-sm">{label}</span>
                    <code className="text-xs text-muted-foreground">{email}</code>
                  </div>
                  <div className="grid gap-1">
                    {list.map((s: any) => (
                      <div key={s.id} className="flex flex-wrap items-center justify-between gap-2 rounded border p-2 text-sm">
                        <div className="flex items-center gap-2">
                          {s.status === "pass" ? (
                            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                          ) : s.status === "fail" ? (
                            <XCircle className="h-4 w-4 text-destructive" />
                          ) : s.status === "skip" ? (
                            <EyeOff className="h-4 w-4 text-muted-foreground" />
                          ) : (
                            <AlertTriangle className="h-4 w-4 text-amber-600" />
                          )}
                          <span>{s.step_label}</span>
                          <Badge variant="outline" className="text-[10px]">{s.step_code}</Badge>
                        </div>
                        <div className="flex gap-1">
                          {(["pass", "warn_as_fail", "skip", "pending"] as const).map(() => null)}
                          <Button size="sm" variant={s.status === "pass" ? "default" : "outline"} disabled={updateMut.isPending}
                            onClick={() => updateMut.mutate({ step_id: s.id, status: "pass" })}>Aprovar</Button>
                          <Button size="sm" variant={s.status === "fail" ? "destructive" : "outline"} disabled={updateMut.isPending}
                            onClick={() => updateMut.mutate({ step_id: s.id, status: "fail" })}>Reprovar</Button>
                          <Button size="sm" variant={s.status === "skip" ? "secondary" : "outline"} disabled={updateMut.isPending}
                            onClick={() => updateMut.mutate({ step_id: s.id, status: "skip" })}>Pular</Button>
                          <Button size="sm" variant="ghost" disabled={updateMut.isPending}
                            onClick={() => updateMut.mutate({ step_id: s.id, status: "pending", notes: null })}>Limpar</Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </Card>
  );
}
