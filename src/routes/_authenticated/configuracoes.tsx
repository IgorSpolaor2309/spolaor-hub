import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/sc/PageHeader";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/configuracoes")({
  component: SettingsPage,
});

function SettingsPage() {
  const qc = useQueryClient();
  const { data: profiles = [] } = useQuery({
    queryKey: ["all-profiles-roles"],
    queryFn: async () => {
      const [p, r] = await Promise.all([
        supabase.from("profiles").select("id, full_name, email"),
        supabase.from("user_roles").select("user_id, role"),
      ]);
      const map = new Map<string, string[]>();
      (r.data ?? []).forEach((row) => {
        const arr = map.get(row.user_id) ?? [];
        arr.push(row.role); map.set(row.user_id, arr);
      });
      return (p.data ?? []).map((u) => ({ ...u, roles: map.get(u.id) ?? [] }));
    },
  });

  const setRole = useMutation({
    mutationFn: async ({ user_id, role }: { user_id: string; role: "admin" | "collaborator" | "client" }) => {
      await supabase.from("user_roles").delete().eq("user_id", user_id);
      const { error } = await supabase.from("user_roles").insert({ user_id, role });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Papel atualizado"); qc.invalidateQueries({ queryKey: ["all-profiles-roles"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div>
      <PageHeader title="Configurações" description="Gerenciamento de usuários e perfis de acesso." />
      <Card className="p-5">
        <h3 className="font-display text-lg">Usuários e perfis</h3>
        <p className="mb-4 text-sm text-muted-foreground">
          Defina o papel de cada usuário cadastrado. Usuários novos devem criar conta em <code>/auth</code> primeiro.
        </p>
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase text-muted-foreground">
            <tr className="border-b"><th className="py-2 pr-4">Nome</th><th>E-mail</th><th>Papel</th></tr>
          </thead>
          <tbody>
            {profiles.map((u: any) => (
              <tr key={u.id} className="border-b">
                <td className="py-3 pr-4">{u.full_name || "—"}</td>
                <td>{u.email}</td>
                <td>
                  <Select
                    value={u.roles[0] ?? "client"}
                    onValueChange={(v) => setRole.mutate({ user_id: u.id, role: v as any })}
                  >
                    <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="admin">Administrador</SelectItem>
                      <SelectItem value="collaborator">Colaborador</SelectItem>
                      <SelectItem value="client">Cliente</SelectItem>
                    </SelectContent>
                  </Select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Card className="mt-6 p-5">
        <h3 className="font-display text-lg">Integrações futuras</h3>
        <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
          <li>· Integração com a API do OMIE — estrutura preparada (campos <code>omie_id</code>, <code>origem_cadastro</code>, <code>data_ultima_sincronizacao</code>).</li>
          <li>· Recursos de IA — arquitetura pronta para classificação, resumos e assistente interno.</li>
        </ul>
      </Card>
    </div>
  );
}
