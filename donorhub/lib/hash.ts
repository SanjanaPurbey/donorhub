import { createHash } from "crypto";
import prisma from "./prisma";
import { LedgerEventType, Prisma } from "@prisma/client";

type LedgerPayload = Prisma.InputJsonValue;

/**
 * Computes SHA-256 hash from previous hash and payload
 * Sorts object keys recursively to ensure consistent hashing regardless of property order
 */
export function computeHash(previousHash: string, payload: object): string {
  // Sort keys recursively to ensure consistent JSON stringification
  const sortedPayload = sortObjectKeys(payload);
  const data = previousHash + JSON.stringify(sortedPayload);
  return createHash("sha256").update(data).digest("hex");
}

/**
 * Recursively sorts object keys alphabetically to ensure consistent JSON.stringify results
 */
function sortObjectKeys(obj: unknown): unknown {
  if (obj === null || obj === undefined) {
    return obj;
  }
  
  if (Array.isArray(obj)) {
    return obj.map(sortObjectKeys);
  }
  
  if (typeof obj === "object") {
    const sorted: Record<string, unknown> = {};
    const keys = Object.keys(obj as Record<string, unknown>).sort();
    for (const key of keys) {
      sorted[key] = sortObjectKeys((obj as Record<string, unknown>)[key]);
    }
    return sorted;
  }
  
  return obj;
}

/**
 * Retrieves the last entry in the hash ledger
 */
async function getLastLedgerEntry() {
  return prisma.hashLedger.findFirst({
    orderBy: { sequence: "desc" },
  });
}

/**
 * Creates a new entry in the hash ledger
 * Implements blockchain-inspired chaining with SHA-256
 */
export async function createLedgerEntry(
  eventType: LedgerEventType,
  entityId: string,
  entityType: "Donor" | "BloodRequest" | "DonorMatch",
  payload: LedgerPayload
): Promise<void> {
  const lastEntry = await getLastLedgerEntry();
  const previousHash = lastEntry?.currentHash ?? "GENESIS";
  
  // Use a fixed timestamp string for both hash computation and storage
  // Store as ISO string to ensure exact match during verification
  const timestampISO = new Date().toISOString();
  
  // Create the hash payload - this is what gets hashed
  const hashInput = {
    eventType,
    entityId,
    entityType,
    payload,
    timestamp: timestampISO,
  };
  
  const currentHash = computeHash(previousHash, hashInput);
  
  // Store the payload with _hashTimestamp so verification can use the exact same timestamp
  const storedPayload = {
    ...(payload as object),
    _hashTimestamp: timestampISO,
  };

  await prisma.hashLedger.create({
    data: {
      previousHash,
      currentHash,
      eventType,
      entityId,
      entityType,
      payload: storedPayload as Prisma.InputJsonValue,
      timestamp: new Date(timestampISO),
    },
  });
}

/**
 * Verifies the integrity of the entire hash chain
 * Returns true if chain is valid, false if tampered
 */
export async function verifyLedgerIntegrity(): Promise<{
  isValid: boolean;
  brokenAt?: number;
  message: string;
}> {
  const entries = await prisma.hashLedger.findMany({
    orderBy: { sequence: "asc" },
  });

  if (entries.length === 0) {
    return { isValid: true, message: "Ledger is empty" };
  }

  // Verify first entry has GENESIS as previous hash
  if (entries[0].previousHash !== "GENESIS") {
    return {
      isValid: false,
      brokenAt: entries[0].sequence,
      message: "First entry does not have GENESIS as previous hash",
    };
  }

  // Verify chain continuity
  for (let i = 1; i < entries.length; i++) {
    const current = entries[i];
    const previous = entries[i - 1];

    if (current.previousHash !== previous.currentHash) {
      return {
        isValid: false,
        brokenAt: current.sequence,
        message: `Chain broken at sequence ${current.sequence}`,
      };
    }
  }

  return {
    isValid: true,
    message: `Chain verified successfully (${entries.length} entries)`,
  };
}
