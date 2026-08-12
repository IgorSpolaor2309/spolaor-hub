import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Loader2, Send, MessageSquare } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { processOpeningMessage } from "@/lib/opening-chat.functions";

export function OpeningChatFlow() {
  const [messages, setMessages] = useState<{role: 'user' | 'ai', content: string}[]>([
    { role: 'ai', content: "Olá! Sou o assistente da Digital SC. Me conte um pouco sobre o negócio que você pretende abrir." }
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const processMessage = useServerFn(processOpeningMessage);

  const sendMessage = async () => {
    if (!input.trim()) return;
    
    setLoading(true);
    const userMsg = input;
    setMessages(prev => [...prev, { role: 'user', content: userMsg }]);
    setInput("");

    try {
      const result = await processMessage({ data: { context: userMsg } });
      setMessages(prev => [...prev, { role: 'ai', content: result.response }]);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-[600px] border rounded-lg bg-background shadow-sm">
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`p-3 rounded-lg max-w-[80%] ${m.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>
              {m.content}
            </div>
          </div>
        ))}
        {loading && <div className="text-muted-foreground flex gap-2"><Loader2 className="animate-spin h-4 w-4" /> Pensando...</div>}
      </div>
      <div className="p-4 border-t flex gap-2">
        <Input 
          value={input} 
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
          placeholder="Ex: Quero abrir uma hamburgueria..."
        />
        <Button onClick={sendMessage} disabled={loading}><Send className="h-4 w-4" /></Button>
      </div>
    </div>
  );
}
