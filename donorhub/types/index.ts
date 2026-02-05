import type {
  User,
  Donor,
  BloodRequest,
  DonorMatch,
  HashLedger,
  UserRole,
  BloodGroup,
  UrgencyLevel,
  RequestStatus,
  MatchStatus,
  LedgerEventType,
} from "@prisma/client";

// Re-export Prisma types
export type {
  User,
  Donor,
  BloodRequest,
  DonorMatch,
  HashLedger,
  UserRole,
  BloodGroup,
  UrgencyLevel,
  RequestStatus,
  MatchStatus,
  LedgerEventType,
};

// ==================== API RESPONSE TYPES ====================

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// ==================== EXTENDED TYPES ====================

export interface DonorWithCreator extends Donor {
  createdBy: Pick<User, "id" | "name" | "email">;
}

export interface BloodRequestWithCreator extends BloodRequest {
  createdBy: Pick<User, "id" | "name" | "email">;
  _count?: {
    matches: number;
  };
}

export interface DonorMatchWithRelations extends DonorMatch {
  donor: Pick<Donor, "id" | "firstName" | "lastName" | "bloodGroup" | "phone" | "city">;
  bloodRequest: Pick<BloodRequest, "id" | "patientName" | "bloodGroup" | "hospital" | "urgency">;
  confirmedBy?: Pick<User, "id" | "name"> | null;
}

// HashLedgerEntry uses the base HashLedger type directly
export type HashLedgerEntry = HashLedger;

// ==================== DASHBOARD TYPES ====================

export interface DashboardStats {
  totalDonors: number;
  availableDonors: number;
  totalRequests: number;
  pendingRequests: number;
  matchedRequests: number;
  fulfilledRequests: number;
  totalMatches: number;
  confirmedMatches: number;
}

// ==================== MATCHING TYPES ====================

export interface MatchCandidate {
  donor: Pick<Donor, "id" | "firstName" | "lastName" | "bloodGroup" | "phone" | "city" | "lastDonation" | "isAvailable">;
  score: number;
  reasons: string[];
}

export interface MatchResult {
  bloodRequest: BloodRequest;
  candidates: MatchCandidate[];
}

// ==================== CSV IMPORT TYPES ====================

export interface CsvImportResult {
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

// ==================== FORM FIELD TYPES ====================

export interface SelectOption {
  value: string;
  label: string;
}

export const BLOOD_GROUP_OPTIONS: SelectOption[] = [
  { value: "A_POSITIVE", label: "A+" },
  { value: "A_NEGATIVE", label: "A-" },
  { value: "B_POSITIVE", label: "B+" },
  { value: "B_NEGATIVE", label: "B-" },
  { value: "AB_POSITIVE", label: "AB+" },
  { value: "AB_NEGATIVE", label: "AB-" },
  { value: "O_POSITIVE", label: "O+" },
  { value: "O_NEGATIVE", label: "O-" },
];

export const URGENCY_OPTIONS: SelectOption[] = [
  { value: "CRITICAL", label: "Critical" },
  { value: "HIGH", label: "High" },
  { value: "MEDIUM", label: "Medium" },
  { value: "LOW", label: "Low" },
];

export const STATUS_OPTIONS: SelectOption[] = [
  { value: "PENDING", label: "Pending" },
  { value: "MATCHED", label: "Matched" },
  { value: "FULFILLED", label: "Fulfilled" },
  { value: "CANCELLED", label: "Cancelled" },
];

export const GENDER_OPTIONS: SelectOption[] = [
  { value: "Male", label: "Male" },
  { value: "Female", label: "Female" },
  { value: "Other", label: "Other" },
];

export const INDIAN_STATES: SelectOption[] = [
  { value: "Andhra Pradesh", label: "Andhra Pradesh" },
  { value: "Arunachal Pradesh", label: "Arunachal Pradesh" },
  { value: "Assam", label: "Assam" },
  { value: "Bihar", label: "Bihar" },
  { value: "Chhattisgarh", label: "Chhattisgarh" },
  { value: "Goa", label: "Goa" },
  { value: "Gujarat", label: "Gujarat" },
  { value: "Haryana", label: "Haryana" },
  { value: "Himachal Pradesh", label: "Himachal Pradesh" },
  { value: "Jharkhand", label: "Jharkhand" },
  { value: "Karnataka", label: "Karnataka" },
  { value: "Kerala", label: "Kerala" },
  { value: "Madhya Pradesh", label: "Madhya Pradesh" },
  { value: "Maharashtra", label: "Maharashtra" },
  { value: "Manipur", label: "Manipur" },
  { value: "Meghalaya", label: "Meghalaya" },
  { value: "Mizoram", label: "Mizoram" },
  { value: "Nagaland", label: "Nagaland" },
  { value: "Odisha", label: "Odisha" },
  { value: "Punjab", label: "Punjab" },
  { value: "Rajasthan", label: "Rajasthan" },
  { value: "Sikkim", label: "Sikkim" },
  { value: "Tamil Nadu", label: "Tamil Nadu" },
  { value: "Telangana", label: "Telangana" },
  { value: "Tripura", label: "Tripura" },
  { value: "Uttar Pradesh", label: "Uttar Pradesh" },
  { value: "Uttarakhand", label: "Uttarakhand" },
  { value: "West Bengal", label: "West Bengal" },
  { value: "Delhi", label: "Delhi" },
];
