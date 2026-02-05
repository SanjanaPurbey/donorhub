import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { updateDonorSchema } from "@/lib/validators";
import { createLedgerEntry } from "@/lib/hash";
import { z } from "zod";
import { Prisma } from "@prisma/client";

// Type for donor with matches included
type DonorWithMatches = Prisma.DonorGetPayload<{
  include: {
    matches: {
      include: {
        bloodRequest: true;
      };
    };
  };
}>;

// GET /api/donors/[id] - Get a single donor
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    const { id } = await params;

    if (!session) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    const donor = await prisma.donor.findFirst({
      where: { id, deletedAt: null },
      include: {
        createdBy: {
          select: { id: true, name: true, email: true },
        },
        matches: {
          include: {
            bloodRequest: {
              select: {
                id: true,
                patientName: true,
                hospital: true,
                bloodGroup: true,
                status: true,
              },
            },
          },
          orderBy: { createdAt: "desc" },
          take: 10,
        },
      },
    });

    if (!donor) {
      return NextResponse.json(
        { success: false, error: "Donor not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: donor });
  } catch (error) {
    console.error("Error fetching donor:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch donor" },
      { status: 500 }
    );
  }
}

// PATCH /api/donors/[id] - Update a donor
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    const { id } = await params;

    if (!session) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    const body = await request.json();
    const validated = updateDonorSchema.parse(body);

    // Check if donor exists with their active matches
    const existingDonorWithMatches = await prisma.donor.findFirst({
      where: { id, deletedAt: null },
      include: {
        matches: {
          where: {
            status: "PENDING",
            bloodRequest: {
              status: "MATCHED",
              deletedAt: null,
            },
          },
          include: {
            bloodRequest: true,
          },
        },
      },
    }) as DonorWithMatches | null;

    if (!existingDonorWithMatches) {
      return NextResponse.json(
        { success: false, error: "Donor not found" },
        { status: 404 }
      );
    }

    // Extract matches for later use and create base donor reference
    const existingMatches = existingDonorWithMatches.matches;
    const existingDonor = existingDonorWithMatches;

    // Check for duplicate email/phone (excluding current donor)
    if (validated.email || validated.phone) {
      const duplicateCheck = await prisma.donor.findFirst({
        where: {
          id: { not: id },
          deletedAt: null,
          OR: [
            validated.email ? { email: validated.email } : {},
            validated.phone ? { phone: validated.phone } : {},
          ].filter(obj => Object.keys(obj).length > 0),
        },
      });

      if (duplicateCheck) {
        const field = duplicateCheck.email === validated.email ? "email" : "phone";
        return NextResponse.json(
          { success: false, error: `A donor with this ${field} already exists` },
          { status: 400 }
        );
      }
    }

    const updateData: Record<string, unknown> = {};
    
    // Only add fields that have actually changed from the existing donor
    if (validated.firstName && validated.firstName !== existingDonor.firstName) 
      updateData.firstName = validated.firstName;
    if (validated.lastName && validated.lastName !== existingDonor.lastName) 
      updateData.lastName = validated.lastName;
    if (validated.email && validated.email !== existingDonor.email) 
      updateData.email = validated.email;
    if (validated.phone && validated.phone !== existingDonor.phone) 
      updateData.phone = validated.phone;
    if (validated.bloodGroup && validated.bloodGroup !== existingDonor.bloodGroup) 
      updateData.bloodGroup = validated.bloodGroup;
    if (validated.dateOfBirth) {
      const newDOB = new Date(validated.dateOfBirth);
      if (newDOB.getTime() !== existingDonor.dateOfBirth.getTime())
        updateData.dateOfBirth = newDOB;
    }
    if (validated.gender && validated.gender !== existingDonor.gender) 
      updateData.gender = validated.gender;
    if (validated.address && validated.address !== existingDonor.address) 
      updateData.address = validated.address;
    if (validated.city && validated.city !== existingDonor.city) 
      updateData.city = validated.city;
    if (validated.state && validated.state !== existingDonor.state) 
      updateData.state = validated.state;
    if (validated.pincode && validated.pincode !== existingDonor.pincode) 
      updateData.pincode = validated.pincode;
    if (validated.isAvailable !== undefined && validated.isAvailable !== existingDonor.isAvailable) 
      updateData.isAvailable = validated.isAvailable;
    if (validated.lastDonation !== undefined) {
      const newLastDonation = validated.lastDonation ? new Date(validated.lastDonation) : null;
      const existingLastDonation = existingDonor.lastDonation;
      const hasChanged = newLastDonation?.getTime() !== existingLastDonation?.getTime();
      if (hasChanged) updateData.lastDonation = newLastDonation;
    }
    if (validated.medicalNotes !== undefined && validated.medicalNotes !== existingDonor.medicalNotes) 
      updateData.medicalNotes = validated.medicalNotes;

    // If nothing actually changed, return early
    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({
        success: true,
        data: existingDonor,
        message: "No changes detected",
      });
    }

    // Check if critical fields that affect matching are being changed
    const criticalDonorFields = ['bloodGroup', 'city', 'state', 'isAvailable'];
    const hasCriticalChange = criticalDonorFields.some(field => 
      updateData[field] !== undefined
    );

    // If critical fields changed and donor has pending matches, invalidate those matches
    let matchesInvalidated = false;
    let affectedRequestIds: string[] = [];
    
    if (hasCriticalChange && existingMatches.length > 0) {
      // Get unique request IDs that will be affected
      affectedRequestIds = [...new Set(existingMatches.map(m => m.bloodRequestId))];
      
      // Delete this donor's pending matches
      await prisma.donorMatch.deleteMany({
        where: {
          donorId: id,
          status: "PENDING",
        },
      });

      // For each affected request, check if it still has matches
      for (const requestId of affectedRequestIds) {
        const remainingMatches = await prisma.donorMatch.count({
          where: { bloodRequestId: requestId },
        });

        // If no matches remain, reset request status to PENDING
        if (remainingMatches === 0) {
          await prisma.bloodRequest.update({
            where: { id: requestId },
            data: { status: "PENDING" },
          });
        }
      }

      matchesInvalidated = true;
    }

    const donor = await prisma.donor.update({
      where: { id },
      data: updateData,
      include: {
        createdBy: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    // Create hash ledger entry for update
    await createLedgerEntry("DONOR_UPDATED", donor.id, "Donor", {
      updatedFields: Object.keys(updateData),
      updatedBy: session.user.id,
    });

    // Create ledger entry if matches were invalidated (non-blocking)
    if (matchesInvalidated) {
      try {
        await createLedgerEntry("DONOR_MATCHES_INVALIDATED", donor.id, "Donor", {
          reason: "Critical donor fields changed",
          changedFields: criticalDonorFields.filter(field => updateData[field] !== undefined),
          affectedRequests: affectedRequestIds,
          updatedBy: session.user.id,
        });
      } catch (ledgerError) {
        console.error("Failed to create ledger entry for donor match invalidation:", ledgerError);
        // Don't fail the request if ledger entry fails
      }
    }

    return NextResponse.json({
      success: true,
      data: donor,
      message: matchesInvalidated
        ? "Donor updated. Previous matches were invalidated due to changes in matching criteria."
        : "Donor updated successfully",
      matchesInvalidated,
      affectedRequestCount: affectedRequestIds.length,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: error.issues[0]?.message || "Validation error" },
        { status: 400 }
      );
    }
    console.error("Error updating donor:", error);
    return NextResponse.json(
      { success: false, error: "Failed to update donor" },
      { status: 500 }
    );
  }
}

// DELETE /api/donors/[id] - Soft delete a donor
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    const { id } = await params;

    if (!session) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    const donor = await prisma.donor.findFirst({
      where: { id, deletedAt: null },
    });

    if (!donor) {
      return NextResponse.json(
        { success: false, error: "Donor not found" },
        { status: 404 }
      );
    }

    // Soft delete
    await prisma.donor.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    return NextResponse.json({
      success: true,
      message: "Donor deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting donor:", error);
    return NextResponse.json(
      { success: false, error: "Failed to delete donor" },
      { status: 500 }
    );
  }
}

// PUT /api/donors/[id] - Restore a soft-deleted donor
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    const { id } = await params;

    if (!session) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    // Find the soft-deleted donor
    const deletedDonor = await prisma.donor.findFirst({
      where: { id, deletedAt: { not: null } },
    });

    if (!deletedDonor) {
      return NextResponse.json(
        { success: false, error: "Deleted donor not found" },
        { status: 404 }
      );
    }

    // Check if an active donor with same email/phone exists
    const conflictingDonor = await prisma.donor.findFirst({
      where: {
        id: { not: id },
        deletedAt: null,
        OR: [
          { email: deletedDonor.email },
          { phone: deletedDonor.phone },
        ],
      },
    });

    if (conflictingDonor) {
      const field = conflictingDonor.email === deletedDonor.email ? "email" : "phone";
      return NextResponse.json(
        { success: false, error: `An active donor with this ${field} already exists` },
        { status: 400 }
      );
    }

    // Optionally update donor data if provided
    const body = await request.json().catch(() => ({}));
    const updateData: Record<string, unknown> = { deletedAt: null };

    // Allow updating basic info during restore
    if (body.firstName) updateData.firstName = body.firstName;
    if (body.lastName) updateData.lastName = body.lastName;
    if (body.phone) updateData.phone = body.phone;
    if (body.address) updateData.address = body.address;
    if (body.city) updateData.city = body.city;
    if (body.state) updateData.state = body.state;
    if (body.pincode) updateData.pincode = body.pincode;
    if (body.isAvailable !== undefined) updateData.isAvailable = body.isAvailable;

    // Restore the donor
    const donor = await prisma.donor.update({
      where: { id },
      data: updateData,
      include: {
        createdBy: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    // Create ledger entry for restore
    await createLedgerEntry("DONOR_UPDATED", donor.id, "Donor", {
      action: "restored",
      restoredBy: session.user.id,
    });

    return NextResponse.json({
      success: true,
      data: donor,
      message: "Donor restored successfully",
    });
  } catch (error) {
    console.error("Error restoring donor:", error);
    return NextResponse.json(
      { success: false, error: "Failed to restore donor" },
      { status: 500 }
    );
  }
}
