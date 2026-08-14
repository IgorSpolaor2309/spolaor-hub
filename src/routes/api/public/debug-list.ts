import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/api/public/debug-list')({
  server: {
    handlers: {
      GET: async () => {
        try {
          const { supabaseAdmin } = await import('@/integrations/supabase/client.server')
          const { data, error } = await supabaseAdmin.from('generated_contracts').select('id, status').limit(5)
          return new Response(JSON.stringify({ data, error }, null, 2), {
            headers: { 'Content-Type': 'application/json' }
          })
        } catch (err: any) {
          return new Response(err.message, { status: 500 })
        }
      }
    }
  }
})
