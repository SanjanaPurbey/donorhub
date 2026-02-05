import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { createLedgerEntry } from "@/lib/hash";

// Blood group type definition
type BloodGroup = 
  | "A_POSITIVE" | "A_NEGATIVE" 
  | "B_POSITIVE" | "B_NEGATIVE" 
  | "AB_POSITIVE" | "AB_NEGATIVE" 
  | "O_POSITIVE" | "O_NEGATIVE";

// Blood type compatibility matrix (recipient -> compatible donors)
const compatibilityMatrix: Record<string, BloodGroup[]> = {
  A_POSITIVE: ["A_POSITIVE", "A_NEGATIVE", "O_POSITIVE", "O_NEGATIVE"],
  A_NEGATIVE: ["A_NEGATIVE", "O_NEGATIVE"],
  B_POSITIVE: ["B_POSITIVE", "B_NEGATIVE", "O_POSITIVE", "O_NEGATIVE"],
  B_NEGATIVE: ["B_NEGATIVE", "O_NEGATIVE"],
  AB_POSITIVE: ["A_POSITIVE", "A_NEGATIVE", "B_POSITIVE", "B_NEGATIVE", "AB_POSITIVE", "AB_NEGATIVE", "O_POSITIVE", "O_NEGATIVE"],
  AB_NEGATIVE: ["A_NEGATIVE", "B_NEGATIVE", "AB_NEGATIVE", "O_NEGATIVE"],
  O_POSITIVE: ["O_POSITIVE", "O_NEGATIVE"],
  O_NEGATIVE: ["O_NEGATIVE"],
};

// Eligible donor type from database
interface EligibleDonor {
  id: string;
  firstName: string;
  lastName: string;
  bloodGroup: string;
  city: string;
  state: string;
  lastDonation: Date | null;
  dateOfBirth: Date;
  gender: string;
  donationCount: number;
  isAvailable: boolean;
  phone: string;
  email: string;
}

// ML Service integration
interface MLMatchFactors {
  bloodCompatibility: number;
  locationProximity: number;
  recencyFactor: number;
  donationHistory: number;
  urgencyBoost: number;
}

interface MLRankedDonor {
  donorId: string;
  matchScore: number;
  matchReason: string;
  factors: MLMatchFactors;
}

interface MLRankResponse {
  success: boolean;
  data?: {
    rankedDonors: MLRankedDonor[];
    metadata?: {
      totalCandidates: number;
      processingTimeMs: number;
      modelVersion: string;
    };
  };
  error?: string;
}

async function rankDonorsWithML(
  bloodRequest: {
    id: string;
    bloodGroup: string;
    urgency: string;
    unitsRequired: number;
    hospital: string;
    hospitalCity: string;
    hospitalState: string;
    requiredBy: Date | null;
  },
  eligibleDonors: Array<{
    id: string;
    bloodGroup: string;
    city: string;
    state: string;
    lastDonation: Date | null;
    dateOfBirth: Date;
    gender: string;
    donationCount: number;
    isAvailable: boolean;
  }>
): Promise<MLRankedDonor[] | null> {
  const mlServiceUrl = process.env.ML_SERVICE_URL;
  const mlApiKey = process.env.ML_SERVICE_API_KEY;
  const mlTimeout = parseInt(process.env.ML_SERVICE_TIMEOUT || "5000", 10);

  if (!mlServiceUrl) {
    console.log("ML_SERVICE_URL not configured, using rule-based ranking");
    return null;
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), mlTimeout);

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    
    // Add API key if configured
    if (mlApiKey) {
      headers["X-ML-API-KEY"] = mlApiKey;
    }

    const response = await fetch(`${mlServiceUrl}/api/v1/match/rank`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        bloodRequest: {
          id: bloodRequest.id,
          bloodGroup: bloodRequest.bloodGroup,
          urgency: bloodRequest.urgency,
          unitsRequired: bloodRequest.unitsRequired,
          hospital: bloodRequest.hospital,
          hospitalCity: bloodRequest.hospitalCity,
          hospitalState: bloodRequest.hospitalState,
          requiredBy: bloodRequest.requiredBy?.toISOString() || null,
        },
        eligibleDonors: eligibleDonors.map((donor) => ({
          id: donor.id,
          bloodGroup: donor.bloodGroup,
          city: donor.city,
          state: donor.state,
          lastDonation: donor.lastDonation?.toISOString() || null,
          dateOfBirth: donor.dateOfBirth.toISOString().split("T")[0],
          gender: donor.gender,
          donationCount: donor.donationCount,
          isAvailable: donor.isAvailable,
        })),
        maxResults: 20,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      console.error(`ML service returned ${response.status}`);
      return null;
    }

    const mlData: MLRankResponse = await response.json();
    
    if (mlData.success && mlData.data?.rankedDonors) {
      console.log(`ML service ranked ${mlData.data.rankedDonors.length} donors`);
      return mlData.data.rankedDonors;
    }

    return null;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      console.error("ML service request timed out");
    } else {
      console.error("ML service error:", error);
    }
    return null;
  }
}

// POST /api/blood-requests/[id]/match - Find and create matches for a blood request
export async function POST(
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

    // Get the blood request
    const bloodRequest = await prisma.bloodRequest.findFirst({
      where: { id, deletedAt: null },
    });

    if (!bloodRequest) {
      return NextResponse.json(
        { success: false, error: "Blood request not found" },
        { status: 404 }
      );
    }

    if (bloodRequest.status !== "PENDING") {
      return NextResponse.json(
        { success: false, error: "Can only match pending requests" },
        { status: 400 }
      );
    }

    // Get compatible blood groups
    const compatibleGroups = compatibilityMatrix[bloodRequest.bloodGroup] || [];
    
    if (compatibleGroups.length === 0) {
      return NextResponse.json(
        { success: false, error: "Invalid blood group" },
        { status: 400 }
      );
    }

    // Find eligible donors
    // Rules:
    // 1. Compatible blood type
    // 2. Currently available
    // 3. Not soft-deleted
    // 4. Last donation was more than 56 days ago (or never donated)
    const minimumDaysSinceLastDonation = 56;
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - minimumDaysSinceLastDonation);

    const eligibleDonors: EligibleDonor[] = await prisma.donor.findMany({
      where: {
        deletedAt: null,
        isAvailable: true,
        bloodGroup: { in: compatibleGroups },
        OR: [
          { lastDonation: null },
          { lastDonation: { lt: cutoffDate } },
        ],
      },
      orderBy: [
        // Prioritize exact blood group match
        { bloodGroup: "asc" },
        // Then by last donation (null = never donated, good)
        { lastDonation: "asc" },
      ],
      take: 50, // Get more candidates for ML ranking
    }) as EligibleDonor[];

    if (eligibleDonors.length === 0) {
      return NextResponse.json({
        success: true,
        data: { matches: [], message: "No eligible donors found" },
      });
    }

    // Try ML-based ranking
    const mlRankedDonors = await rankDonorsWithML(
      {
        id: bloodRequest.id,
        bloodGroup: bloodRequest.bloodGroup,
        urgency: bloodRequest.urgency,
        unitsRequired: bloodRequest.unitsRequired,
        hospital: bloodRequest.hospital,
        hospitalCity: bloodRequest.city,  // Map city -> hospitalCity for ML service
        hospitalState: bloodRequest.state, // Map state -> hospitalState for ML service
        requiredBy: bloodRequest.deadline,
      },
      eligibleDonors.map((d) => ({
        id: d.id,
        bloodGroup: d.bloodGroup,
        city: d.city,
        state: d.state,
        lastDonation: d.lastDonation,
        dateOfBirth: d.dateOfBirth,
        gender: d.gender,
        donationCount: d.donationCount,
        isAvailable: d.isAvailable,
      }))
    );

    // Order donors based on ML ranking or use default order
    let orderedDonors = eligibleDonors;
    const matchData: Map<string, { score: number; reason: string; factors: MLMatchFactors | null }> = new Map();

    if (mlRankedDonors && mlRankedDonors.length > 0) {
      // Create a map for quick lookup of ML data
      const mlDataMap = new Map(
        mlRankedDonors.map((d) => [d.donorId, d])
      );

      // Sort eligible donors by ML score
      orderedDonors = [...eligibleDonors].sort((a, b) => {
        const scoreA = mlDataMap.get(a.id)?.matchScore ?? 0;
        const scoreB = mlDataMap.get(b.id)?.matchScore ?? 0;
        return scoreB - scoreA; // Descending order
      });

      // Store scores and factors for match creation
      mlRankedDonors.forEach((d) => matchData.set(d.donorId, {
        score: d.matchScore,
        reason: d.matchReason,
        factors: d.factors || null,
      }));
    }

    // Take top 20 donors
    const topDonors = orderedDonors.slice(0, 20);

    // Create matches with ML data
    const matches = await Promise.all(
      topDonors.map(async (donor, index) => {
        const mlInfo = matchData.get(donor.id);
        
        const match = await prisma.donorMatch.create({
          data: {
            donorId: donor.id,
            bloodRequestId: bloodRequest.id,
            status: "PENDING",
            matchScore: mlInfo?.score ?? null,
            matchReason: mlInfo?.reason ?? null,
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
                dateOfBirth: true,
                donationCount: true,
              },
            },
          },
        });

        // Return enriched match with ML factors
        return {
          ...match,
          rank: index + 1,
          factors: mlInfo?.factors || null,
        };
      })
    );

    // Update request status to MATCHED
    await prisma.bloodRequest.update({
      where: { id },
      data: { status: "MATCHED" },
    });

    // Create ledger entry
    await createLedgerEntry("MATCH_CONFIRMED", bloodRequest.id, "BloodRequest", {
      donorCount: matches.length,
      donorIds: matches.map((m) => m.donorId),
      matchedBy: session.user.id,
    });

    return NextResponse.json({
      success: true,
      data: { 
        matches, 
        message: `Found ${matches.length} eligible donor(s)` 
      },
    });
  } catch (error) {
    console.error("Error matching donors:", error);
    return NextResponse.json(
      { success: false, error: "Failed to match donors" },
      { status: 500 }
    );
  }
}
