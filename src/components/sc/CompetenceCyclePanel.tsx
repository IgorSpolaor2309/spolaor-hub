import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { formatBR } from "@/lib/dates";
import { OFFICIAL_LABEL, OFFICIAL_TONE, canTransition, type CompetenceRow, type OfficialStatus } from "@/lib/competence-status";
import { AlertCircle, CheckCircle2, Clock, History, PlayCircle, RotateCcw, Send, UserCog, PauseCircle } from "lucide-react";

type Props = {
  clientId: string;
  competence: string;
  role: "admin" | "collaborator" | "client" | null;
  userId: string | null;
};

type EvalResult = {
  blockers: { code: string; label: string }[];
  alerts: { code: string; label: string }[];
  counts: Record<string, number>;
  phase: "review" | "complete";
};

function sanitizeError(e: any): string {
  const msg = String(e?.message ?? e ?? "");
  // Não expor mensagens SQL cruas (ex.: column "..." does not exist).
  if (/column .* does not exist/i.test(msg) || /relation .* does not exist/i.test(msg)) {
    console.error("[CompetenceCyclePanel] erro técnico:", msg);
    return "Não foi possível carregar a competência.";
  }
  return msg || "Não foi possível carregar a competência.";
}

export function CompetenceCyclePanel({ clientId, competence, role, userId }: Props) {
  const qc = useQueryClient();
  
  const isAdmin = role === "admin";

  const competenceQ = useQuery({
    queryKey: ["competence-row", clientId, competence],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("client_competences")
        .select("*")
        .eq("client_id", clientId)
        .eq("competence", competence)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as CompetenceRow | null;
    },
  });

  const collabsQ = useQuery({
    queryKey: ["competence-collabs", clientId],
    queryFn: async () => {
      // Colaboradores vinculados (via collaborators.user_id) + owner do cliente.
      const { data: links, error: linksErr } = await (supabase as any)
        .from("client_collaborators")
        .select("collaborator_id, collaborators:collaborator_id(user_id, status)")
        .eq("client_id", clientId);
      if (linksErr) throw linksErr;
      const { data: client } = await (supabase as any)
        .from("clients").select("owner_profile_id").eq("id", clientId).maybeSingle();
      const ids = new Set<string>();
      (links ?? []).forEach((r: any) => {
        const uid = r?.collaborators?.user_id;
        const st = r?.collaborators?.status ?? "active";
        if (uid && st === "active") ids.add(uid);
      });
      if (client?.owner_profile_id) ids.add(client.owner_profile_id);
      if (ids.size === 0) return [];
      const { data: profs } = await (supabase as any)
        .from("profiles").select("id, full_name, status")
        .in("id", Array.from(ids));
      return (profs ?? []).filter((p: any) => (p.status ?? "active") === "active");
    },
  });

  const historyQ = useQuery({
    queryKey: ["competence-history", clientId, competence],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("timeline_events")
        .select("id, tipo, descricao, metadata, created_at, actor_profile_id")
        .eq("client_id", clientId)
        .like("tipo", "competencia:%")
        .order("created_at", { ascending: false })
        .limit(60);
      if (error) throw error;
      return (data ?? []).filter((e: any) => (e.metadata?.competence ?? competence) === competence);
    },
  });

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ["competence-row", clientId, competence] });
    qc.invalidateQueries({ queryKey: ["competence-history", clientId, competence] });
    qc.invalidateQueries({ queryKey: ["competences-persisted"] });
  };

  const startM = useMutation({
    mutationFn: async () => {
      const { error } = await (supabase as any).rpc("competence_start", {
        p_client_id: clientId, p_competence: competence, p_responsible: userId,
      });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Competência iniciada"); invalidateAll(); },
    onError: (e: any) => toast.error(sanitizeError(e)),
  });

  const statusM = useMutation({
    mutationFn: async (vars: { newStatus: OfficialStatus; note?: string }) => {
      const { error } = await (supabase as any).rpc("competence_change_status", {
        p_id: competenceQ.data!.id, p_new_status: vars.newStatus, p_note: vars.note ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Status atualizado"); invalidateAll(); },
    onError: (e: any) => toast.error(sanitizeError(e)),
  });

  const responsibleM = useMutation({
    mutationFn: async (newResp: string | null) => {
      const { error } = await (supabase as any).rpc("competence_change_responsible", {
        p_id: competenceQ.data!.id, p_new_responsible: newResp,
      });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Responsável atualizado"); invalidateAll(); },
    onError: (e: any) => toast.error(sanitizeError(e)),
  });

  const reviewM = useMutation({
    mutationFn: async (vars: { acceptedAlerts: any[]; justification: string }) => {
      const { error } = await (supabase as any).rpc("competence_send_to_review", {
        p_id: competenceQ.data!.id,
        p_accepted_alerts: vars.acceptedAlerts,
        p_justification: vars.justification || null,
      });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Enviado para revisão"); invalidateAll(); },
    onError: (e: any) => toast.error(sanitizeError(e)),
  });

  const completeM = useMutation({
    mutationFn: async (vars: { notes: string; acceptedAlerts: any[]; justification: string }) => {
      const { error } = await (supabase as any).rpc("competence_complete", {
        p_id: competenceQ.data!.id,
        p_notes: vars.notes || null,
        p_accepted_alerts: vars.acceptedAlerts,
        p_justification: vars.justification || null,
      });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Competência concluída"); invalidateAll(); },
    onError: (e: any) => toast.error(sanitizeError(e)),
  });

  const reopenM = useMutation({
    mutationFn: async (reason: string) => {
      const { error } = await (supabase as any).rpc("competence_reopen", {
        p_id: competenceQ.data!.id, p_reason: reason,
      });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Competência reaberta"); invalidateAll(); },
    onError: (e: any) => toast.error(sanitizeError(e)),
  });

  const [awaitingOpen, setAwaitingOpen] = useState(false);
  const [awaitingNote, setAwaitingNote] = useState("");
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewJust, setReviewJust] = useState("");
  const [reviewEval, setReviewEval] = useState<EvalResult | null>(null);
  const [completeOpen, setCompleteOpen] = useState(false);
  const [completeEval, setCompleteEval] = useState<EvalResult | null>(null);
  const [completeNotes, setCompleteNotes] = useState("");
  const [completeJust, setCompleteJust] = useState("");
  const [reopenOpen, setReopenOpen] = useState(false);
  const [reopenReason, setReopenReason] = useState("");

  const openReviewDialog = async () => {
    const { data, error } = await (supabase as any).rpc("competence_evaluate", {
      p_client_id: clientId, p_competence: competence, p_phase: "review",
    });
    if (error) { toast.error(sanitizeError(error)); return; }
    setReviewEval(data as EvalResult);
    setReviewJust("");
    setReviewOpen(true);
  };

  const openCompleteDialog = async () => {
    const { data, error } = await (supabase as any).rpc("competence_evaluate", {
      p_client_id: clientId, p_competence: competence, p_phase: "complete",
    });
    if (error) { toast.error(sanitizeError(error)); return; }
    setCompleteEval(data as EvalResult);
    setCompleteNotes("");
    setCompleteJust("");
    setCompleteOpen(true);
  };

  if (competenceQ.isLoading) {
    return <Card className="p-4"><p className="text-sm text-muted-foreground">Carregando ciclo…</p></Card>;
  }

  const row = competenceQ.data;

  // Ainda não iniciada
  if (!row) {
    return (
      <Card className="p-4">
        <div className="mb-2 flex items-center gap-1.5 font-display text-base">
          <PlayCircle className="h-4 w-4" /> Ciclo da competência
        </div>
        <p className="text-sm text-muted-foreground">
          Esta competência ainda não foi iniciada oficialmente. Iniciar cria um registro dedicado com status e histórico.
        </p>
        <div className="mt-3">
          <Button onClick={() => startM.mutate()} disabled={startM.isPending}>
            <PlayCircle className="mr-1 h-4 w-4" /> Iniciar competência
          </Button>
        </div>
      </Card>
    );
  }

  const canReview = canTransition(row.status, "in_review");
  const canProgress = canTransition(row.status, "in_progress");
  const canAwait = canTransition(row.status, "awaiting_client");
  const canComplete = isAdmin && canTransition(row.status, "completed");
  const canReopen = isAdmin && canTransition(row.status, "reopened");
  const readonlyStatus = row.status === "completed";

  return (
    <>
      <Card className="p-4">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <div className="font-display text-base">Ciclo da competência</div>
          <Badge className={OFFICIAL_TONE[row.status]}>{OFFICIAL_LABEL[row.status]}</Badge>
          {row.is_demo && <Badge variant="outline" className="border-dashed">DEMO</Badge>}
        </div>

        <div className="grid gap-3 text-sm md:grid-cols-3">
          <Field label="Responsável">
            {isAdmin || (row.responsible_profile_id === userId) ? (
              <Select
                value={row.responsible_profile_id ?? "none"}
                onValueChange={(v) => responsibleM.mutate(v === "none" ? null : v)}
                disabled={readonlyStatus || responsibleM.isPending}
              >
                <SelectTrigger className="h-8"><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sem responsável</SelectItem>
                  {(collabsQ.data ?? []).map((p: any) => (
                    <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <span>{(collabsQ.data ?? []).find((p: any) => p.id === row.responsible_profile_id)?.full_name ?? "—"}</span>
            )}
          </Field>
          <Field label="Início">{formatBR(row.created_at)}</Field>
          <Field label="Enviada para revisão em">{row.review_requested_at ? formatBR(row.review_requested_at) : "—"}</Field>
          <Field label="Concluída em">{row.completed_at ? formatBR(row.completed_at) : "—"}</Field>
          <Field label="Reaberta em">{row.reopened_at ? formatBR(row.reopened_at) : "—"}</Field>
          <Field label="Aguardando cliente desde">{row.awaiting_client_since ? formatBR(row.awaiting_client_since) : "—"}</Field>
        </div>

        {row.awaiting_client_note && row.status === "awaiting_client" && (
          <div className="mt-2 rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">
            <strong>Motivo:</strong> {row.awaiting_client_note}
          </div>
        )}
        {row.reopen_reason && (
          <div className="mt-2 rounded-md border border-orange-200 bg-orange-50 p-2 text-xs text-orange-900">
            <strong>Motivo da reabertura:</strong> {row.reopen_reason}
          </div>
        )}
        {row.completion_notes && row.status === "completed" && (
          <div className="mt-2 rounded-md border border-emerald-200 bg-emerald-50 p-2 text-xs text-emerald-900">
            <strong>Observação da conclusão:</strong> {row.completion_notes}
          </div>
        )}

        {/* Ações */}
        <div className="mt-3 flex flex-wrap gap-2">
          {canProgress && (
            <Button size="sm" variant="outline" onClick={() => statusM.mutate({ newStatus: "in_progress" })} disabled={statusM.isPending}>
              <PlayCircle className="mr-1 h-4 w-4" /> Colocar em andamento
            </Button>
          )}
          {canAwait && (
            <Button size="sm" variant="outline" onClick={() => { setAwaitingNote(""); setAwaitingOpen(true); }}>
              <PauseCircle className="mr-1 h-4 w-4" /> Aguardando cliente
            </Button>
          )}
          {canReview && (
            <Button size="sm" onClick={openReviewDialog}>
              <Send className="mr-1 h-4 w-4" /> Enviar para revisão
            </Button>
          )}
          {canComplete && (
            <Button size="sm" onClick={openCompleteDialog}>
              <CheckCircle2 className="mr-1 h-4 w-4" /> Concluir competência
            </Button>
          )}
          {canReopen && (
            <Button size="sm" variant="outline" onClick={() => { setReopenReason(""); setReopenOpen(true); }}>
              <RotateCcw className="mr-1 h-4 w-4" /> Reabrir competência
            </Button>
          )}
          {!isAdmin && (row.status === "in_review" || row.status === "reopened") && (
            <span className="text-xs text-muted-foreground">Somente administrador pode concluir ou reabrir.</span>
          )}
        </div>

        {row.status === "completed" && (
          <p className="mt-3 flex items-start gap-1 text-[11px] text-muted-foreground">
            <AlertCircle className="mt-0.5 h-3 w-3" />
            A conclusão registra o retrato do mês. Novos lançamentos posteriores podem alterar o retrato atual — o resumo salvo preserva o momento do fechamento.
          </p>
        )}
      </Card>

      {/* Histórico */}
      <Card className="mt-3 p-4">
        <h3 className="mb-2 flex items-center gap-1.5 font-display text-base">
          <History className="h-4 w-4" /> Histórico da competência
        </h3>
        {historyQ.isLoading ? (
          <p className="text-sm text-muted-foreground">Carregando…</p>
        ) : (historyQ.data ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">Sem eventos oficiais.</p>
        ) : (
          <ul className="divide-y">
            {(historyQ.data ?? []).map((ev: any) => (
              <li key={ev.id} className="py-2 text-sm">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-[10px]">{ev.tipo.replace("competencia:", "")}</Badge>
                  <span className="truncate">{ev.descricao}</span>
                  <span className="ml-auto text-xs text-muted-foreground">{formatBR(ev.created_at)}</span>
                </div>
                {ev.metadata?.note && <div className="ml-2 text-xs text-muted-foreground">Nota: {ev.metadata.note}</div>}
                {ev.metadata?.reason && <div className="ml-2 text-xs text-muted-foreground">Motivo: {ev.metadata.reason}</div>}
                {ev.metadata?.justification && <div className="ml-2 text-xs text-muted-foreground">Justificativa: {ev.metadata.justification}</div>}
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* Dialog: aguardando cliente */}
      <Dialog open={awaitingOpen} onOpenChange={setAwaitingOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Aguardando cliente</DialogTitle></DialogHeader>
          <Label className="text-xs">Motivo (opcional)</Label>
          <Textarea
            placeholder="Ex.: aguardando extrato, XML, folha, assinatura, resposta do cliente…"
            value={awaitingNote}
            onChange={(e) => setAwaitingNote(e.target.value)}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setAwaitingOpen(false)}>Cancelar</Button>
            <Button onClick={() => {
              statusM.mutate({ newStatus: "awaiting_client", note: awaitingNote });
              setAwaitingOpen(false);
            }} disabled={statusM.isPending}>Confirmar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: revisão */}
      <Dialog open={reviewOpen} onOpenChange={setReviewOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Enviar para revisão</DialogTitle></DialogHeader>
          {reviewEval && <EvalList result={reviewEval} />}
          {reviewEval && reviewEval.alerts.length > 0 && (
            <>
              <Label className="text-xs">Justificativa dos alertas</Label>
              <Textarea value={reviewJust} onChange={(e) => setReviewJust(e.target.value)} placeholder="Explique por que os alertas podem ser aceitos…" />
            </>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setReviewOpen(false)}>Cancelar</Button>
            <Button
              disabled={!reviewEval || reviewEval.blockers.length > 0 || reviewM.isPending || (reviewEval.alerts.length > 0 && !reviewJust.trim())}
              onClick={() => {
                reviewM.mutate({ acceptedAlerts: reviewEval?.alerts ?? [], justification: reviewJust });
                setReviewOpen(false);
              }}
            >Enviar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: concluir */}
      <Dialog open={completeOpen} onOpenChange={setCompleteOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Concluir competência</DialogTitle></DialogHeader>
          {completeEval && <EvalList result={completeEval} />}
          <Label className="text-xs">Observação final (opcional)</Label>
          <Textarea value={completeNotes} onChange={(e) => setCompleteNotes(e.target.value)} />
          {completeEval && completeEval.alerts.length > 0 && (
            <>
              <Label className="text-xs">Justificativa dos alertas</Label>
              <Textarea value={completeJust} onChange={(e) => setCompleteJust(e.target.value)} placeholder="Justifique os alertas aceitos…" />
            </>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setCompleteOpen(false)}>Cancelar</Button>
            <Button
              disabled={!completeEval || completeEval.blockers.length > 0 || completeM.isPending || (completeEval.alerts.length > 0 && !completeJust.trim())}
              onClick={() => {
                completeM.mutate({
                  notes: completeNotes,
                  acceptedAlerts: completeEval?.alerts ?? [],
                  justification: completeJust,
                });
                setCompleteOpen(false);
              }}
            >Confirmar conclusão</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: reabrir */}
      <Dialog open={reopenOpen} onOpenChange={setReopenOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Reabrir competência</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            A reabertura preserva o histórico da conclusão anterior. Uma justificativa é obrigatória.
          </p>
          <Label className="text-xs">Justificativa</Label>
          <Textarea value={reopenReason} onChange={(e) => setReopenReason(e.target.value)} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setReopenOpen(false)}>Cancelar</Button>
            <Button
              disabled={reopenReason.trim().length < 3 || reopenM.isPending}
              onClick={() => { reopenM.mutate(reopenReason); setReopenOpen(false); }}
            >Reabrir</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-sm">{children}</div>
    </div>
  );
}

function EvalList({ result }: { result: EvalResult }) {
  return (
    <div className="space-y-2 text-sm">
      {result.blockers.length > 0 ? (
        <div>
          <div className="mb-1 flex items-center gap-1 text-red-800"><AlertCircle className="h-4 w-4" /><strong>Bloqueios</strong></div>
          <ul className="list-disc space-y-0.5 pl-5 text-red-800">
            {result.blockers.map((b) => <li key={b.code}>{b.label}</li>)}
          </ul>
          <p className="mt-1 text-xs text-muted-foreground">Corrija os bloqueios para continuar.</p>
        </div>
      ) : (
        <div className="flex items-center gap-1 text-emerald-700"><CheckCircle2 className="h-4 w-4" /> Nenhum bloqueio.</div>
      )}
      {result.alerts.length > 0 && (
        <div>
          <div className="mb-1 flex items-center gap-1 text-amber-800"><Clock className="h-4 w-4" /><strong>Alertas</strong></div>
          <ul className="list-disc space-y-0.5 pl-5 text-amber-800">
            {result.alerts.map((a) => <li key={a.code}>{a.label}</li>)}
          </ul>
          <p className="mt-1 text-xs text-muted-foreground">Pode continuar mediante justificativa.</p>
        </div>
      )}
    </div>
  );
}
