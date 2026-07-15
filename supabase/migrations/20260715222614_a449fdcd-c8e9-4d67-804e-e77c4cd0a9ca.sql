CREATE TABLE public.mcp_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  user_email text,
  tool_name text NOT NULL,
  success boolean NOT NULL,
  result_count integer,
  duration_ms integer NOT NULL,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_mcp_audit_log_created_at ON public.mcp_audit_log(created_at DESC);
CREATE INDEX idx_mcp_audit_log_user_id ON public.mcp_audit_log(user_id);
CREATE INDEX idx_mcp_audit_log_tool_name ON public.mcp_audit_log(tool_name);

GRANT SELECT ON public.mcp_audit_log TO authenticated;
GRANT ALL ON public.mcp_audit_log TO service_role;

ALTER TABLE public.mcp_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read MCP audit log"
  ON public.mcp_audit_log
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));