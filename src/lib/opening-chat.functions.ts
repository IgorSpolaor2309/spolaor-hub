import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const OpeningSchema = z.object({
  context: z.string(),
  history: z.array(z.object({
    role: z.enum(["user", "ai"]),
    content: z.string()
  })),
});

export const processOpeningMessage = createServerFn({ method: "POST" })
  .inputValidator((data) => OpeningSchema.parse(data))
  .handler(async ({ data }) => {
    const { aiAnalyzeOpening } = await import("./opening-chat.server");
    const result = await aiAnalyzeOpening(data.context, data.history);
    
    return {
      status: result.isComplete ? "complete" : "processing",
      response: result.response,
      extractedData: result.extractedData
    };
  });
