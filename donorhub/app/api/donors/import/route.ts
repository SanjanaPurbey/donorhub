import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { createLedgerEntry } from "@/lib/hash";
import { bloodGroupSchema } from "@/lib/validators";
import { z } from "zod";
import { BloodGroup } from "@prisma/client";

// CSV Row schema for validation
const csvRowSchema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  email: z.string().email("Invalid email"),
  phone: z.string().min(10, "Phone must be at least 10 characters"),
  bloodGroup: z.string(),
  dateOfBirth: z.string(),
  gender: z.string(),
  address: z.string().min(1, "Address is required"),
  city: z.string().min(1, "City is required"),
  state: z.string().min(1, "State is required"),
  pincode: z.string().min(1, "Pincode is required"),
  isAvailable: z.string().optional(),
  lastDonation: z.string().optional(),
  medicalNotes: z.string().optional(),
});

// Blood group mapping from display to enum
const bloodGroupMap: Record<string, string> = {
  "A+": "A_POSITIVE",
  "A-": "A_NEGATIVE",
  "B+": "B_POSITIVE",
  "B-": "B_NEGATIVE",
  "AB+": "AB_POSITIVE",
  "AB-": "AB_NEGATIVE",
  "O+": "O_POSITIVE",
  "O-": "O_NEGATIVE",
  "A_POSITIVE": "A_POSITIVE",
  "A_NEGATIVE": "A_NEGATIVE",
  "B_POSITIVE": "B_POSITIVE",
  "B_NEGATIVE": "B_NEGATIVE",
  "AB_POSITIVE": "AB_POSITIVE",
  "AB_NEGATIVE": "AB_NEGATIVE",
  "O_POSITIVE": "O_POSITIVE",
  "O_NEGATIVE": "O_NEGATIVE",
};

interface ImportResult {
  success: number;
  failed: number;
  duplicates: number;
  errors: Array<{
    row: number;
    email?: string;
    phone?: string;
    error: string;
  }>;
}

interface ValidDonorData {
  rowNum: number;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  bloodGroup: BloodGroup;
  dateOfBirth: Date;
  gender: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
  isAvailable: boolean;
  lastDonation: Date | null;
  medicalNotes: string | null;
}

// POST /api/donors/import - Import donors from CSV data with streaming progress
export async function POST(request: NextRequest) {
  const encoder = new TextEncoder();
  
  // Create a streaming response using Server-Sent Events
  const stream = new ReadableStream({
    async start(controller) {
      // Helper to send progress updates
      const sendProgress = (data: unknown) => {
        const message = `data: ${JSON.stringify(data)}\n\n`;
        controller.enqueue(encoder.encode(message));
      };

      try {
        const session = await auth();

        if (!session) {
          sendProgress({ type: "error", error: "Unauthorized" });
          controller.close();
          return;
        }

        // Only admin can import
        if (session.user.role !== "SYSTEM_ADMIN") {
          sendProgress({ type: "error", error: "Only administrators can import donors" });
          controller.close();
          return;
        }

        const body = await request.json();
        const { rows } = body as { rows: Record<string, string>[] };

        if (!rows || !Array.isArray(rows) || rows.length === 0) {
          sendProgress({ type: "error", error: "No data provided for import" });
          controller.close();
          return;
        }

        const result: ImportResult = {
          success: 0,
          failed: 0,
          duplicates: 0,
          errors: [],
        };

        sendProgress({ type: "start", total: rows.length });

        // Get existing emails and phones for duplicate checking
        const existingDonors = await prisma.donor.findMany({
          where: { deletedAt: null },
          select: { email: true, phone: true },
        });

        const existingEmails = new Set(existingDonors.map((d) => d.email.toLowerCase()));
        const existingPhones = new Set(existingDonors.map((d) => d.phone));

        // Track new emails/phones within this import batch
        const batchEmails = new Set<string>();
        const batchPhones = new Set<string>();

        // Phase 1: Validate all rows and send validation results
        sendProgress({ type: "phase", phase: "validating" });

        const validDonors: ValidDonorData[] = [];

        for (let i = 0; i < rows.length; i++) {
          const row = rows[i];
          const rowNum = i + 2; // +2 for header row and 0-indexing

          try {
            // Validate row structure
            const validated = csvRowSchema.parse(row);

            // Convert blood group
            const bloodGroupInput = validated.bloodGroup.trim().toUpperCase();
            const bloodGroupEnum = bloodGroupMap[bloodGroupInput] || bloodGroupMap[validated.bloodGroup];
            
            if (!bloodGroupEnum) {
              result.failed++;
              result.errors.push({
                row: rowNum,
                email: validated.email,
                error: `Invalid blood group: ${validated.bloodGroup}`,
              });
              sendProgress({
                type: "error",
                row: rowNum,
                name: `${validated.firstName} ${validated.lastName}`,
                error: `Invalid blood group: ${validated.bloodGroup}`,
              });
              continue;
            }

            // Validate blood group with schema
            try {
              bloodGroupSchema.parse(bloodGroupEnum);
            } catch {
              result.failed++;
              result.errors.push({
                row: rowNum,
                email: validated.email,
                error: `Invalid blood group: ${validated.bloodGroup}`,
              });
              sendProgress({
                type: "error",
                row: rowNum,
                name: `${validated.firstName} ${validated.lastName}`,
                error: `Invalid blood group: ${validated.bloodGroup}`,
              });
              continue;
            }

            const email = validated.email.toLowerCase();
            const phone = validated.phone.replace(/\D/g, ""); // Remove non-digits

            // Check for duplicates
            if (existingEmails.has(email) || batchEmails.has(email)) {
              result.duplicates++;
              result.errors.push({
                row: rowNum,
                email: validated.email,
                error: "Duplicate email",
              });
              sendProgress({
                type: "duplicate",
                row: rowNum,
                name: `${validated.firstName} ${validated.lastName}`,
                error: "Duplicate email",
              });
              continue;
            }

            if (existingPhones.has(phone) || batchPhones.has(phone)) {
              result.duplicates++;
              result.errors.push({
                row: rowNum,
                phone: validated.phone,
                error: "Duplicate phone",
              });
              sendProgress({
                type: "duplicate",
                row: rowNum,
                name: `${validated.firstName} ${validated.lastName}`,
                error: "Duplicate phone",
              });
              continue;
            }

            // Parse date
            const dateOfBirth = new Date(validated.dateOfBirth);
            if (isNaN(dateOfBirth.getTime())) {
              result.failed++;
              result.errors.push({
                row: rowNum,
                email: validated.email,
                error: "Invalid date of birth",
              });
              sendProgress({
                type: "error",
                row: rowNum,
                name: `${validated.firstName} ${validated.lastName}`,
                error: "Invalid date of birth",
              });
              continue;
            }

            // Track for batch duplicate detection
            batchEmails.add(email);
            batchPhones.add(phone);

            // Add to valid donors list
            validDonors.push({
              rowNum,
              firstName: validated.firstName.trim(),
              lastName: validated.lastName.trim(),
              email,
              phone,
              bloodGroup: bloodGroupEnum as BloodGroup,
              dateOfBirth,
              gender: validated.gender.trim(),
              address: validated.address.trim(),
              city: validated.city.trim(),
              state: validated.state.trim(),
              pincode: validated.pincode.trim(),
              isAvailable: validated.isAvailable?.toLowerCase() !== "false",
              lastDonation: validated.lastDonation ? new Date(validated.lastDonation) : null,
              medicalNotes: validated.medicalNotes || null,
            });
          } catch (error) {
            result.failed++;
            const errorMessage = error instanceof z.ZodError
              ? error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ')
              : error instanceof Error
              ? error.message
              : "Unknown error";
            
            result.errors.push({
              row: rowNum,
              error: errorMessage,
            });
            
            sendProgress({
              type: "error",
              row: rowNum,
              name: row.firstName && row.lastName ? `${row.firstName} ${row.lastName}` : `Row ${rowNum}`,
              error: errorMessage,
            });
          }
        }

        // Phase 2: Insert valid donors in batches with real-time progress updates
        if (validDonors.length > 0) {
          sendProgress({ type: "phase", phase: "inserting", validCount: validDonors.length });
          
          const BATCH_SIZE = 50;
          
          for (let i = 0; i < validDonors.length; i += BATCH_SIZE) {
            const batch = validDonors.slice(i, i + BATCH_SIZE);
            
            // Use a transaction for each batch
            await prisma.$transaction(async (tx) => {
              for (const donor of batch) {
                try {
                  await tx.donor.create({
                    data: {
                      firstName: donor.firstName,
                      lastName: donor.lastName,
                      email: donor.email,
                      phone: donor.phone,
                      bloodGroup: donor.bloodGroup,
                      dateOfBirth: donor.dateOfBirth,
                      gender: donor.gender,
                      address: donor.address,
                      city: donor.city,
                      state: donor.state,
                      pincode: donor.pincode,
                      isAvailable: donor.isAvailable,
                      lastDonation: donor.lastDonation,
                      medicalNotes: donor.medicalNotes,
                      createdById: session.user.id,
                    },
                  });

                  result.success++;
                  
                  // Send success progress for this donor
                  sendProgress({
                    type: "success",
                    row: donor.rowNum,
                    name: `${donor.firstName} ${donor.lastName}`,
                    processed: result.success + result.failed + result.duplicates,
                    total: rows.length,
                  });
                } catch (error) {
                  result.failed++;
                  const errorMessage = error instanceof Error ? error.message : "Database error";
                  result.errors.push({
                    row: donor.rowNum,
                    email: donor.email,
                    error: errorMessage,
                  });
                  
                  sendProgress({
                    type: "error",
                    row: donor.rowNum,
                    name: `${donor.firstName} ${donor.lastName}`,
                    error: errorMessage,
                    processed: result.success + result.failed + result.duplicates,
                    total: rows.length,
                  });
                }
              }
            });
          }

          // Phase 3: Create ledger entries
          sendProgress({ type: "phase", phase: "ledger" });
          
          const createdDonors = await prisma.donor.findMany({
            where: {
              email: { in: validDonors.map(d => d.email) },
              deletedAt: null,
            },
            select: { id: true, email: true, bloodGroup: true },
          });

          const LEDGER_BATCH_SIZE = 5;
          for (let i = 0; i < createdDonors.length; i += LEDGER_BATCH_SIZE) {
            const batch = createdDonors.slice(i, i + LEDGER_BATCH_SIZE);
            await Promise.all(
              batch.map(donor =>
                createLedgerEntry("DONOR_CREATED", donor.id, "Donor", {
                  email: donor.email,
                  bloodGroup: donor.bloodGroup,
                  importedViaCSV: true,
                }).catch(err => {
                  console.error(`Failed to create ledger entry for ${donor.email}:`, err);
                })
              )
            );
          }
        }

        // Send final result
        sendProgress({
          type: "complete",
          result: {
            success: result.success,
            failed: result.failed,
            duplicates: result.duplicates,
            errors: result.errors,
          },
        });

        controller.close();
      } catch (error) {
        console.error("Error importing donors:", error);
        sendProgress({
          type: "error",
          error: error instanceof Error ? error.message : "Failed to import donors",
        });
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
  });
}
