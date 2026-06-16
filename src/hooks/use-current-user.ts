import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { AppRole } from "@/lib/sc-types";

export function useCurrentUser() {
  const [userId, setUserId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUserId(data.user?.id ?? null);
      setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setUserId(session?.user?.id ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const profileQuery = useQuery({
    queryKey: ["me-profile", userId],
    enabled: !!userId,
    queryFn: async () => {
      const [{ data: profile }, { data: roles }] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", userId!).maybeSingle(),
        supabase.from("user_roles").select("role").eq("user_id", userId!),
      ]);
      const roleList = (roles ?? []).map((r) => r.role as AppRole);
      const role: AppRole | null =
        roleList.includes("admin") ? "admin" :
        roleList.includes("collaborator") ? "collaborator" :
        roleList.includes("client") ? "client" :
        null;
      return { profile, role, roles: roleList };
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

