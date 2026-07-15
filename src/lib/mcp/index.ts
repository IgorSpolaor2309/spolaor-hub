import { auth, defineMcp } from "@lovable.dev/mcp-js";
import whoamiTool from "./tools/whoami";
import listProcessesTool from "./tools/list-processes";
import listPendingTasksTool from "./tools/list-pending-tasks";
import listClientsTool from "./tools/list-clients";

// The OAuth issuer MUST be the direct Supabase host, not the .lovable.cloud proxy.
// VITE_SUPABASE_PROJECT_ID is inlined at build time by Vite.
const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "sc-central-mcp",
  title: "SC Central",
  version: "0.1.0",
  instructions:
    "Ferramentas do SC Central (Spolaor Company). Cada chamada roda como o usuário autenticado, respeitando papel (admin, colaborador, cliente) e políticas de acesso.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [whoamiTool, listClientsTool, listProcessesTool, listPendingTasksTool],
});
