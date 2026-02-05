import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { computeHash } from "@/lib/hash";
import { z } from "zod";

const filterSchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
  eventType: z.string().optional(),
  entityType: z.string().optional(),
  search: z.string().optional(),
});

// GET /api/ledger - List all ledger entries (admin only)
export async function GET(request: NextRequest) {
  try {
    const session = await auth();

    if (!session) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    // Only admins can view the ledger
    if (session.user.role !== "SYSTEM_ADMIN") {
      return NextResponse.json(
        { success: false, error: "Access denied. Admin only." },
        { status: 403 }
      );
    }

    const searchParams = request.nextUrl.searchParams;
    const filters = filterSchema.parse({
      page: searchParams.get("page") || "1",
      limit: searchParams.get("limit") || "20",
      eventType: searchParams.get("eventType") || undefined,
      entityType: searchParams.get("entityType") || undefined,
      search: searchParams.get("search") || undefined,
    });

    const where: Record<string, unknown> = {};

    if (filters.eventType) {
      where.eventType = filters.eventType;
    }

    if (filters.entityType) {
      where.entityType = filters.entityType;
    }

    if (filters.search) {
      where.OR = [
        { entityId: { contains: filters.search, mode: "insensitive" } },
        { eventType: { contains: filters.search, mode: "insensitive" } },
      ];
    }

    const [entries, total] = await Promise.all([
      prisma.hashLedger.findMany({
        where,
        orderBy: { timestamp: "desc" },
        skip: (filters.page - 1) * filters.limit,
        take: filters.limit,
      }),
      prisma.hashLedger.count({ where }),
    ]);

    // Get unique event types and entity types for filters
    const [eventTypes, entityTypes] = await Promise.all([
      prisma.hashLedger.findMany({
        distinct: ["eventType"],
        select: { eventType: true },
      }),
      prisma.hashLedger.findMany({
        distinct: ["entityType"],
        select: { entityType: true },
      }),
    ]);

    return NextResponse.json({
      success: true,
      data: entries,
      pagination: {
        page: filters.page,
        limit: filters.limit,
        total,
        totalPages: Math.ceil(total / filters.limit),
      },
      filters: {
        eventTypes: eventTypes.map((e) => e.eventType),
        entityTypes: entityTypes.map((e) => e.entityType),
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: "Invalid query parameters" },
        { status: 400 }
      );
    }
    console.error("Error fetching ledger:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch ledger entries" },
      { status: 500 }
    );
  }
}

// POST /api/ledger/verify - Verify the integrity of a ledger entry
export async function POST(request: NextRequest) {
  try {
    const session = await auth();

    if (!session) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    if (session.user.role !== "SYSTEM_ADMIN") {
      return NextResponse.json(
        { success: false, error: "Access denied. Admin only." },
        { status: 403 }
      );
    }

    const { entryId } = await request.json();

    if (!entryId) {
      return NextResponse.json(
        { success: false, error: "Entry ID is required" },
        { status: 400 }
      );
    }

    const entry = await prisma.hashLedger.findUnique({
      where: { id: entryId },
    });

    if (!entry) {
      return NextResponse.json(
        { success: false, error: "Entry not found" },
        { status: 404 }
      );
    }

    // Verify the hash
    // Must match EXACTLY how the hash was computed in createLedgerEntry (lib/hash.ts)
    
    // Extract the original payload and timestamp used for hashing
    const storedPayload = entry.payload as Record<string, unknown>;
    const hashTimestamp = storedPayload._hashTimestamp as string | undefined;
    
    // Remove _hashTimestamp from payload to get original payload for hash computation
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { _hashTimestamp, ...originalPayload } = storedPayload;
    
    // Use stored _hashTimestamp if available (new entries), otherwise fall back to timestamp field (old entries)
    const timestampForHash = hashTimestamp ?? entry.timestamp.toISOString();
    
    // The hash is computed using computeHash() which sorts keys automatically
    const hashPayload = {
      eventType: entry.eventType,
      entityId: entry.entityId,
      entityType: entry.entityType,
      payload: originalPayload,
      timestamp: timestampForHash,
    };
    
    // Use the same computeHash function as creation to ensure consistency
    const calculatedHash = computeHash(entry.previousHash, hashPayload);

    const isValid = calculatedHash === entry.currentHash;
    
    // Debug info for troubleshooting
    const hasStoredTimestamp = !!hashTimestamp;

    return NextResponse.json({
      success: true,
      data: {
        isValid,
        storedHash: entry.currentHash,
        calculatedHash,
        // Help debug
        debug: !isValid ? {
          hasStoredTimestamp,
          timestampUsed: timestampForHash,
          payloadKeys: Object.keys(originalPayload),
        } : undefined,
        note: !isValid 
          ? hasStoredTimestamp 
            ? "Hash verification failed unexpectedly. This may indicate data corruption."
            : "This entry was created before the hash fix. Use Dev Tools to reset the database for consistent verification."
          : undefined,
      },
    });
  } catch (error) {
    console.error("Error verifying ledger entry:", error);
    return NextResponse.json(
      { success: false, error: "Failed to verify entry" },
      { status: 500 }
    );
  }
}
