import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { updateBloodRequestSchema } from "@/lib/validators";
import { createLedgerEntry } from "@/lib/hash";
import { z } from "zod";

// GET /api/blood-requests/[id] - Get a single blood request
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

    const bloodRequest = await prisma.bloodRequest.findFirst({
      where: { id, deletedAt: null },
      include: {
        createdBy: {
          select: { id: true, name: true, email: true },
        },
        matches: {
          include: {
            donor: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                phone: true,
                bloodGroup: true,
                city: true,
                state: true,
                isAvailable: true,
                lastDonation: true,
                dateOfBirth: true,
                donationCount: true,
              },
            },
          },
          orderBy: { matchScore: { sort: "desc", nulls: "last" } },
        },
      },
    });

    if (!bloodRequest) {
      return NextResponse.json(
        { success: false, error: "Blood request not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: bloodRequest });
  } catch (error) {
    console.error("Error fetching blood request:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch blood request" },
      { status: 500 }
    );
  }
}

// PATCH /api/blood-requests/[id] - Update a blood request
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
    const validated = updateBloodRequestSchema.parse(body);

    // Check if request exists with its matches
    const existingRequest = await prisma.bloodRequest.findFirst({
      where: { id, deletedAt: null },
      include: {
        matches: true,
      },
    });

    if (!existingRequest) {
      return NextResponse.json(
        { success: false, error: "Blood request not found" },
        { status: 404 }
      );
    }

    // Validate status transitions
    if (validated.status) {
      const validTransitions: Record<string, string[]> = {
        PENDING: ["MATCHED", "CANCELLED"],
        MATCHED: ["FULFILLED", "CANCELLED"],
        FULFILLED: [], // Terminal state
        CANCELLED: [], // Terminal state
      };

      const allowedTransitions = validTransitions[existingRequest.status] || [];
      
      if (!allowedTransitions.includes(validated.status)) {
        return NextResponse.json(
          { 
            success: false, 
            error: `Cannot transition from ${existingRequest.status} to ${validated.status}` 
          },
          { status: 400 }
        );
      }
    }

    // Check if critical fields that affect matching are being changed
    // These fields invalidate existing matches when modified
    const criticalFields = ['bloodGroup', 'city', 'state', 'urgency', 'unitsRequired'];
    const hasCriticalChange = criticalFields.some(field => {
      const newValue = validated[field as keyof typeof validated];
      const oldValue = existingRequest[field as keyof typeof existingRequest];
      return newValue !== undefined && newValue !== oldValue;
    });

    // If critical fields changed and request was MATCHED, reset to PENDING and delete old matches
    let matchesInvalidated = false;
    if (hasCriticalChange && existingRequest.status === "MATCHED" && existingRequest.matches.length > 0) {
      // Only invalidate if there are no COMPLETED matches
      const hasNoCompletedMatches = existingRequest.matches.every(m => m.status !== "COMPLETED");

      if (hasNoCompletedMatches) {
        // Delete existing matches as they're no longer valid
        await prisma.donorMatch.deleteMany({
          where: { bloodRequestId: id },
        });
        matchesInvalidated = true;
      }
    }

    const updateData: Record<string, unknown> = {};
    
    if (validated.patientName) updateData.patientName = validated.patientName;
    if (validated.bloodGroup) updateData.bloodGroup = validated.bloodGroup;
    if (validated.unitsRequired) updateData.unitsRequired = validated.unitsRequired;
    if (validated.urgency) updateData.urgency = validated.urgency;
    if (validated.hospital) updateData.hospital = validated.hospital;
    if (validated.hospitalAddress) updateData.hospitalAddress = validated.hospitalAddress;
    if (validated.city) updateData.city = validated.city;
    if (validated.state) updateData.state = validated.state;
    if (validated.contactName) updateData.contactName = validated.contactName;
    if (validated.contactPhone) updateData.contactPhone = validated.contactPhone;
    if (validated.deadline !== undefined) {
      updateData.deadline = validated.deadline ? new Date(validated.deadline) : null;
    }
    if (validated.notes !== undefined) updateData.notes = validated.notes;
    if (validated.status) updateData.status = validated.status;

    // If matches were invalidated, reset status to PENDING
    if (matchesInvalidated) {
      updateData.status = "PENDING";
    }

    const bloodRequest = await prisma.bloodRequest.update({
      where: { id },
      data: updateData,
      include: {
        createdBy: {
          select: { id: true, name: true, email: true },
        },
        matches: {
          include: {
            donor: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                bloodGroup: true,
                phone: true,
              },
            },
          },
        },
      },
    });

    // Create hash ledger entry for status changes
    if (validated.status && validated.status === "FULFILLED") {
      await createLedgerEntry("BLOOD_REQUEST_FULFILLED", bloodRequest.id, "BloodRequest", {
        previousStatus: existingRequest.status,
        newStatus: validated.status,
        updatedBy: session.user.id,
      });
    }

    // Create ledger entry if matches were invalidated (non-blocking)
    if (matchesInvalidated) {
      try {
        await createLedgerEntry("MATCHES_INVALIDATED", bloodRequest.id, "BloodRequest", {
          reason: "Critical fields changed",
          changedFields: criticalFields.filter(field => {
            const newValue = validated[field as keyof typeof validated];
            const oldValue = existingRequest[field as keyof typeof existingRequest];
            return newValue !== undefined && newValue !== oldValue;
          }),
          previousMatchCount: existingRequest.matches.length,
          updatedBy: session.user.id,
        });
      } catch (ledgerError) {
        console.error("Failed to create ledger entry for match invalidation:", ledgerError);
        // Don't fail the request if ledger entry fails
      }
    }

    return NextResponse.json({
      success: true,
      data: bloodRequest,
      message: matchesInvalidated 
        ? "Blood request updated. Previous matches were invalidated due to changes in matching criteria. Please run Find Match again."
        : "Blood request updated successfully",
      matchesInvalidated,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: error.issues[0]?.message || "Validation error" },
        { status: 400 }
      );
    }
    console.error("Error updating blood request:", error);
    return NextResponse.json(
      { success: false, error: "Failed to update blood request" },
      { status: 500 }
    );
  }
}

// DELETE /api/blood-requests/[id] - Soft delete a blood request
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

    const bloodRequest = await prisma.bloodRequest.findFirst({
      where: { id, deletedAt: null },
    });

    if (!bloodRequest) {
      return NextResponse.json(
        { success: false, error: "Blood request not found" },
        { status: 404 }
      );
    }

    // Soft delete
    await prisma.bloodRequest.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    return NextResponse.json({
      success: true,
      message: "Blood request deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting blood request:", error);
    return NextResponse.json(
      { success: false, error: "Failed to delete blood request" },
      { status: 500 }
    );
  }
}
