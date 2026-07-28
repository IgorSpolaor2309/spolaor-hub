import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { WorkspaceCounts, WorkspaceTab } from "@/lib/documentos/workspace-types";
import { WORKSPACE_TABS } from "@/lib/documentos/workspace-types";

type Props = {
  value: WorkspaceTab;
  onChange: (tab: WorkspaceTab) => void;
  counts: WorkspaceCounts | undefined;
  needToRequestCount: number | undefined;
};

function countFor(tab: WorkspaceTab, counts: WorkspaceCounts | undefined, needToRequest: number | undefined): number | undefined {
  if (!counts && tab !== "precisa_solicitar") return undefined;
  switch (tab) {
    case "precisa_solicitar":   return needToRequest;
    case "aguardando_cliente":  return counts?.aguardando_cliente;
    case "recebidos":           return counts?.recebidos;
    case "reenviar":            return counts?.reenviar;
    case "concluidos":          return counts?.concluidos;
    case "vinculados":          return counts?.vinculados;
    case "vencendo":            return counts?.vencendo;
    case "vencidos":            return counts?.vencidos;
    case "todos":               return counts?.todos;
    default:                    return undefined;
  }
}

export function DocumentWorkspaceTabs({ value, onChange, counts, needToRequestCount }: Props) {
  return (
    <Tabs value={value} onValueChange={(v) => onChange(v as WorkspaceTab)}>
      <TabsList className="flex flex-wrap h-auto">
        {WORKSPACE_TABS.map((t) => {
          const n = countFor(t.value, counts, needToRequestCount);
          return (
            <TabsTrigger key={t.value} value={t.value} className="gap-2">
              {t.label}
              {typeof n === "number" && (
                <Badge variant="secondary" className="ml-1">{n}</Badge>
              )}
            </TabsTrigger>
          );
        })}
      </TabsList>
    </Tabs>
  );
}

export function DocumentWorkspaceTabsMobile({ value, onChange, counts, needToRequestCount }: Props) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-1">
      {WORKSPACE_TABS.map((t) => {
        const n = countFor(t.value, counts, needToRequestCount);
        const active = t.value === value;
        return (
          <Button
            key={t.value}
            variant={active ? "default" : "outline"}
            size="sm"
            onClick={() => onChange(t.value)}
            className="whitespace-nowrap"
          >
            {t.label}
            {typeof n === "number" && (
              <Badge variant="secondary" className="ml-2">{n}</Badge>
            )}
          </Button>
        );
      })}
    </div>
  );
}
