import { Bell } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/use-current-user";

export function AppHeader() {
  const { profile, userId, loading } = useCurrentUser();
  const { data: unread = 0 } = useQuery({
    queryKey: ["notif-unread", userId],
    enabled: !loading && !!userId,
    retry: 1,
    queryFn: async () => {
      const { count, error } = await supabase
        .from("notifications").select("id", { count: "exact", head: true })
        .eq("user_id", userId!).eq("lida", false);
      if (error) {
        console.warn("[notifications] unread:", error.message);
        return 0;
      }
      return count ?? 0;
    },
    refetchInterval: 30_000,
  });

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b bg-card px-4">
      <SidebarTrigger className="-ml-1" />
      <div className="flex-1" />
      <Link
        to="/notificacoes"
        className="relative inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground"
        aria-label="Notificações"
      >
        <Bell className="h-4 w-4" />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-warning px-1 text-[10px] font-bold text-warning-foreground">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </Link>
      <div className="flex items-center gap-2 pl-2">
        <div className="hidden text-right text-sm leading-tight sm:block">
          <div className="font-medium">{profile?.full_name || "Usuário"}</div>
          <div className="text-xs text-muted-foreground">{profile?.email}</div>
        </div>
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
          {(profile?.full_name || profile?.email || "U").charAt(0).toUpperCase()}
        </div>
      </div>
    </header>
  );
}
