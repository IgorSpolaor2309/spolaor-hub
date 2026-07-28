/**
 * Skeletons padronizados do módulo Processos (e de qualquer tela consumidora).
 *
 * Não altera layout global — cada preset devolve blocos com dimensões
 * aproximadas à área real, para evitar salto visual quando o conteúdo carrega.
 */
import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";

export function ListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <ul className="divide-y">
      {Array.from({ length: rows }).map((_, i) => (
        <li key={i} className="p-3">
          <div className="flex flex-wrap items-center gap-2">
            <Skeleton className="h-3 w-3 rounded-full" />
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-20" />
            <Skeleton className="ml-auto h-4 w-16" />
          </div>
          <div className="mt-2 flex items-center gap-2">
            <Skeleton className="h-1.5 w-full" />
            <Skeleton className="h-3 w-10" />
          </div>
        </li>
      ))}
    </ul>
  );
}

export function CardSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="grid gap-3">
      {Array.from({ length: count }).map((_, i) => (
        <Card key={i} className="p-4">
          <div className="flex flex-wrap items-center gap-2">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-4 w-24" />
          </div>
          <Skeleton className="mt-3 h-3 w-2/3" />
          <Skeleton className="mt-3 h-2 w-full" />
        </Card>
      ))}
    </div>
  );
}

export function TableSkeleton({ rows = 6, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex gap-3">
          {Array.from({ length: cols }).map((_, c) => (
            <Skeleton
              key={c}
              className={`h-4 ${c === 0 ? "w-48" : "w-24"}`}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

export function DetailSkeleton() {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Skeleton className="h-6 w-56" />
        <Skeleton className="h-4 w-20" />
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        <Card className="p-4 md:col-span-2">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <Skeleton className="h-5 w-24" />
            <Skeleton className="h-5 w-16" />
            <Skeleton className="h-4 w-32" />
          </div>
          <Skeleton className="mb-4 h-2 w-full" />
          <div className="grid gap-3 sm:grid-cols-2">
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
          </div>
        </Card>
        <Card className="p-4">
          <Skeleton className="mb-3 h-4 w-24" />
          <div className="space-y-2">
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-4/5" />
            <Skeleton className="h-3 w-3/5" />
          </div>
        </Card>
      </div>
      <Card className="p-2">
        <Skeleton className="m-2 h-4 w-24" />
        <ListSkeleton rows={4} />
      </Card>
    </div>
  );
}

/** Placeholder inline para trocar textos "Carregando…" isolados. */
export function InlineLoading({ label = "Carregando" }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 p-2 text-xs text-muted-foreground">
      <Skeleton className="h-3 w-3 rounded-full" />
      <Skeleton className="h-3 w-24" />
      <span className="sr-only">{label}</span>
    </div>
  );
}
