import { createFileRoute, Link } from '@tanstack/react-router'
import { useSuspenseQuery, useQueryClient, useMutation, useQuery } from '@tanstack/react-query'
import { useServerFn } from '@tanstack/react-start'
import { getLeads, updateLeadRecovery, addLeadHistory, getCollaborators } from '@/lib/leads.functions'
import { getProposalByLead } from '@/lib/proposals.functions'
import { askCommercialAi } from '@/lib/commercial-ai.functions'
import { ProposalConfigurator } from '@/components/commercial/ProposalConfigurator'
import { Card } from '@/components/ui/card'
import { 
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow 
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { User, Mail, Phone, AlertCircle, Clock, Search, Filter, History, MessageSquare, Calendar, UserPlus, CheckCircle2, Bot, Send, Sparkles, FileText, Workflow, Loader2 } from 'lucide-react'
import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { 
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogTrigger 
} from '@/components/ui/dialog'
import { 
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue 
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { toast } from 'sonner'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'

export const Route = createFileRoute('/_authenticated/leads')({
  loader: async ({ context }) => {
    try {
      await Promise.all([
        context.queryClient.ensureQueryData({
          queryKey: ['leads'],
          queryFn: () => getLeads()
        }),
        context.queryClient.ensureQueryData({
          queryKey: ['collaborators'],
          queryFn: () => getCollaborators()
        })
      ])
    } catch (err) {
      console.error("[LeadsRoute.loader] Erro ao pré-carregar leads:", err);
      // Não lançar erro aqui para permitir que o componente lide com o estado de erro via useQuery
    }
  },
  component: LeadsPage
})

function LeadsPage() {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [selectedLead, setSelectedLead] = useState<any>(null)
  const [isRecoveryOpen, setIsRecoveryOpen] = useState(false)
  const [isAiOpen, setIsAiOpen] = useState(false)
  const [aiQuestion, setAiQuestion] = useState('')
  const [aiHistory, setAiHistory] = useState<{q: string, a: string}[]>([])
  const [isAiLoading, setIsAiLoading] = useState(false)
  const [isProposalOpen, setIsProposalOpen] = useState(false)
  const [activeProposal, setActiveProposal] = useState<any>(null)
  const [isProposalLoading, setIsProposalLoading] = useState(false)

  const getProposalFn = useServerFn(getProposalByLead)

  const handleOpenProposal = async (lead: any) => {
    setIsProposalLoading(true)
    try {
      const proposal = await getProposalFn({ data: { leadId: lead.id } })
      setActiveProposal(proposal)
      setIsProposalOpen(true)
    } catch (err: any) {
      toast.error("Erro ao carregar proposta")
    } finally {
      setIsProposalLoading(false)
    }
  }

  const handleAskAi = async () => {
    if (!aiQuestion.trim() || isAiLoading) return
    setIsAiLoading(true)
    try {
      const res = await askCommercialAi({ data: { question: aiQuestion } })
      setAiHistory(prev => [...prev, { q: aiQuestion, a: res.answer || '' }])
      setAiQuestion('')
    } catch (err: any) {
      toast.error("Erro ao consultar IA")
    } finally {
      setIsAiLoading(false)
    }
  }

  const { data: leads, isLoading: isLoadingLeads, error: leadsError } = useQuery({
    queryKey: ['leads'],
    queryFn: () => getLeads(),
    retry: 1
  })
  
  const { data: collaborators, isLoading: isLoadingCollaborators } = useQuery({
    queryKey: ['collaborators'],
    queryFn: () => getCollaborators(),
    retry: 1
  })

  const updateMutation = useMutation({
    mutationFn: (payload: any) => updateLeadRecovery(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads'] })
      toast.success('Lead atualizado com sucesso')
    },
    onError: (error: any) => toast.error(`Erro ao atualizar lead: ${error.message}`)
  })

  const historyMutation = useMutation({
    mutationFn: (payload: any) => addLeadHistory(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads'] })
      toast.success('Interação registrada')
    },
    onError: (error: any) => toast.error(`Erro ao registrar interação: ${error.message}`)
  })

  const getStatusBadge = (status: string, lead?: any) => {
    const badges = [];
    
    if (lead?.interested_in_personalized_solution) {
      badges.push(<Badge key="pers" variant="default" className="bg-purple-600">Personalizado</Badge>);
    }

    const statusMap: Record<string, { label: string, color: string }> = {
      novo: { label: 'Novo', color: 'bg-blue-500' },
      aguardando_contato: { label: 'Aguardando Contato', color: 'bg-yellow-500' },
      em_atendimento: { label: 'Em Atendimento', color: 'bg-indigo-500' },
      proposta_enviada: { label: 'Proposta Enviada', color: 'bg-orange-500' },
      contratado: { label: 'Contratado', color: 'bg-green-500' },
      perdido: { label: 'Perdido', color: 'bg-slate-500' },
      spam: { label: 'Spam', color: 'bg-red-500' },
      interessado: { label: 'Interessado', color: 'bg-blue-400' },
      contratação_em_andamento: { label: 'Em contratação', color: 'bg-blue-600' },
      abandonado: { label: 'Abandonado', color: 'bg-red-400' },
    };

    const config = statusMap[status] || { label: status, color: 'bg-slate-400' };
    badges.push(<Badge key="status" className={config.color}>{config.label}</Badge>);

    return (
      <div className="flex flex-col gap-1 items-start">
        {badges}
        {lead?.preferred_contact_channel && (
          <span className="text-[9px] text-muted-foreground lowercase">
            via {lead.preferred_contact_channel === 'whatsapp' ? 'WhatsApp' : 'Vídeo'}
          </span>
        )}
        {lead?.proposals && lead.proposals.length > 0 && (
          <Badge variant="outline" className="text-[9px] h-4 py-0 font-normal border-purple-200 text-purple-700 bg-purple-50">
            {lead.proposals.length} Proposta(s)
          </Badge>
        )}
      </div>
    );
  };

  const getPriorityBadge = (priority: string) => {
    switch (priority) {
      case 'urgente': return <Badge variant="destructive" className="animate-pulse">Urgente</Badge>
      case 'alta': return <Badge variant="destructive">Alta</Badge>
      case 'média': return <Badge variant="default" className="bg-amber-500">Média</Badge>
      case 'baixa': return <Badge variant="secondary">Baixa</Badge>
      default: return <Badge variant="outline">{priority || 'média'}</Badge>
    }
  }

  const filteredLeads = leads?.filter((l: any) => 
    l.name?.toLowerCase().includes(search.toLowerCase()) ||
    l.email?.toLowerCase().includes(search.toLowerCase()) ||
    l.phone?.includes(search)
  )

  const brl = (n: number | null) => 
    n == null ? "—" : n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })

  return (
    <div className="container py-8 space-y-8">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold">Gestão de Leads</h1>
          <p className="text-muted-foreground">Recuperação comercial e acompanhamento de propostas.</p>
        </div>
        <div className="relative w-full md:w-80">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input 
            placeholder="Buscar por nome, email ou telefone..." 
            className="pl-10"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Button onClick={() => setIsAiOpen(true)} className="bg-primary/10 text-primary hover:bg-primary/20 border-primary/20" variant="outline">
          <Bot className="mr-2 h-4 w-4" />
          IA Comercial
        </Button>
      </div>

      <Dialog open={isAiOpen} onOpenChange={setIsAiOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              IA Comercial Digital SC
            </DialogTitle>
            <DialogDescription>
              Pergunte sobre métricas, conversão e desempenho dos leads.
            </DialogDescription>
          </DialogHeader>
          
          <div className="flex flex-col gap-4 py-4">
            <ScrollArea className="h-[300px] rounded-md border p-4 bg-muted/20">
              {aiHistory.length === 0 && (
                <div className="text-center text-muted-foreground text-sm mt-10">
                  <Bot className="h-8 w-8 mx-auto mb-2 opacity-20" />
                  Como posso ajudar hoje?
                  <div className="mt-4 flex flex-col gap-2">
                    <button onClick={() => setAiQuestion("Quantos leads chegaram hoje?")} className="text-[10px] hover:underline text-primary">"Quantos leads chegaram hoje?"</button>
                    <button onClick={() => setAiQuestion("Qual a taxa de conversão?")} className="text-[10px] hover:underline text-primary">"Qual a taxa de conversão?"</button>
                    <button onClick={() => setAiQuestion("Quais ações estão atrasadas?")} className="text-[10px] hover:underline text-primary">"Quais ações estão atrasadas?"</button>
                  </div>
                </div>
              )}
              {aiHistory.map((chat, i) => (
                <div key={i} className="mb-4 space-y-2">
                  <div className="flex justify-end">
                    <div className="bg-primary text-primary-foreground text-xs p-2 rounded-lg max-w-[80%]">
                      {chat.q}
                    </div>
                  </div>
                  <div className="flex justify-start">
                    <div className="bg-background border text-xs p-2 rounded-lg max-w-[80%]">
                      {chat.a}
                    </div>
                  </div>
                </div>
              ))}
              {isAiLoading && (
                <div className="flex justify-start">
                  <div className="bg-background border text-xs p-2 rounded-lg animate-pulse">
                    Analisando dados...
                  </div>
                </div>
              )}
            </ScrollArea>
            <div className="flex gap-2">
              <Input 
                placeholder="Pergunte sobre os leads..." 
                value={aiQuestion}
                onChange={(e) => setAiQuestion(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAskAi()}
              />
              <Button size="icon" onClick={handleAskAi} disabled={isAiLoading}>
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {leadsError ? (
        <Card className="p-12 text-center space-y-4">
          <div className="mx-auto w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center">
            <AlertCircle className="h-6 w-6 text-destructive" />
          </div>
          <div className="space-y-2">
            <h3 className="text-lg font-semibold">Erro ao carregar leads</h3>
            <p className="text-sm text-muted-foreground max-w-xs mx-auto">
              Não foi possível buscar as informações dos leads. Verifique sua conexão ou permissões.
            </p>
          </div>
          <Button onClick={() => queryClient.invalidateQueries({ queryKey: ['leads'] })}>
            Tentar novamente
          </Button>
          {leadsError instanceof Error && (
            <p className="text-[10px] text-muted-foreground mt-4">
              Detalhes: {leadsError.message}
            </p>
          )}
        </Card>
      ) : isLoadingLeads ? (
        <Card className="p-12 text-center space-y-4">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
          <p className="text-sm text-muted-foreground">Carregando leads...</p>
        </Card>
      ) : leads && leads.length === 0 ? (
        <Card className="p-12 text-center space-y-4">
          <div className="mx-auto w-12 h-12 rounded-full bg-muted flex items-center justify-center">
            <Search className="h-6 w-6 text-muted-foreground" />
          </div>
          <div className="space-y-2">
            <h3 className="text-lg font-semibold">Nenhum lead encontrado</h3>
            <p className="text-sm text-muted-foreground">
              Ainda não existem registros de leads no sistema.
            </p>
          </div>
        </Card>
      ) : (

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Lead</TableHead>
              <TableHead>Responsável</TableHead>
              <TableHead>Prioridade</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Próxima Ação</TableHead>
              <TableHead>Data</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredLeads?.map((lead: any) => (
              <TableRow key={lead.id} className={lead.priority === 'urgente' ? 'bg-destructive/5' : ''}>
                <TableCell>
                  <div className="flex flex-col gap-1">
                    <span className="font-medium flex items-center gap-2">
                      <User className="h-3 w-3 text-muted-foreground" />
                      {lead.name || 'Sem nome'}
                    </span>
                    <span className="text-[10px] text-muted-foreground flex items-center gap-2">
                      <Phone className="h-3 w-3" />
                      {lead.phone || '—'}
                    </span>
                  </div>
                </TableCell>
                <TableCell>
                  {lead.responsible ? (
                    <div className="flex items-center gap-2">
                      <Avatar className="h-6 w-6">
                        <AvatarImage src={lead.responsible.avatar_url} />
                        <AvatarFallback>{lead.responsible.full_name?.charAt(0)}</AvatarFallback>
                      </Avatar>
                      <span className="text-xs">{lead.responsible.full_name}</span>
                    </div>
                  ) : (
                    <span className="text-xs text-muted-foreground italic">Não atribuído</span>
                  )}
                </TableCell>
                <TableCell>
                  {getPriorityBadge(lead.priority)}
                </TableCell>
                <TableCell>
                  {getStatusBadge(lead.status, lead)}
                </TableCell>
                <TableCell>
                  {lead.next_action_date ? (
                    <div className="flex flex-col gap-0.5">
                      <span className="text-[10px] font-medium text-amber-600 flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {format(new Date(lead.next_action_date), "dd/MM", { locale: ptBR })}
                      </span>
                      <span className="text-[10px] text-muted-foreground truncate max-w-[120px]">
                        {lead.next_action_description || 'Ação pendente'}
                      </span>
                    </div>
                  ) : (
                    <span className="text-[10px] text-muted-foreground italic">Sem agendamento</span>
                  )}
                </TableCell>
                <TableCell className="text-[10px] text-muted-foreground">
                  {format(new Date(lead.created_at), "dd/MM/yy HH:mm", { locale: ptBR })}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    {lead.status === 'contratação_em_andamento' && (
                      <Button variant="ghost" size="sm" asChild title="Ver Contrato">
                        <Link to="/contracts">
                          <FileText className="h-4 w-4 text-primary" />
                        </Link>
                      </Button>
                    )}
                    <Button 
                      variant="outline" 
                      size="sm"
                      className="gap-1.5"
                      onClick={() => handleOpenProposal(lead)}
                      disabled={isProposalLoading}
                    >
                      <FileText className="h-3.5 w-3.5" />
                      Proposta
                    </Button>
                    <Button 
                      variant="default" 
                      size="sm"
                      onClick={() => {
                        setSelectedLead(lead)
                        setIsRecoveryOpen(true)
                      }}
                    >
                      Gerenciar
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <Dialog open={isRecoveryOpen} onOpenChange={setIsRecoveryOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col p-0 overflow-hidden">
          {selectedLead && (
            <>
              <DialogHeader className="p-6 pb-2">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <DialogTitle className="text-2xl flex items-center gap-3">
                      {selectedLead.name || 'Lead sem nome'}
                      {selectedLead.status === 'contratação_em_andamento' && (
                        <Link to="/contracts" className="text-primary hover:underline text-xs font-normal flex items-center gap-1 bg-primary/5 px-2 py-1 rounded">
                          <FileText className="h-3 w-3" /> Ver Contrato
                        </Link>
                      )}
                    </DialogTitle>
                    <DialogDescription className="flex items-center gap-4 mt-1">
                      <span className="flex items-center gap-1"><Mail className="h-3 w-3" /> {selectedLead.email || '—'}</span>
                      <span className="flex items-center gap-1"><Phone className="h-3 w-3" /> {selectedLead.phone || '—'}</span>
                    </DialogDescription>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    {getStatusBadge(selectedLead.status, selectedLead)}
                    <div className="flex flex-col items-end gap-1 mt-1">
                      <Badge variant="outline" className="text-[10px]">
                        Origem: {selectedLead.origin === 'opening' ? 'Abertura' : selectedLead.origin === 'switching' ? 'Troca' : selectedLead.origin === 'landing_personalized' ? 'Landing Personalizado' : selectedLead.origin || 'Desconhecida'}
                      </Badge>
                      {selectedLead.requested_personalized_at && (
                        <span className="text-[9px] text-muted-foreground flex items-center gap-1">
                          <Clock className="h-2.5 w-2.5" />
                          Personalizado em {format(new Date(selectedLead.requested_personalized_at), "dd/MM HH:mm", { locale: ptBR })}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </DialogHeader>

              <div className="flex-1 overflow-hidden flex flex-col md:flex-row border-t">
                {/* Painel Esquerdo: Edição/Recuperação */}
                <div className="w-full md:w-1/2 p-6 overflow-y-auto border-r space-y-6">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Responsável</label>
                      <Select 
                        defaultValue={selectedLead.responsible_profile_id || undefined}
                        onValueChange={(val) => updateMutation.mutate({ data: { id: selectedLead.id, responsible_profile_id: val } })}
                      >
                        <SelectTrigger className="h-9">
                          <SelectValue placeholder="Atribuir..." />
                        </SelectTrigger>
                        <SelectContent>
                          {collaborators?.map((col: any) => (
                            <SelectItem key={col.id} value={col.id}>
                              <div className="flex items-center gap-2 text-xs">
                                <Avatar className="h-4 w-4">
                                  <AvatarImage src={col.avatar_url} />
                                  <AvatarFallback>{col.full_name?.charAt(0)}</AvatarFallback>
                                </Avatar>
                                {col.full_name}
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Prioridade</label>
                      <Select 
                        defaultValue={selectedLead.priority || 'média'}
                        onValueChange={(val) => updateMutation.mutate({ data: { id: selectedLead.id, priority: val } })}
                      >
                        <SelectTrigger className="h-9">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="baixa">Baixa</SelectItem>
                          <SelectItem value="média">Média</SelectItem>
                          <SelectItem value="alta">Alta</SelectItem>
                          <SelectItem value="urgente">Urgente</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Alterar Status Comercial</label>
                    <Select 
                      defaultValue={selectedLead.status}
                      onValueChange={(val) => updateMutation.mutate({ data: { id: selectedLead.id, status: val } })}
                    >
                      <SelectTrigger className="h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="interessado">Interessado</SelectItem>
                        <SelectItem value="contratação_em_andamento">Em contratação</SelectItem>
                        <SelectItem value="abandonado">Abandonado</SelectItem>
                        <SelectItem value="perdido">Perdido</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {selectedLead.interested_in_personalized_solution && (
                    <div className="bg-purple-50 border border-purple-100 p-4 rounded-lg space-y-2">
                      <div className="flex items-center gap-2 text-purple-700 font-bold text-sm">
                        <Sparkles className="h-4 w-4" /> Solução Personalizada Solicitada
                      </div>
                      <div className="text-xs text-purple-600 flex items-center gap-4">
                        <span className="flex items-center gap-1 capitalize">
                          {selectedLead.preferred_contact_channel === 'whatsapp' ? <MessageSquare className="h-3 w-3" /> : <Workflow className="h-3 w-3" />}
                          Canal: {selectedLead.preferred_contact_channel}
                        </span>
                        {selectedLead.requested_personalized_at && (
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {format(new Date(selectedLead.requested_personalized_at), "dd/MM HH:mm", { locale: ptBR })}
                          </span>
                        )}
                      </div>
                    </div>
                  )}

                  <div className="pt-2">
                    <Button 
                      variant="outline" 
                      className="w-full gap-2 border-primary/20 hover:bg-primary/5 text-primary"
                      onClick={() => {
                        setIsRecoveryOpen(false)
                        handleOpenProposal(selectedLead)
                      }}
                    >
                      <FileText className="h-4 w-4" />
                      {selectedLead.interested_in_personalized_solution ? 'Configurar Proposta Personalizada' : 'Gerar Proposta'}
                    </Button>
                  </div>

                  <Separator />

                  <div className="space-y-4 bg-muted/30 p-4 rounded-lg">
                    <h4 className="text-sm font-semibold flex items-center gap-2">
                      <Calendar className="h-4 w-4" /> Próximo Passo
                    </h4>
                    <div className="space-y-2">
                      <label className="text-xs text-muted-foreground">Data e Horário</label>
                      <Input 
                        type="datetime-local" 
                        defaultValue={selectedLead.next_action_date ? format(new Date(selectedLead.next_action_date), "yyyy-MM-dd'T'HH:mm") : ""}
                        onChange={(e) => updateMutation.mutate({ data: { id: selectedLead.id, next_action_date: e.target.value } })}
                        className="h-9"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs text-muted-foreground">O que deve ser feito?</label>
                      <Input 
                        placeholder="Ex: Ligar para confirmar faturamento" 
                        defaultValue={selectedLead.next_action_description || ""}
                        onBlur={(e) => updateMutation.mutate({ data: { id: selectedLead.id, next_action_description: e.target.value } })}
                        className="h-9"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Observações Internas</label>
                    <Textarea 
                      placeholder="Notas sobre o perfil do cliente, objeções, etc..."
                      defaultValue={selectedLead.internal_notes || ""}
                      className="min-h-[100px]"
                      onBlur={(e) => updateMutation.mutate({ data: { id: selectedLead.id, internal_notes: e.target.value } })}
                    />
                  </div>
                </div>

                {/* Painel Direito: Histórico/Timeline */}
                <div className="w-full md:w-1/2 p-0 flex flex-col bg-slate-50">
                  <div className="p-4 border-b bg-white flex items-center justify-between">
                    <h4 className="text-sm font-semibold flex items-center gap-2 uppercase tracking-tight">
                      <History className="h-4 w-4 text-primary" /> Histórico de Contatos
                    </h4>
                  </div>
                  
                  <ScrollArea className="flex-1 p-4">
                    <div className="space-y-6">
                      {selectedLead.history && selectedLead.history.length > 0 ? (
                        selectedLead.history.sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).map((item: any) => (
                          <div key={item.id} className="relative pl-6 pb-6 border-l last:pb-0">
                            <div className="absolute -left-[6.5px] top-0 h-3 w-3 rounded-full bg-primary ring-4 ring-white" />
                            <div className="space-y-1">
                              <div className="flex items-center justify-between">
                                <span className="text-[11px] font-bold text-slate-900">{item.profile?.full_name}</span>
                                <span className="text-[10px] text-muted-foreground">
                                  {format(new Date(item.created_at), "dd MMM, HH:mm", { locale: ptBR })}
                                </span>
                              </div>
                              <p className="text-xs text-slate-600 leading-relaxed whitespace-pre-wrap">{item.content}</p>
                              <Badge variant="outline" className="text-[9px] h-4 py-0 font-normal">
                                {item.action_type === 'tentativa_contato' ? 'Contato' : 'Status'}
                              </Badge>
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="flex flex-col items-center justify-center py-12 text-center space-y-2 opacity-40">
                          <MessageSquare className="h-10 w-10" />
                          <p className="text-xs">Nenhum histórico registrado</p>
                        </div>
                      )}
                    </div>
                  </ScrollArea>

                  <div className="p-4 bg-white border-t mt-auto">
                    <div className="space-y-3">
                      <Textarea 
                        id="new-history-content"
                        placeholder="Descreva a tentativa de contato ou nova nota..."
                        className="text-xs min-h-[80px] resize-none focus-visible:ring-primary"
                      />
                      <div className="flex justify-end gap-2">
                        <Button 
                          size="sm" 
                          variant="ghost" 
                          className="text-xs h-8"
                          onClick={() => {
                            const input = document.getElementById('new-history-content') as HTMLTextAreaElement;
                            if (input) input.value = '';
                          }}
                        >
                          Limpar
                        </Button>
                        <Button 
                          size="sm" 
                          className="text-xs h-8 gap-1.5"
                          onClick={() => {
                            const input = document.getElementById('new-history-content') as HTMLTextAreaElement;
                            if (input?.value.trim()) {
                              historyMutation.mutate({
                                data: {
                                  lead_id: selectedLead.id,
                                  action_type: 'tentativa_contato',
                                  content: input.value.trim()
                                }
                              });
                              input.value = '';
                            }
                          }}
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" /> Registrar Contato
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {selectedLead && (
        <ProposalConfigurator 
          lead={selectedLead}
          proposal={activeProposal}
          isOpen={isProposalOpen}
          onOpenChange={setIsProposalOpen}
          collaborators={collaborators || []}
        />
      )}
    </div>
  )
}
