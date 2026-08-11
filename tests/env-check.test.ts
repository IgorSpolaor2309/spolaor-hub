import { it, expect } from "vitest";
it("should see SUPABASE_URL", () => {
  expect(process.env.SUPABASE_URL).toBeDefined();
  console.log("URL:", process.env.SUPABASE_URL);
});
