import { z } from "zod";

export const moduleSchema = z.object({
  name: z.string()
    .min(1, "Module name is required")
    .max(100, "Module name cannot exceed 100 characters"),
  description: z.string()
    .min(1, "Description is required")
    .max(500, "Description cannot exceed 500 characters"),
  availableOnFree: z.boolean()
    .default(false)
    .optional(),
  isActive: z.boolean()
    .default(true)
    .optional()
});

export type ModuleInput = z.infer<typeof moduleSchema>;

export const moduleUpdateSchema = moduleSchema.partial();
export type ModuleUpdateInput = z.infer<typeof moduleUpdateSchema>;
