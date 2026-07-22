import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  ANTHROPIC_API_KEY: z.string().min(1),
  ANTHROPIC_MODEL: z.string().default("claude-sonnet-4-5"),
  GOOGLE_CLIENT_ID: z.string().min(1),
  GOOGLE_CLIENT_SECRET: z.string().min(1),
  GOOGLE_REFRESH_TOKEN: z.string().min(1),
  GOOGLE_CALENDAR_ID: z.string().default("primary"),
  TIME_ZONE: z.string().default("America/Los_Angeles"),
  WORKDAY_START: z.string().regex(/^\d{2}:\d{2}$/).default("09:00"),
  WORKDAY_END: z.string().regex(/^\d{2}:\d{2}$/).default("17:00"),
  SEARCH_DAYS: z.coerce.number().int().positive().max(60).default(14),
  TWILIO_AUTH_TOKEN: z.string().optional(),
  PUBLIC_BASE_URL: z.string().url().optional(),
  PORT: z.coerce.number().int().positive().default(3000)
});

export const config = envSchema.parse(process.env);
