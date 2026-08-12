import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const processSwitchingMessage = createServerFn({ method: "POST" })
  .inputValidator((data) => z.object({
    context: z.string(),
    history: z.array(z.object({
      role: z.enum(["user", "ai"]),
      content: z.string()
    }))
  }).parse(data))
  .handler(async ({ data }) => {
    const { aiAnalyzeSwitching } = await import("./switching-chat.server");
    return aiAnalyzeSwitching(data.context, data.history);
  });

