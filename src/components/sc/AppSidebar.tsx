import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import {
  LayoutDashboard, Users, UserCog, ClipboardList, FileText, MessageSquare,
  Bell, Settings, LogOut, Briefcase, History, Inbox, CalendarClock, Receipt,
  KanbanSquare, Workflow, ListChecks,
} from "lucide-react";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarHeader, SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar";
import { SpolaorLogo } from "@/components/sc/Logo";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/use-current-user";
import type { AppRole } from "@/lib/sc-types";

type Item = { to: string; label: string; icon: React.ComponentType<{ className?: string }>; roles: AppRole[] };
type Section = { title: string; items: Item[] };

// Ordem e agrupamento seguem a especificação de reorganização (administração
// vive dentro de /configuracoes; itens duplicados foram consolidados).
const SECTIONS: Section[] = [
  {
    title: "Visão geral",
    items: [
      { to: "/", label: "Dashboard", icon: LayoutDashboard, roles: ["admin", "collaborator", "client"] },
      { to: "/clientes", label: "Minhas empresas", icon: Briefcase, roles: ["collaborator"] },
    ],
  },
  {
    title: "Gestão",
    items: [
      { to: "/clientes", label: "Empresas cadastradas", icon: Users, roles: ["admin"] },
      { to: "/colaboradores", label: "Colaboradores", icon: UserCog, roles: ["admin"] },
    ],
  },
  {
    title: "Operação",
    items: [
      { to: "/pendencias", label: "Pendências", icon: ClipboardList, roles: ["admin", "collaborator"] },
      { to: "/checklist", label: "Checklist do Cliente", icon: ListChecks, roles: ["admin", "collaborator"] },
      { to: "/processos", label: "Processos", icon: Workflow, roles: ["admin", "collaborator"] },
      { to: "/kanban", label: "Kanban", icon: KanbanSquare, roles: ["admin", "collaborator"] },
      { to: "/documentos", label: "Documentos", icon: FileText, roles: ["admin", "collaborator"] },
      { to: "/solicitacoes", label: "Solicitações", icon: Inbox, roles: ["admin", "collaborator", "client"] },
      { to: "/validades", label: "Validades", icon: CalendarClock, roles: ["admin", "collaborator"] },
      { to: "/guias", label: "Guias e impostos", icon: Receipt, roles: ["admin", "collaborator", "client"] },
      { to: "/interacoes", label: "Interações", icon: MessageSquare, roles: ["admin", "collaborator", "client"] },
    ],
  },
  {
    title: "Portal do cliente",
    items: [
      { to: "/minha-area", label: "Minha área", icon: Briefcase, roles: ["client"] },
      { to: "/portal-processos", label: "Processos", icon: Workflow, roles: ["client"] },
      { to: "/minhas-pendencias", label: "Minhas pendências", icon: ClipboardList, roles: ["client"] },
      { to: "/meus-documentos", label: "Meus documentos", icon: FileText, roles: ["client"] },
      { to: "/historico", label: "Histórico", icon: History, roles: ["client"] },
    ],
  },
  {
    title: "Avisos",
    items: [
      { to: "/notificacoes", label: "Notificações", icon: Bell, roles: ["admin", "collaborator", "client"] },
    ],
  },
  {
    title: "Administração",
    items: [
      { to: "/configuracoes", label: "Configurações", icon: Settings, roles: ["admin"] },
    ],
  },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { role, profile } = useCurrentUser();
  const navigate = useNavigate();

  const sections = SECTIONS
    .map((section) => ({
      ...section,
      items: section.items.filter((i) => role && i.roles.includes(role)),
    }))
    .filter((section) => section.items.length > 0);

  const signOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  };

  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border">
      <SidebarHeader className="border-b border-sidebar-border">
        <div className="flex items-center gap-3 px-2 py-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-white">
            <SpolaorLogo className="h-8 w-8 object-contain" />
          </div>
          {!collapsed && (
            <div className="min-w-0">
              <div className="font-display text-base leading-tight text-sidebar-foreground">SC Central</div>
              <div className="truncate text-[11px] text-sidebar-foreground/70">Spolaor Company</div>
            </div>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent>
        {sections.map((section) => (
          <SidebarGroup key={section.title}>
            {!collapsed && (
              <SidebarGroupLabel className="text-sidebar-foreground/60">
                {section.title}
              </SidebarGroupLabel>
            )}
            <SidebarGroupContent>
              <SidebarMenu>
                {section.items.map((item) => {
                  const active = pathname === item.to || (item.to !== "/" && pathname.startsWith(item.to));
                  return (
                    <SidebarMenuItem key={item.to + item.label}>
                      <SidebarMenuButton asChild isActive={active} tooltip={item.label}>
                        <Link to={item.to} className="flex items-center gap-3">
                          <item.icon className="h-4 w-4" />
                          {!collapsed && <span>{item.label}</span>}
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border">
        <div className="flex items-center gap-2 px-2 py-2">
          {!collapsed && (
            <div className="min-w-0 flex-1">
              <div className="truncate text-xs font-medium text-sidebar-foreground">
                {profile?.full_name || profile?.email || "Usuário"}
              </div>
              <div className="truncate text-[10px] uppercase tracking-wide text-sidebar-foreground/60">
                {role === "client" ? "CLIENTE" : role === "admin" ? "ADMINISTRADOR" : role === "collaborator" ? "COLABORADOR" : (role ?? "—")}
              </div>
            </div>
          )}
          <button
            onClick={signOut}
            title="Sair"
            className="rounded-md p-2 text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
