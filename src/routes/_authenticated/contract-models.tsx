import { useState } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { 
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow 
} from '@/components/ui/table';
import { 
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter 
} from '@/components/ui/dialog';
import { 
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue 
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  Plus, Save, FileText, History, CheckCircle2, AlertTriangle, Edit3, Eye
} from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { getContractModels, saveContractModel } from '@/lib/contracts-management.functions';

export const Route = createFileRoute('/_authenticated/contract-models')({
  component: ContractModelsPage
});

function ContractModelsPage() {
  const queryClient = useQueryClient();
  const [selectedModel, setSelectedModel] = useState<any>(null);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  
  const getModelsFn = useServerFn(getContractModels);
  const saveModelFn = useServerFn(saveContractModel);

  const { data: models = [], isLoading } = useQuery({
    queryKey: ['contract-models'],
    queryFn: () => getModelsFn()
  });

  const saveMutation = useMutation({
    mutationFn: (data: any) => saveModelFn({ data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contract-models'] });
      toast.success("Modelo salvo com sucesso");
      setIsEditorOpen(false);
    },
    onError: (err: any) => toast.error(`Erro ao salvar: ${err.message}`)
  });

  const [formData, setFormData] = useState<any>({
    name: '',
    status: 'rascunho',
    content: '',
    internal_notes: '',
    version: 1
  });

  const handleEdit = (model: any) => {
    setSelectedModel(model);
    setFormData({
      id: model.id,
      name: model.name,
      status: model.status,
      content: model.content,
      internal_notes: model.internal_notes,
      version: model.version
    });
    setIsEditorOpen(true);
  };

  const handleNewVersion = (model: any) => {
    setSelectedModel(null);
    setFormData({
      name: model.name,
      status: 'rascunho',
      content: model.content,
      internal_notes: `Baseado na v${model.version}`,
      version: model.version + 1
    });
    setIsEditorOpen(true);
  };

  const PLACEHOLDERS = [
    "{{razao_social}}", "{{cnpj}}", "{{email}}", "{{telefone}}",
    "{{plano}}", "{{valor_mensal}}", "{{valor_implantacao}}",
    "{{servicos_incluidos}}", "{{servicos_extras}}", "{{descontos}}",
    "{{condicoes_especiais}}", "{{data_contratacao}}"
  ];

  return (
    <div className="container py-8 space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-display font-bold">Modelos de Contrato</h1>
          <p className="text-muted-foreground">Gerencie as versões oficiais dos contratos da Digital SC.</p>
        </div>
        <Button onClick={() => {
          setSelectedModel(null);
          setFormData({ name: '', status: 'rascunho', content: '', internal_notes: '', version: 1 });
          setIsEditorOpen(true);
        }}>
          <Plus className="mr-2 h-4 w-4" /> Novo Modelo
        </Button>
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Versão</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Última Alteração</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {models.map((model: any) => (
              <TableRow key={model.id}>
                <TableCell className="font-medium">{model.name}</TableCell>
                <TableCell>v{model.version}</TableCell>
                <TableCell>
                  <Badge variant={model.status === 'ativo' ? 'default' : 'secondary'}>
                    {model.status.toUpperCase()}
                  </Badge>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {format(new Date(model.updated_at), "dd/MM/yy HH:mm", { locale: ptBR })}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    <Button variant="ghost" size="sm" onClick={() => handleEdit(model)}>
                      <Edit3 className="h-4 w-4" />
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => handleNewVersion(model)}>
                      <History className="mr-2 h-4 w-4" /> Nova Versão
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <Dialog open={isEditorOpen} onOpenChange={setIsEditorOpen}>
        <DialogContent className="max-w-6xl max-h-[90vh] flex flex-col p-0 overflow-hidden">
          <DialogHeader className="p-6 border-b">
            <DialogTitle>{formData.id ? 'Editar Modelo' : 'Novo Modelo'} - Versão {formData.version}</DialogTitle>
            <DialogDescription>
              Utilize os placeholders disponíveis para preenchimento automático.
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 flex overflow-hidden">
            {/* Editor Side */}
            <div className="flex-1 p-6 space-y-4 overflow-y-auto">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase text-muted-foreground">Nome do Modelo</label>
                  <Input 
                    value={formData.name} 
                    onChange={e => setFormData({...formData, name: e.target.value})}
                    placeholder="Ex: Contrato de Prestação de Serviços Contábeis"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase text-muted-foreground">Status</label>
                  <Select 
                    value={formData.status}
                    onValueChange={val => setFormData({...formData, status: val})}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="rascunho">Rascunho</SelectItem>
                      <SelectItem value="ativo">Ativo (Novos contratos usarão este)</SelectItem>
                      <SelectItem value="inativo">Inativo</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold uppercase text-muted-foreground">Conteúdo do Contrato (Markdown/Texto)</label>
                <Textarea 
                  className="min-h-[400px] font-mono text-xs leading-relaxed"
                  value={formData.content}
                  onChange={e => setFormData({...formData, content: e.target.value})}
                  placeholder="Cole aqui o texto completo do contrato..."
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold uppercase text-muted-foreground">Notas Internas</label>
                <Input 
                  value={formData.internal_notes || ''} 
                  onChange={e => setFormData({...formData, internal_notes: e.target.value})}
                  placeholder="Motivo da alteração ou observações..."
                />
              </div>
            </div>

            {/* Help Side */}
            <div className="w-64 border-l bg-slate-50 p-6 space-y-6">
              <div>
                <h4 className="text-xs font-bold uppercase text-muted-foreground mb-4">Placeholders</h4>
                <div className="space-y-2">
                  {PLACEHOLDERS.map(p => (
                    <code 
                      key={p} 
                      className="block text-[10px] p-1 bg-white border rounded cursor-pointer hover:border-primary transition-colors"
                      onClick={() => {
                        const textarea = document.querySelector('textarea');
                        if (textarea) {
                          const start = textarea.selectionStart;
                          const end = textarea.selectionEnd;
                          const text = formData.content;
                          const before = text.substring(0, start);
                          const after = text.substring(end, text.length);
                          setFormData({...formData, content: before + p + after});
                        }
                      }}
                    >
                      {p}
                    </code>
                  ))}
                </div>
              </div>
              
              <div className="p-3 bg-amber-50 border border-amber-200 rounded text-[10px] text-amber-800 space-y-2">
                <div className="flex items-center gap-1 font-bold">
                  <AlertTriangle className="h-3 w-3" /> Atenção
                </div>
                <p>Ao ativar um modelo, todos os outros do mesmo tipo serão inativados automaticamente.</p>
                <p>Contratos já gerados não serão alterados.</p>
              </div>
            </div>
          </div>

          <DialogFooter className="p-6 border-t bg-slate-50/50">
            <Button variant="ghost" onClick={() => setIsEditorOpen(false)}>Cancelar</Button>
            <Button onClick={() => saveMutation.mutate(formData)} disabled={saveMutation.isPending}>
              <Save className="mr-2 h-4 w-4" /> Salvar Modelo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
