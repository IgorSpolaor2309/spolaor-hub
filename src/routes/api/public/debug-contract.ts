import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/api/public/debug-contract')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url)
        const contractId = url.searchParams.get('id')
        
        if (!contractId) {
          return new Response(JSON.stringify({ error: 'Missing id param' }), { status: 400 })
        }

        try {
          const { supabaseAdmin } = await import('@/integrations/supabase/client.server')
          
          const { data, error } = await supabaseAdmin
            .from('generated_contracts')
            .select(`
              *,
              prospect:prospect_id (*)
            `)
            .eq('id', contractId)
            .maybeSingle()

          return new Response(JSON.stringify({ 
            contractId,
            found: !!data,
            error,
            data
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
