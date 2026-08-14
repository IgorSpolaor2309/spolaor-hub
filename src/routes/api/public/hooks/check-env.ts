import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/api/public/hooks/check-env')({
  server: {
    handlers: {
      GET: async () => {
        return new Response(JSON.stringify({
          SUPABASE_URL: !!process.env.SUPABASE_URL,
          SUPABASE_SERVICE_ROLE_KEY: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
          VITE_SUPABASE_URL: !!process.env.VITE_SUPABASE_URL,
          SB_SECRET_SERVICE_ROLE_KEY: !!process.env.SB_SECRET_SERVICE_ROLE_KEY
        }, null, 2), {
          headers: { 'Content-Type': 'application/json' }
        })
      }
    }
  }
})
