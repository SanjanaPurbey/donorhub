import { z } from "zod";

// ==================== USER SCHEMAS ====================

export const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

export const createUserSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  name: z.string().min(2, "Name must be at least 2 characters"),
  role: z.enum(["COORDINATOR"]), // Only coordinators can be created via UI
});

// ==================== DONOR SCHEMAS ====================

export const bloodGroupSchema = z.enum([
  "A_POSITIVE",
  "A_NEGATIVE",
  "B_POSITIVE",
  "B_NEGATIVE",
  "AB_POSITIVE",
  "AB_NEGATIVE",
  "O_POSITIVE",
  "O_NEGATIVE",
]);

export const createDonorSchema = z.object({
  firstName: z.string().min(2, "First name must be at least 2 characters"),
  lastName: z.string().min(2, "Last name must be at least 2 characters"),
  email: z.string().email("Invalid email address"),
  phone: z.string().regex(/^[6-9]\d{9}$/, "Invalid Indian phone number"),
  bloodGroup: bloodGroupSchema,
  dateOfBirth: z.string().refine((date) => {
    const dob = new Date(date);
    const age = Math.floor((Date.now() - dob.getTime()) / (365.25 * 24 * 60 * 60 * 1000));
    return age >= 18 && age <= 65;
  }, "Donor must be between 18 and 65 years old"),
  gender: z.enum(["Male", "Female", "Other"]),
  address: z.string().min(5, "Address must be at least 5 characters"),
  city: z.string().min(2, "City must be at least 2 characters"),
  state: z.string().min(2, "State must be at least 2 characters"),
  pincode: z.string().regex(/^\d{6}$/, "Invalid pincode"),
  isAvailable: z.boolean().default(true),
  lastDonation: z.string().optional().nullable(),
  medicalNotes: z.string().optional().nullable(),
});

export const updateDonorSchema = createDonorSchema.partial();

// ==================== BLOOD REQUEST SCHEMAS ====================

export const urgencyLevelSchema = z.enum(["CRITICAL", "HIGH", "MEDIUM", "LOW"]);

export const requestStatusSchema = z.enum(["PENDING", "MATCHED", "FULFILLED", "CANCELLED"]);

export const createBloodRequestSchema = z.object({
  patientName: z.string().min(2, "Patient name must be at least 2 characters"),
  bloodGroup: bloodGroupSchema,
  unitsRequired: z.number().int().min(1, "At least 1 unit required").max(10, "Maximum 10 units"),
  urgency: urgencyLevelSchema,
  hospital: z.string().min(2, "Hospital name must be at least 2 characters"),
  hospitalAddress: z.string().min(5, "Hospital address must be at least 5 characters"),
  city: z.string().min(2, "City must be at least 2 characters"),
  state: z.string().min(2, "State must be at least 2 characters"),
  contactName: z.string().min(2, "Contact name must be at least 2 characters"),
  contactPhone: z.string().regex(/^[6-9]\d{9}$/, "Invalid Indian phone number"),
  deadline: z.string().refine((date) => new Date(date) > new Date(), "Deadline must be in the future"),
  notes: z.string().optional().nullable(),
});

export const updateBloodRequestSchema = createBloodRequestSchema.partial().extend({
  status: requestStatusSchema.optional(),
});

// ==================== MATCH SCHEMAS ====================

export const matchStatusSchema = z.enum(["PENDING", "CONFIRMED", "REJECTED", "COMPLETED"]);

export const confirmMatchSchema = z.object({
  matchId: z.string().cuid("Invalid match ID"),
});

// ==================== CSV IMPORT SCHEMA ====================

export const csvDonorRowSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z.string().email(),
  phone: z.string(),
  bloodGroup: z.string(),
  dateOfBirth: z.string(),
  gender: z.string(),
  address: z.string(),
  city: z.string(),
  state: z.string(),
  pincode: z.string(),
  isAvailable: z.string().optional(),
  lastDonation: z.string().optional(),
  medicalNotes: z.string().optional(),
});

// ==================== QUERY SCHEMAS ====================

export const paginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(10),
  search: z.string().optional(),
  sortBy: z.string().optional(),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

export const donorFilterSchema = paginationSchema.extend({
  bloodGroup: bloodGroupSchema.optional(),
  city: z.string().optional(),
  isAvailable: z.string().optional().transform((val) => {
    if (val === undefined || val === "") return undefined;
    return val === "true";
  }),
});

export const bloodRequestFilterSchema = paginationSchema.extend({
  bloodGroup: bloodGroupSchema.optional(),
  status: requestStatusSchema.optional(),
  urgency: urgencyLevelSchema.optional(),
  city: z.string().optional(),
});

// ==================== TYPES ====================

export type LoginInput = z.infer<typeof loginSchema>;
export type CreateUserInput = z.infer<typeof createUserSchema>;
export type CreateDonorInput = z.infer<typeof createDonorSchema>;
export type UpdateDonorInput = z.infer<typeof updateDonorSchema>;
export type CreateBloodRequestInput = z.infer<typeof createBloodRequestSchema>;
export type UpdateBloodRequestInput = z.infer<typeof updateBloodRequestSchema>;
export type PaginationInput = z.infer<typeof paginationSchema>;
export type DonorFilterInput = z.infer<typeof donorFilterSchema>;
export type BloodRequestFilterInput = z.infer<typeof bloodRequestFilterSchema>;
