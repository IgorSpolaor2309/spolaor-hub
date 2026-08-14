import { createFileRoute } from '@tanstack/react-router'
import { useSuspenseQuery, useQueryClient, useMutation } from '@tanstack/react-query'
import { getContracts, updateContractStatus } from '@/lib/contracts.functions'
import { Card } from '@/components/ui/card'
import { 
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow 
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { FileText, User, Calendar, CheckCircle2, XCircle, Clock, Send, Eye, DollarSign } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { 
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter 
} from '@/components/ui/dialog'
import { 
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue 
} from '@/components/ui/select'
import { toast } from 'sonner'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { ContractViewer } from '@/components/commercial/ContractViewer'

export const Route = createFileRoute('/_authenticated/contracts')({
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData({
      queryKey: ['commercial-contracts'],
      queryFn: () => getContracts()
    })
  },
  component: ContractsPage
})

function ContractsPage() {
  const queryClient = useQueryClient()
  const [selectedContract, setSelectedContract] = useState<any>(null)
  const [isDetailsOpen, setIsDetailsOpen] = useState(false)
  const [isViewerOpen, setIsViewerOpen] = useState(false)

  const { data: contracts } = useSuspenseQuery({
    queryKey: ['commercial-contracts'],
    queryFn: () => getContracts()
  })

  const updateMutation = useMutation({
    mutationFn: (payload: any) => updateContractStatus(payload),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['commercial-contracts'] })
      queryClient.invalidateQueries({ queryKey: ['leads'] })
      toast.success(res.client_id ? 'Contrato assinado e cliente criado!' : 'Status atualizado')
      setIsDetailsOpen(false)
    },
    onError: (error: any) => toast.error(`Erro: ${error.message}`)
  })

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'aguardando_contrato': return <Badge variant="outline"><Clock className="mr-1 h-3 w-3" /> Aguardando</Badge>
      case 'contrato_gerado': return <Badge variant="secondary" className="bg-yellow-100 text-yellow-700 hover:bg-yellow-100"><FileText className="mr-1 h-3 w-3" /> Gerado</Badge>
      case 'contrato_enviado': return <Badge variant="secondary" className="bg-blue-100 text-blue-700 hover:bg-blue-100"><Send className="mr-1 h-3 w-3" /> Enviado</Badge>
      case 'contrato_assinado': return <Badge variant="default" className="bg-green-500 hover:bg-green-600"><CheckCircle2 className="mr-1 h-3 w-3" /> Assinado</Badge>
      case 'cancelado': return <Badge variant="destructive"><XCircle className="mr-1 h-3 w-3" /> Cancelado</Badge>
      default: return <Badge variant="outline">{status}</Badge>
    }
  }

  const brl = (n: number | null) => 
    n == null ? "—" : n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })

  return (
    <div className="container py-8 space-y-8">
      <div>
        <h1 className="text-3xl font-display font-bold">Contratações</h1>
        <p className="text-muted-foreground">Gestão de contratos comerciais e conversão de leads em clientes.</p>
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Prospect / Empresa</TableHead>
              <TableHead>Plano</TableHead>
              <TableHead>Valor Final</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Data</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {contracts?.map((contract: any) => (
              <TableRow key={contract.id}>
                <TableCell>
                  <div className="flex flex-col">
                    <span className="font-medium">{contract.prospect?.contact_name}</span>
                    <span className="text-[10px] text-muted-foreground">{contract.contract_data?.razao_social || 'Sem Razão Social'}</span>
                    <span className="text-[10px] text-muted-foreground">CNPJ: {contract.prospect?.cnpj || '—'}</span>
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className="font-normal">
                    {contract.plan?.nome}
                  </Badge>
                </TableCell>
                <TableCell className="font-semibold text-primary">
                  {brl(contract.final_value)}
                </TableCell>
                <TableCell>
                  {getStatusBadge(contract.status)}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {format(new Date(contract.created_at), "dd/MM/yy HH:mm", { locale: ptBR })}
                </TableCell>
                 <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => {
                        setSelectedContract({ ...contract, prospect: { ...contract.prospect, id: contract.prospect_id, contracting_id: contract.id } })
                        setIsViewerOpen(true)
                      }}
                    >
                      <FileText className="mr-2 h-4 w-4" />
                      Contrato
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => {
                        setSelectedContract(contract)
                        setIsDetailsOpen(true)
                      }}
                    >
                      <Eye className="mr-2 h-4 w-4" />
                      Detalhes
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {contracts?.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                  Nenhuma contratação encontrada.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>

      <Dialog open={isDetailsOpen} onOpenChange={setIsDetailsOpen}>
        <DialogContent className="sm:max-w-[600px]">
          {selectedContract && (
            <>
              <DialogHeader>
                <div className="flex items-center justify-between">
                  <DialogTitle className="text-xl flex items-center gap-2">
                    <FileText className="h-5 w-5 text-primary" />
                    Detalhes da Contratação
                  </DialogTitle>
                  {getStatusBadge(selectedContract.status)}
                </div>
                <DialogDescription>
                  ID do Contrato: {selectedContract.id.split('-')[0]}...
                </DialogDescription>
              </DialogHeader>

              <div className="grid grid-cols-2 gap-6 py-4">
                <div className="space-y-4">
                  <div>
                    <h4 className="text-xs font-bold uppercase text-muted-foreground mb-1">Dados do Prospect</h4>
                    <p className="text-sm font-medium">{selectedContract.prospect?.contact_name}</p>
                    <p className="text-xs text-muted-foreground">{selectedContract.prospect?.contact_email}</p>
                    <p className="text-xs text-muted-foreground">{selectedContract.prospect?.contact_phone}</p>
                  </div>
                  <div>
                    <h4 className="text-xs font-bold uppercase text-muted-foreground mb-1">Dados para Contrato</h4>
                    <p className="text-sm">{selectedContract.contract_data?.razao_social || '—'}</p>
                    <p className="text-xs text-muted-foreground">CNPJ: {selectedContract.prospect?.cnpj || '—'}</p>
                  </div>
                </div>

                <div className="space-y-4">
                  <div>
                    <h4 className="text-xs font-bold uppercase text-muted-foreground mb-1">Itens Contratados</h4>
                    <div className="flex items-center justify-between text-sm">
                      <span>Plano: {selectedContract.plan?.nome}</span>
                      <span className="font-medium">{brl(selectedContract.plan_value)}</span>
                    </div>
                    {selectedContract.discount_value > 0 && (
                      <div className="flex items-center justify-between text-sm text-green-600">
                        <span>Desconto</span>
                        <span>-{brl(selectedContract.discount_value)}</span>
                      </div>
                    )}
                    <Separator className="my-2" />
                    <div className="flex items-center justify-between text-sm font-bold text-primary">
                      <span>Total</span>
                      <span>{brl(selectedContract.final_value)}</span>
                    </div>
                  </div>
                </div>
              </div>

              {selectedContract.processed_at && (
                <div className="bg-green-50 border border-green-200 p-3 rounded-md flex items-start gap-3">
                  <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-bold text-green-800">Contrato Processado</p>
                    <p className="text-xs text-green-700">Este contrato já gerou um cliente operacional no sistema em {format(new Date(selectedContract.processed_at), "dd/MM/yy HH:mm")}.</p>
                  </div>
                </div>
              )}

              <DialogFooter className="flex-col sm:flex-row gap-2 mt-4">
                {selectedContract.status !== 'contrato_assinado' && (
                  <div className="flex-1 flex gap-2">
                    <Select 
                      defaultValue={selectedContract.status}
                      onValueChange={(val: any) => updateMutation.mutate({ data: { id: selectedContract.id, status: val } })}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Alterar status..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="aguardando_contrato">Aguardando Contrato</SelectItem>
                        <SelectItem value="contrato_gerado">Contrato Gerado</SelectItem>
                        <SelectItem value="contrato_enviado">Contrato Enviado</SelectItem>
                        <SelectItem value="contrato_assinado">Marcar como Assinado (Gera Cliente)</SelectItem>
                        <SelectItem value="cancelado">Cancelar</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <Button variant="outline" onClick={() => setIsDetailsOpen(false)}>Fechar</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {selectedContract && (
        <ContractViewer
          prospect={selectedContract.prospect}
          isOpen={isViewerOpen}
          onOpenChange={setIsViewerOpen}
        />
      )}
    </div>
  )
}
