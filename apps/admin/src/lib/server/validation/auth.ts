// Plain Zod (not drizzle-zod) — login input has no 1:1 shape with a table row
// (`password` here, `passwordHash` in `admin_users`).
import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().min(1),
  password: z.string().min(1),
});

export type LoginInput = z.infer<typeof loginSchema>;
