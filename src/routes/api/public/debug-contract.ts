import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/api/public/debug-contract')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url)
        
        try {
          const { supabaseAdmin } = await import('@/integrations/supabase/client.server')
          
          const { data, error } = await supabaseAdmin
            .from('generated_contracts')
            .select('*')
            .limit(5)

          return new Response(JSON.stringify({ 
            contracts: data,
            error,
            env: {
                SUPABASE_URL: !!process.env.VITE_SUPABASE_URL,
                SB_KEY: !!process.env.SB_SECRET_SERVICE_ROLE_KEY
            }
          }, null, 2), {
            headers: { 'Content-Type': 'application/json' }
          })
        } catch (err: any) {
          return new Response(JSON.stringify({ error: err.message, stack: err.stack }), { status: 500 })
        }
      }
    }
  }
})

