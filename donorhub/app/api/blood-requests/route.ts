import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { createBloodRequestSchema, bloodRequestFilterSchema } from "@/lib/validators";
import { createLedgerEntry } from "@/lib/hash";
import { z } from "zod";

// GET /api/blood-requests - List all blood requests with filtering and pagination
export async function GET(request: NextRequest) {
  try {
    const session = await auth();

    if (!session) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    const searchParams = request.nextUrl.searchParams;
    const filters = bloodRequestFilterSchema.parse({
      page: searchParams.get("page") || "1",
      limit: searchParams.get("limit") || "10",
      search: searchParams.get("search") || undefined,
      sortBy: searchParams.get("sortBy") || "createdAt",
      sortOrder: searchParams.get("sortOrder") || "desc",
      bloodGroup: searchParams.get("bloodGroup") || undefined,
      status: searchParams.get("status") || undefined,
      urgency: searchParams.get("urgency") || undefined,
    });

    // Check if we should filter to only requests with matches
    const hasMatches = searchParams.get("hasMatches") === "true";

    const where: Record<string, unknown> = {
      deletedAt: null, // Exclude soft-deleted requests
    };

    // Filter to only show requests that have matches
    if (hasMatches) {
      where.matches = { some: {} };
      // Default to showing MATCHED and FULFILLED, but allow override via status filter
      if (!filters.status) {
        where.status = { in: ["MATCHED", "FULFILLED"] };
      }
    }

    if (filters.search) {
      where.OR = [
        { patientName: { contains: filters.search, mode: "insensitive" } },
        { hospital: { contains: filters.search, mode: "insensitive" } },
        { contactName: { contains: filters.search, mode: "insensitive" } },
        { contactPhone: { contains: filters.search, mode: "insensitive" } },
      ];
    }

    if (filters.bloodGroup) {
      where.bloodGroup = filters.bloodGroup;
    }

    if (filters.status) {
      where.status = filters.status;
    }

    if (filters.urgency) {
      where.urgency = filters.urgency;
    }

    const [requests, total] = await Promise.all([
      prisma.bloodRequest.findMany({
        where,
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
                  lastDonation: true,
                  dateOfBirth: true,
                  donationCount: true,
                },
              },
            },
            orderBy: { matchScore: { sort: "desc", nulls: "last" } },
          },
        },
        orderBy: { [filters.sortBy || "createdAt"]: filters.sortOrder },
        skip: (filters.page - 1) * filters.limit,
        take: filters.limit,
      }),
      prisma.bloodRequest.count({ where }),
    ]);

    return NextResponse.json({
      success: true,
      data: requests,
      pagination: {
        page: filters.page,
        limit: filters.limit,
        total,
        totalPages: Math.ceil(total / filters.limit),
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: "Invalid query parameters" },
        { status: 400 }
      );
    }
    console.error("Error fetching blood requests:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch blood requests" },
      { status: 500 }
    );
  }
}

// POST /api/blood-requests - Create a new blood request
export async function POST(request: NextRequest) {
  try {
    const session = await auth();

    if (!session) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    const body = await request.json();
    const validated = createBloodRequestSchema.parse(body);

    const bloodRequest = await prisma.bloodRequest.create({
      data: {
        patientName: validated.patientName,
        bloodGroup: validated.bloodGroup,
        unitsRequired: validated.unitsRequired,
        urgency: validated.urgency,
        hospital: validated.hospital,
        hospitalAddress: validated.hospitalAddress,
        city: validated.city || "",
        state: validated.state || "",
        contactName: validated.contactName,
        contactPhone: validated.contactPhone,
        deadline: new Date(validated.deadline),
        notes: validated.notes || null,
        status: "PENDING",
        createdById: session.user.id,
      },
      include: {
        createdBy: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    // Create hash ledger entry
    await createLedgerEntry("BLOOD_REQUEST_CREATED", bloodRequest.id, "BloodRequest", {
      bloodGroup: bloodRequest.bloodGroup,
      unitsRequired: bloodRequest.unitsRequired,
      urgency: bloodRequest.urgency,
      hospital: bloodRequest.hospital,
      createdBy: session.user.id,
    });

    return NextResponse.json(
      { success: true, data: bloodRequest, message: "Blood request created successfully" },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: error.issues[0]?.message || "Validation error" },
        { status: 400 }
      );
    }
    console.error("Error creating blood request:", error);
    return NextResponse.json(
      { success: false, error: "Failed to create blood request" },
      { status: 500 }
    );
  }
}
