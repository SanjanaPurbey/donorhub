import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { createDonorSchema, donorFilterSchema } from "@/lib/validators";
import { createLedgerEntry } from "@/lib/hash";
import { z } from "zod";

// GET /api/donors - List all donors with filtering and pagination
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
    const filters = donorFilterSchema.parse({
      page: searchParams.get("page") || "1",
      limit: searchParams.get("limit") || "10",
      search: searchParams.get("search") || undefined,
      sortBy: searchParams.get("sortBy") || "createdAt",
      sortOrder: searchParams.get("sortOrder") || "desc",
      bloodGroup: searchParams.get("bloodGroup") || undefined,
      city: searchParams.get("city") || undefined,
      isAvailable: searchParams.get("isAvailable") || undefined,
    });

    // Check if we should show deleted donors
    const showDeleted = searchParams.get("deleted") === "true";

    const where: Record<string, unknown> = showDeleted
      ? { deletedAt: { not: null } } // Only soft-deleted donors
      : { deletedAt: null }; // Exclude soft-deleted donors

    if (filters.search) {
      where.OR = [
        { firstName: { contains: filters.search, mode: "insensitive" } },
        { lastName: { contains: filters.search, mode: "insensitive" } },
        { email: { contains: filters.search, mode: "insensitive" } },
        { phone: { contains: filters.search, mode: "insensitive" } },
        { city: { contains: filters.search, mode: "insensitive" } },
      ];
    }

    if (filters.bloodGroup) {
      where.bloodGroup = filters.bloodGroup;
    }

    if (filters.city) {
      where.city = { contains: filters.city, mode: "insensitive" };
    }

    if (filters.isAvailable !== undefined) {
      where.isAvailable = filters.isAvailable;
    }

    const [donors, total] = await Promise.all([
      prisma.donor.findMany({
        where,
        include: {
          createdBy: {
            select: { id: true, name: true, email: true },
          },
        },
        orderBy: { [filters.sortBy || "createdAt"]: filters.sortOrder },
        skip: (filters.page - 1) * filters.limit,
        take: filters.limit,
      }),
      prisma.donor.count({ where }),
    ]);

    return NextResponse.json({
      success: true,
      data: donors,
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
    console.error("Error fetching donors:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch donors" },
      { status: 500 }
    );
  }
}

// POST /api/donors - Create a new donor
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
    const validated = createDonorSchema.parse(body);

    // Check for duplicates by email or phone (active donors)
    const existingDonor = await prisma.donor.findFirst({
      where: {
        deletedAt: null,
        OR: [
          { email: validated.email },
          { phone: validated.phone },
        ],
      },
    });

    if (existingDonor) {
      const duplicateField = existingDonor.email === validated.email ? "email" : "phone";
      return NextResponse.json(
        { success: false, error: `A donor with this ${duplicateField} already exists` },
        { status: 400 }
      );
    }

    // Check for soft-deleted donors with same email/phone
    const deletedDonor = await prisma.donor.findFirst({
      where: {
        deletedAt: { not: null },
        OR: [
          { email: validated.email },
          { phone: validated.phone },
        ],
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        bloodGroup: true,
        deletedAt: true,
      },
    });

    if (deletedDonor) {
      return NextResponse.json(
        {
          success: false,
          error: "A deleted donor with this email or phone exists",
          code: "DELETED_DONOR_EXISTS",
          deletedDonor,
        },
        { status: 409 } // Conflict
      );
    }

    const donor = await prisma.donor.create({
      data: {
        firstName: validated.firstName,
        lastName: validated.lastName,
        email: validated.email,
        phone: validated.phone,
        bloodGroup: validated.bloodGroup,
        dateOfBirth: new Date(validated.dateOfBirth),
        gender: validated.gender,
        address: validated.address,
        city: validated.city,
        state: validated.state,
        pincode: validated.pincode,
        isAvailable: validated.isAvailable,
        lastDonation: validated.lastDonation ? new Date(validated.lastDonation) : null,
        medicalNotes: validated.medicalNotes || null,
        createdById: session.user.id,
      },
      include: {
        createdBy: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    // Create hash ledger entry
    await createLedgerEntry("DONOR_CREATED", donor.id, "Donor", {
      email: donor.email,
      bloodGroup: donor.bloodGroup,
      city: donor.city,
      createdBy: session.user.id,
    });

    return NextResponse.json(
      { success: true, data: donor, message: "Donor created successfully" },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: error.issues[0]?.message || "Validation error" },
        { status: 400 }
      );
    }
    
    // Handle Prisma unique constraint violation
    if (error && typeof error === 'object' && 'code' in error && error.code === 'P2002') {
      const meta = (error as { meta?: { target?: string[] } }).meta;
      const field = meta?.target?.[0] || 'field';
      return NextResponse.json(
        { success: false, error: `A donor with this ${field} already exists` },
        { status: 400 }
      );
    }
    
    console.error("Error creating donor:", error);
    return NextResponse.json(
      { success: false, error: "Failed to create donor" },
      { status: 500 }
    );
  }
}
