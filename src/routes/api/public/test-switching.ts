import { createFileRoute } from '@tanstack/react-router'
import { aiAnalyzeSwitching } from '../../../lib/switching-chat.server'

export const Route = createFileRoute('/api/public/test-switching')({
  server: {
    handlers: {
      GET: async () => {
        try {
          const result = await aiAnalyzeSwitching("Olá, meu CNPJ é 12.345.678/0001-90, quero trocar pois o atendimento está ruim. Faturamento 20k.", []);
          return new Response(JSON.stringify({ success: true, result }), {
            headers: { 'Content-Type': 'application/json' }
          });
        } catch (error: any) {
          return new Response(JSON.stringify({ success: false, error: error.message }), { status: 500 });
        }
      }
    }
  }
})
