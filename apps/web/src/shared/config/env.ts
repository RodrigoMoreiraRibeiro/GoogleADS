import { z } from 'zod';

const webEnvironmentSchema = z.object({
  VITE_API_BASE_URL: z.string().url(),
  VITE_APP_NAME: z.string().min(1),
});

export const webEnvironment = webEnvironmentSchema.parse(import.meta.env);
