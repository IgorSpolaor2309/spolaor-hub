import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/api/public/check-auth')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        return new Response(JSON.stringify({
          env_keys: {
            VITE_SUPABASE_URL: !!process.env.VITE_SUPABASE_URL,
            VITE_SUPABASE_ANON_KEY: !!process.env.VITE_SUPABASE_ANON_KEY,
            SB_SECRET_SERVICE_ROLE_KEY: !!process.env.SB_SECRET_SERVICE_ROLE_KEY
          }
        }, null, 2), {
          headers: { 'Content-Type': 'application/json' }
        })
      }
    }
  }
})
