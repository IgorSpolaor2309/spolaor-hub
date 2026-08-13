import { createFileRoute } from '@tanstack/react-router'
import { useSuspenseQuery, useQueryClient, useMutation } from '@tanstack/react-query'
import { getLeads, updateLeadRecovery, addLeadHistory, getCollaborators } from '@/lib/leads.functions'
import { Card } from '@/components/ui/card'
import { 
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow 
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { User, Mail, Phone, AlertCircle, Clock, Search, Filter, History, MessageSquare, Calendar, UserPlus, CheckCircle2 } from 'lucide-react'
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
  },
  component: LeadsPage
})

function LeadsPage() {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [selectedLead, setSelectedLead] = useState<any>(null)
  const [isRecoveryOpen, setIsRecoveryOpen] = useState(false)

  const { data: leads } = useSuspenseQuery({
    queryKey: ['leads'],
    queryFn: () => getLeads()
  })

  const { data: collaborators } = useSuspenseQuery({
    queryKey: ['collaborators'],
    queryFn: () => getCollaborators()
  })

  const updateMutation = useMutation({
    mutationFn: (data: Parameters<typeof updateLeadRecovery>[0]["data"]) => updateLeadRecovery({ data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads'] })
      toast.success('Lead atualizado com sucesso')
    },
    onError: (error: any) => toast.error(`Erro ao atualizar lead: ${error.message}`)
  })

  const historyMutation = useMutation({
    mutationFn: (data: Parameters<typeof addLeadHistory>[0]["data"]) => addLeadHistory({ data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads'] })
      toast.success('Interação registrada')
    },
    onError: (error: any) => toast.error(`Erro ao registrar interação: ${error.message}`)
  })

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'interessado': return <Badge variant="secondary">Interessado</Badge>
      case 'contratação_em_andamento': return <Badge variant="default" className="bg-blue-500">Em contratação</Badge>
      case 'abandonado': return <Badge variant="destructive">Abandonado</Badge>
      case 'perdido': return <Badge variant="outline">Perdido</Badge>
      default: return <Badge variant="outline">{status}</Badge>
    }
  }

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
    l.contact_name?.toLowerCase().includes(search.toLowerCase()) ||
    l.contact_email?.toLowerCase().includes(search.toLowerCase()) ||
    l.contact_phone?.includes(search)
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
      </div>

      <Card>
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
                      {lead.contact_name || 'Sem nome'}
                    </span>
                    <span className="text-[10px] text-muted-foreground flex items-center gap-2">
                      <Phone className="h-3 w-3" />
                      {lead.contact_phone || '—'}
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
                  {getStatusBadge(lead.status_comercial)}
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
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => {
                      setSelectedLead(lead)
                      setIsRecoveryOpen(true)
                    }}
                  >
                    Gerenciar
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <Dialog open={isRecoveryOpen} onOpenChange={setIsRecoveryOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col p-0 overflow-hidden">
          {selectedLead && (
            <>
              <DialogHeader className="p-6 pb-2">
                <div className="flex items-start justify-between">
                  <div>
                    <DialogTitle className="text-2xl">{selectedLead.contact_name || 'Lead sem nome'}</DialogTitle>
                    <DialogDescription className="flex items-center gap-4 mt-1">
                      <span className="flex items-center gap-1"><Mail className="h-3 w-3" /> {selectedLead.contact_email || '—'}</span>
                      <span className="flex items-center gap-1"><Phone className="h-3 w-3" /> {selectedLead.contact_phone || '—'}</span>
                    </DialogDescription>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    {getStatusBadge(selectedLead.status_comercial)}
                    <Badge variant="outline" className="text-[10px]">
                      Origem: {selectedLead.flow_origin === 'opening' ? 'Abertura' : 'Troca'}
                    </Badge>
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
                        onValueChange={(val) => updateMutation.mutate({ id: selectedLead.id, responsible_profile_id: val })}
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
                        onValueChange={(val) => updateMutation.mutate({ id: selectedLead.id, priority: val })}
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
                      defaultValue={selectedLead.status_comercial}
                      onValueChange={(val) => updateMutation.mutate({ id: selectedLead.id, status_comercial: val })}
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
                        onChange={(e) => updateMutation.mutate({ id: selectedLead.id, next_action_date: e.target.value })}
                        className="h-9"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs text-muted-foreground">O que deve ser feito?</label>
                      <Input 
                        placeholder="Ex: Ligar para confirmar faturamento" 
                        defaultValue={selectedLead.next_action_description || ""}
                        onBlur={(e) => updateMutation.mutate({ id: selectedLead.id, next_action_description: e.target.value })}
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
                      onBlur={(e) => updateMutation.mutate({ id: selectedLead.id, internal_notes: e.target.value })}
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
                                prospect_id: selectedLead.id,
                                action_type: 'tentativa_contato',
                                content: input.value.trim()
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
    </div>
  )
}
