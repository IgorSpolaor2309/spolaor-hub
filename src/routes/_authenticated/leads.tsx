import { createFileRoute } from '@tanstack/react-router'
import { useSuspenseQuery, useQueryClient } from '@tanstack/react-query'
import { getLeads } from '@/lib/leads.functions'
import { Card } from '@/components/ui/card'
import { 
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow 
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { User, Mail, Phone, MapPin, AlertCircle, Clock } from 'lucide-react'

export const Route = createFileRoute('/_authenticated/leads')({
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData({
      queryKey: ['leads'],
      queryFn: () => getLeads()
    })
  },
  component: LeadsPage
})

function LeadsPage() {
  const { data: leads } = useSuspenseQuery({
    queryKey: ['leads'],
    queryFn: () => getLeads()
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

  const getStepLabel = (step: string) => {
    const steps: Record<string, string> = {
      'conversa_iniciada': 'Conversa iniciada',
      'diagnostico_concluido': 'Diagnóstico concluído',
      'plano_visualizado': 'Plano visualizado',
      'preco_visualizado': 'Preço visualizado',
      'checkout_iniciado': 'Checkout iniciado',
      'cupom_aplicado': 'Cupom aplicado',
      'intencao_contratar': 'Intenção de contratar'
    }
    return steps[step] || step
  }

  const brl = (n: number | null) => 
    n == null ? "—" : n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })

  return (
    <div className="container py-8 space-y-8">
      <div>
        <h1 className="text-3xl font-display font-bold">Leads</h1>
        <p className="text-muted-foreground">Central de acompanhamento de interessados e propostas da Digital SC.</p>
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Lead</TableHead>
              <TableHead>Origem</TableHead>
              <TableHead>Plano/Valor</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Etapa/Gargalo</TableHead>
              <TableHead>Data</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {leads?.map((lead: any) => (
              <TableRow key={lead.id}>
                <TableCell>
                  <div className="flex flex-col gap-1">
                    <span className="font-medium flex items-center gap-2">
                      <User className="h-3 w-3 text-muted-foreground" />
                      {lead.contact_name || 'Sem nome'}
                    </span>
                    <span className="text-xs text-muted-foreground flex items-center gap-2">
                      <Mail className="h-3 w-3" />
                      {lead.contact_email || '—'}
                    </span>
                    <span className="text-xs text-muted-foreground flex items-center gap-2">
                      <Phone className="h-3 w-3" />
                      {lead.contact_phone || '—'}
                    </span>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex flex-col gap-1">
                    <span className="text-sm capitalize">
                      {lead.flow_origin === 'opening' ? 'Abrir minha empresa' : 'Trocar de contador'}
                    </span>
                    {lead.cnpj && (
                      <span className="text-[10px] text-muted-foreground font-mono">
                        CNPJ: {lead.cnpj}
                      </span>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex flex-col gap-1 text-sm">
                    <span className="font-medium text-primary">{lead.plans?.nome || '—'}</span>
                    <span className="text-xs text-muted-foreground">
                      Estimado: {brl(lead.final_value || lead.estimated_value)}
                    </span>
                  </div>
                </TableCell>
                <TableCell>
                  {getStatusBadge(lead.status_comercial)}
                </TableCell>
                <TableCell>
                  <div className="flex flex-col gap-1">
                    <span className="text-xs font-medium flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {getStepLabel(lead.journey_step)}
                    </span>
                    {lead.bottleneck_indicator && (
                      <span className="text-[10px] text-amber-600 flex items-center gap-1">
                        <AlertCircle className="h-3 w-3" />
                        {lead.bottleneck_indicator}
                      </span>
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {format(new Date(lead.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  )
}
