import { useEffect, useRef } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/use-current-user";
import {
  bannerKey, isSafeInternalLink, shouldShowBanner,
  type NotificationEvent, type NotificationRow,
} from "@/lib/notification-banner";

/** Tempo de exibição do aviso (ms) — dentro da faixa de 6 a 10 segundos. */
const BANNER_DURATION_MS = 8000;
/** Limite do cache de deduplicação em memória (nada é persistido). */
const DEDUPE_LIMIT = 200;

/**
 * Fase E2.5 — assinatura Realtime única de notificações do usuário autenticado.
 *
 * Montado uma única vez no layout autenticado. Não cria central paralela:
 * apenas reaproveita o toast (sonner) já usado pelo SC Central e invalida as
 * query keys existentes do sino e da página /notificacoes.
 */
export function NotificationBanners() {
  const { userId } = useCurrentUser();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const seen = useRef<Set<string>>(new Set());
  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;

  useEffect(() => {
    if (!userId) return;
    seen.current.clear();

    const channel = supabase
      .channel(`notifications-user-${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` },
        (payload) => {
          // O sino e a Central sempre acompanham qualquer alteração.
          qc.invalidateQueries({ queryKey: ["notif-unread", userId] });
          qc.invalidateQueries({ queryKey: ["notif", userId] });

          const event = {
            eventType: payload.eventType as NotificationEvent["eventType"],
            new: (payload.new ?? null) as Partial<NotificationRow> | null,
            old: (payload.old ?? null) as Partial<NotificationRow> | null,
          };
          if (!shouldShowBanner(event, userId)) return;

          const row = event.new!;
          const key = bannerKey(row);
          if (seen.current.has(key)) return;
          if (seen.current.size >= DEDUPE_LIMIT) seen.current.clear();
          seen.current.add(key);

          const link = row.link ?? null;
          const canOpen = isSafeInternalLink(link);
          toast(row.titulo ?? "Nova notificação", {
            description: row.mensagem ?? undefined,
            duration: BANNER_DURATION_MS,
            closeButton: true,
            action: canOpen
              ? {
                  label: "Abrir",
                  onClick: () => { navigateRef.current({ to: link! }); },
                }
              : undefined,
          });
        },
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [userId, qc]);

  return null;
}
