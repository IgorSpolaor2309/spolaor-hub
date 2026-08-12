import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/api/public/debug-ai')({
  server: {
    handlers: {
      GET: async () => {
        const apiKey = process.env.OPENAI_API_KEY;
        const exists = !!apiKey;
        const length = apiKey?.length || 0;
        const prefix = apiKey ? apiKey.substring(0, 7) : 'none';
        
        return new Response(JSON.stringify({ 
          exists, 
          length, 
          prefix,
          NODE_ENV: process.env.NODE_ENV,
          VER: '1'
        }), {
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }
  }
})
