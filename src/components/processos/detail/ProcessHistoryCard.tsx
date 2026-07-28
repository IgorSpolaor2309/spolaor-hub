import { ListSkeleton } from "@/components/sc/Skeletons";
import { Card } from "@/components/ui/card";
import { ProcessAuditRow } from "./ProcessAuditRow";

export function ProcessHistoryCard({ history, isLoading }: { history: any[]; isLoading: boolean }) {
  return (
    <Card className="mt-3 p-2">
      <div className="border-b px-2 py-2 text-sm font-medium">
        Histórico de alterações
        <span className="ml-2 text-xs font-normal text-muted-foreground">técnico · somente administradores</span>
      </div>
      {isLoading ? <ListSkeleton rows={4} />
        : history.length === 0 ? <p className="p-3 text-sm text-muted-foreground">Sem eventos registrados.</p>
        : (
          <ul className="divide-y">
            {history.map((h: any) => (
              <ProcessAuditRow key={h.id} event={h} />
            ))}
          </ul>
        )}
    </Card>
  );
}
