import { ListSkeleton } from "@/components/sc/Skeletons";
import { Card } from "@/components/ui/card";
import {
  getTimelineLabel,
  getTimelineIcon,
  isTimelineVisible,
} from "@/lib/processo-timeline-labels";

export function ProcessTimelineSection({ history, isLoading }: { history: any[]; isLoading: boolean }) {
  const visible = history.filter((e: any) => isTimelineVisible(e.tipo, "staff"));
  return (
    <Card className="p-4">
      <div className="mb-2 text-sm font-medium">Timeline</div>
      {isLoading ? <ListSkeleton rows={4} />
        : visible.length === 0
          ? <p className="text-xs text-muted-foreground">Nenhum evento registrado.</p>
          : (
            <ol className="relative space-y-3 border-l pl-4">
              {visible.slice(0, 30).map((e: any) => {
                const Icon = getTimelineIcon(e.tipo);
                return (
                  <li key={e.id} className="relative">
                    <span className="absolute -left-[11px] top-0.5 flex h-4 w-4 items-center justify-center rounded-full border bg-background">
                      <Icon className="h-2.5 w-2.5" />
                    </span>
                    <div className="text-xs font-medium">{getTimelineLabel(e, "staff")}</div>
                    <div className="text-[11px] text-muted-foreground">
                      {new Date(e.created_at).toLocaleString("pt-BR")} · {e.actor_name ?? "sistema"}
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
    </Card>
  );
}
