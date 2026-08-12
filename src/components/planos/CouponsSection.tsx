import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, Ticket, Pencil, Trash2 } from "lucide-react";
import { format } from "date-fns";

export function CouponsSection({ canEdit }: { canEdit: boolean }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [busca, setBusca] = useState("");

  const { data: coupons = [], isLoading } = useQuery({
    queryKey: ["coupons"],
    queryFn: async () => {
      const { data, error } = await supabase.from("coupons").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const filtered = useMemo(() => {
    const t = busca.toLowerCase();
    return coupons.filter(c => c.code.toLowerCase().includes(t) || (c.name || "").toLowerCase().includes(t));
  }, [coupons, busca]);

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("coupons").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Cupom removido");
      qc.invalidateQueries({ queryKey: ["coupons"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-end gap-2">
        <div className="flex-1 max-w-sm space-y-1.5">
          <Label>Buscar cupom</Label>
          <Input placeholder="Código ou nome" value={busca} onChange={(e) => setBusca(e.target.value)} />
        </div>
        {canEdit && (
          <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setEditing(null); }}>
            <DialogTrigger asChild>
              <Button><Plus className="mr-2 h-4 w-4" /> Novo Cupom</Button>
            </DialogTrigger>
            {open && <CouponDialog initial={editing} onDone={() => { setOpen(false); setEditing(null); qc.invalidateQueries({ queryKey: ["coupons"] }); }} />}
          </Dialog>
        )}
      </div>

      <Card className="p-0 overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-muted-foreground">Carregando...</div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center flex flex-col items-center gap-2">
            <Ticket className="h-10 w-10 text-muted-foreground/30" />
            <h3 className="font-medium text-lg">Nenhum cupom encontrado</h3>
            <p className="text-sm text-muted-foreground">Crie seu primeiro cupom para oferecer descontos.</p>
          </div>
        ) : (
          <div className="divide-y">
            {filtered.map(c => (
              <div key={c.id} className="p-4 flex items-center justify-between group hover:bg-muted/30 transition-colors">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-lg text-primary">{c.code}</span>
                    <Badge variant={c.status === 'active' ? 'default' : 'secondary'}>
                      {c.status === 'active' ? 'Ativo' : 'Inativo'}
                    </Badge>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {c.name || "Sem nome"} • {c.discount_type === 'percentage' ? `${c.discount_value}%` : `R$ ${c.discount_value}`} de desconto
                  </div>
                </div>

                <div className="flex items-center gap-2">
                   {canEdit && (
                     <>
                        <Button size="icon" variant="ghost" onClick={() => { setEditing(c); setOpen(true); }}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button size="icon" variant="ghost" className="text-destructive" onClick={() => { if(confirm("Remover cupom?")) deleteMutation.mutate(c.id); }}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                     </>
                   )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function CouponDialog({ initial, onDone }: { initial: any; onDone: () => void }) {
  const [f, setF] = useState({
    code: initial?.code ?? "",
    name: initial?.name ?? "",
    discount_type: initial?.discount_type ?? "percentage",
    discount_value: initial?.discount_value ?? "",
    max_discount: initial?.max_discount ?? "",
    status: initial?.status ?? "active",
    apply_to: initial?.apply_to ?? "all"
  });

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        ...f,
        discount_value: Number(f.discount_value),
        max_discount: f.max_discount ? Number(f.max_discount) : null
      };
      if (initial) {
        const { error } = await supabase.from("coupons").update(payload).eq("id", initial.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("coupons").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => { 
      toast.success(initial ? "Cupom atualizado" : "Cupom criado");
      onDone();
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <DialogContent className="max-w-md">
      <DialogHeader><DialogTitle>{initial ? "Editar Cupom" : "Novo Cupom"}</DialogTitle></DialogHeader>
      <div className="grid gap-4 py-4">
        <div className="space-y-1.5">
          <Label>Código (identificador único)</Label>
          <Input value={f.code} onChange={e => setF({ ...f, code: e.target.value.toUpperCase() })} placeholder="EX: BEMVINDO20" />
        </div>
        <div className="space-y-1.5">
          <Label>Nome interno</Label>
          <Input value={f.name} onChange={e => setF({ ...f, name: e.target.value })} placeholder="Campanha de Verão" />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>Tipo de Desconto</Label>
            <Select value={f.discount_type} onValueChange={v => setF({ ...f, discount_type: v as any })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="percentage">Percentual (%)</SelectItem>
                <SelectItem value="fixed">Fixo (R$)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Valor</Label>
            <Input type="number" value={f.discount_value} onChange={e => setF({ ...f, discount_value: e.target.value })} />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Teto de desconto (opcional para %)</Label>
          <Input type="number" value={f.max_discount} onChange={e => setF({ ...f, max_discount: e.target.value })} />
        </div>
        <div className="space-y-1.5">
          <Label>Situação</Label>
          <Select value={f.status} onValueChange={v => setF({ ...f, status: v as any })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Ativo</SelectItem>
              <SelectItem value="inactive">Inativo</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <DialogFooter>
        <Button disabled={!f.code || !f.discount_value || save.isPending} onClick={() => save.mutate()}>
          {save.isPending ? "Salvando..." : "Salvar"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
