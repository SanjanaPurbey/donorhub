import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { z } from "zod";

const updateSchema = z.object({
  status: z.enum(["PENDING", "CONFIRMED", "REJECTED", "COMPLETED"]),
});

// PATCH /api/matches/[id] - Update a match status
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
    const validated = updateSchema.parse(body);

    const match = await prisma.donorMatch.findUnique({
      where: { id },
    });

    if (!match) {
      return NextResponse.json(
        { success: false, error: "Match not found" },
        { status: 404 }
      );
    }

    // Validate status transitions
    const validTransitions: Record<string, string[]> = {
      PENDING: ["CONFIRMED", "REJECTED"],
      CONFIRMED: ["COMPLETED", "REJECTED"],
      REJECTED: [], // Terminal state
      COMPLETED: [], // Terminal state
    };

    const allowedTransitions = validTransitions[match.status] || [];
    
    if (!allowedTransitions.includes(validated.status)) {
      return NextResponse.json(
        { 
          success: false, 
          error: `Cannot transition from ${match.status} to ${validated.status}` 
        },
        { status: 400 }
      );
    }

    const updatedMatch = await prisma.donorMatch.update({
      where: { id },
      data: {
        status: validated.status,
        confirmedAt: validated.status === "CONFIRMED" ? new Date() : undefined,
        completedAt: validated.status === "COMPLETED" ? new Date() : undefined,
      },
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
            lastDonation: true,
          },
        },
        bloodRequest: {
          select: {
            id: true,
            patientName: true,
            bloodGroup: true,
            hospital: true,
            urgency: true,
            status: true,
          },
        },
      },
    });

    // If match is completed, update the donor's last donation date and increment donation count
    if (validated.status === "COMPLETED") {
      await prisma.donor.update({
        where: { id: match.donorId },
        data: { 
          lastDonation: new Date(),
          donationCount: { increment: 1 },
        },
      });
    }

    return NextResponse.json({
      success: true,
      data: updatedMatch,
      message: "Match status updated successfully",
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: error.issues[0]?.message || "Validation error" },
        { status: 400 }
      );
    }
    console.error("Error updating match:", error);
    return NextResponse.json(
      { success: false, error: "Failed to update match" },
      { status: 500 }
    );
  }
}
