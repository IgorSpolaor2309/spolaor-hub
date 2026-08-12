import { createFileRoute } from '@tanstack/react-router'
import { aiAnalyzeOpening } from '../../../lib/opening-chat.server'

export const Route = createFileRoute('/api/public/test-ai')({
  server: {
    handlers: {
      GET: async () => {
        try {
          const result = await aiAnalyzeOpening("Olá, quero abrir uma hamburgueria em São Paulo. Faturamento 50k.", []);
          return new Response(JSON.stringify({ success: true, result }), {
            headers: { 'Content-Type': 'application/json' }
          });
        } catch (error: any) {
          console.error("AI Test Error:", error);
          return new Response(JSON.stringify({ 
            success: false, 
            error: error.message,
            stack: error.stack,
            cause: error.cause,
            name: error.name
          }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
          });
        }
      }
    }
  }
})
