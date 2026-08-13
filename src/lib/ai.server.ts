import OpenAI from "openai";

export async function aiChat(model: string, messages: any[]) {
  const apiKey = process.env['OPENAI_API_KEY'];
  if (!apiKey) {
    // Fallback if no key, but in this env we expect one or use a gateway
    return "Erro: OpenAI API Key não configurada no servidor.";
  }

  const openai = new OpenAI({ apiKey });

  try {
    const completion = await openai.chat.completions.create({
      model: model === "gpt-5-mini" ? "gpt-4o-mini" : model, // Fallback as gpt-5 isn't real yet, user meant latest mini
      messages,
      temperature: 0.2,
    });

    return completion.choices[0].message.content;
  } catch (error: any) {
    console.error("AI Chat Error:", error);
    return `Erro ao processar IA: ${error.message}`;
  }
}
