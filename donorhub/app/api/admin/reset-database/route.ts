import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Only allow this endpoint if ENABLE_DEV_TOOLS is set to "true"
const isDevToolsEnabled = process.env.ENABLE_DEV_TOOLS === "true";

export async function DELETE() {
  try {
    // Check if dev tools are enabled
    if (!isDevToolsEnabled) {
      return NextResponse.json(
        { error: "Development tools are not enabled" },
        { status: 403 }
      );
    }

    // Check authentication
    const session = await auth();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Only SYSTEM_ADMIN can reset the database
    if (session.user.role !== "SYSTEM_ADMIN") {
      return NextResponse.json(
        { error: "Only system administrators can reset the database" },
        { status: 403 }
      );
    }

    // Delete in order to respect foreign key constraints
    // 1. Delete all hash ledger entries
    const ledgerCount = await prisma.hashLedger.deleteMany({});

    // 2. Delete all donor matches
    const matchesCount = await prisma.donorMatch.deleteMany({});

    // 3. Delete all blood requests
    const requestsCount = await prisma.bloodRequest.deleteMany({});

    // 4. Delete all donors
    const donorsCount = await prisma.donor.deleteMany({});

    // Users are preserved (admin accounts remain)

    return NextResponse.json({
      success: true,
      message: "Database reset successfully",
      deleted: {
        ledgerEntries: ledgerCount.count,
        matches: matchesCount.count,
        bloodRequests: requestsCount.count,
        donors: donorsCount.count,
      },
    });
  } catch (error) {
    console.error("Database reset error:", error);
    return NextResponse.json(
      { error: "Failed to reset database" },
      { status: 500 }
    );
  }
}

// GET endpoint to check if dev tools are enabled
export async function GET() {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json({
    enabled: isDevToolsEnabled,
  });
}
