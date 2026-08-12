import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { aiAnalyzeSwitching } from "./switching-chat.server";

export const processSwitchingMessage = createServerFn({ method: "POST" })
  .inputValidator((data) => z.object({
    context: z.string(),
    history: z.array(z.any())
  }).parse(data))
  .handler(async ({ data }) => {
    return aiAnalyzeSwitching(data.context, data.history);
  });
