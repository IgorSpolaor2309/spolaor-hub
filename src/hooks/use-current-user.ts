import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { AppRole } from "@/lib/sc-types";

export function useCurrentUser() {
  const [userId, setUserId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let mounted = true;
    // Sessão é lida do localStorage — síncrono e estável.
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setUserId(data.session?.user?.id ?? null);
      setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (!mounted) return;
      setUserId(session?.user?.id ?? null);
    });
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const profileQuery = useQuery({
    queryKey: ["me-profile", userId],
    enabled: !!userId,
    retry: 1,
    staleTime: 30_000,
    queryFn: async () => {
      try {
        const [{ data: profile, error: pErr }, { data: roles, error: rErr }] = await Promise.all([
          supabase.from("profiles").select("*").eq("id", userId!).maybeSingle(),
          supabase.from("user_roles").select("role").eq("user_id", userId!),
        ]);
        // Erros de RLS / rede aqui NUNCA devem derrubar a aplicação.
        if (pErr) console.warn("[useCurrentUser] profile:", pErr.message);
        if (rErr) console.warn("[useCurrentUser] roles:", rErr.message);

        const roleList = (roles ?? []).map((r) => r.role as AppRole);
        const role: AppRole | null =
          roleList.includes("admin") ? "admin" :
          roleList.includes("collaborator") ? "collaborator" :
          roleList.includes("client") ? "client" :
          null;
        return { profile: profile ?? null, role, roles: roleList };
      } catch (err) {
        console.warn("[useCurrentUser] inesperado:", err);
        return { profile: null, role: null as AppRole | null, roles: [] as AppRole[] };
      }
    },
  });

  return {
    userId,
    ready,
    profile: profileQuery.data?.profile ?? null,
    role: profileQuery.data?.role ?? null,
    hasRole: !!profileQuery.data?.role,
    mustChangePassword: !!profileQuery.data?.profile?.must_change_password,
    loading: !ready || (!!userId && profileQuery.isLoading),
    refetch: profileQuery.refetch,
  };
}
