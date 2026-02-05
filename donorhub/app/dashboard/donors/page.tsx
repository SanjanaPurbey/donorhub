"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useSession } from "next-auth/react";
import {
  Plus,
  Pencil,
  Trash2,
  Upload,
  Download,
  Search,
  Filter,
  ChevronUp,
  ChevronDown,
  Phone,
  Mail,
  MapPin,
  Calendar,
  Droplet,
  X,
  Eye,
  User,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Modal, ConfirmModal } from "@/components/ui/modal";
import { Badge } from "@/components/ui/badge";
import { Pagination } from "@/components/ui/pagination";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface Donor {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  bloodGroup: string;
  dateOfBirth: string;
  gender: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
  isAvailable: boolean;
  lastDonation: string | null;
  medicalNotes: string | null;
  createdAt: string;
  deletedAt?: string | null;
  createdBy?: {
    id: string;
    name: string;
    email: string;
  };
}

interface PaginationData {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

interface ImportResult {
  success: number;
  failed: number;
  duplicates: number;
  errors: Array<{ row: number; error: string }>;
}

type SortField = "firstName" | "lastName" | "bloodGroup" | "city" | "createdAt";
type SortOrder = "asc" | "desc";

const bloodGroupOptions = [
  { value: "", label: "All Blood Groups" },
  { value: "A_POSITIVE", label: "A+" },
  { value: "A_NEGATIVE", label: "A−" },
  { value: "B_POSITIVE", label: "B+" },
  { value: "B_NEGATIVE", label: "B−" },
  { value: "AB_POSITIVE", label: "AB+" },
  { value: "AB_NEGATIVE", label: "AB−" },
  { value: "O_POSITIVE", label: "O+" },
  { value: "O_NEGATIVE", label: "O−" },
];

const bloodGroupDisplay: Record<string, string> = {
  A_POSITIVE: "A+",
  A_NEGATIVE: "A−",
  B_POSITIVE: "B+",
  B_NEGATIVE: "B−",
  AB_POSITIVE: "AB+",
  AB_NEGATIVE: "AB−",
  O_POSITIVE: "O+",
  O_NEGATIVE: "O−",
};

const availabilityOptions = [
  { value: "", label: "All" },
  { value: "true", label: "Available" },
  { value: "false", label: "Unavailable" },
];

export default function DonorsPage() {
  const { data: session } = useSession();
  const [donors, setDonors] = useState<Donor[]>([]);
  const [pagination, setPagination] = useState<PaginationData>({
    page: 1,
    limit: 10,
    total: 0,
    totalPages: 0,
  });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [sortBy, setSortBy] = useState<SortField>("createdAt");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");
  const [bloodGroupFilter, setBloodGroupFilter] = useState("");
  const [availabilityFilter, setAvailabilityFilter] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  
  // Tab state: "active" or "deleted"
  const [activeTab, setActiveTab] = useState<"active" | "deleted">("active");

  // Modal states
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showRestoreModal, setShowRestoreModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [selectedDonor, setSelectedDonor] = useState<Donor | null>(null);
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [matchInvalidatedMessage, setMatchInvalidatedMessage] = useState("");
  
  // Deleted donor conflict state (when trying to add donor that was deleted)
  const [deletedDonorConflict, setDeletedDonorConflict] = useState<{
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    bloodGroup: string;
    deletedAt: string;
  } | null>(null);

  // Import state
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importResult, setImportResult] = useState<{
    success: number;
    failed: number;
    duplicates: number;
    errors: Array<{ row: number; email?: string; phone?: string; error: string }>;
  } | null>(null);
  
  // Import progress state for live updates
  const [importProgress, setImportProgress] = useState<{
    total: number;
    processed: number;
    currentName: string;
    logs: Array<{ name: string; status: "success" | "duplicate" | "failed"; message?: string }>;
  } | null>(null);
  const importLogRef = useRef<HTMLDivElement>(null);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const fetchDonors = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(pagination.page),
        limit: String(pagination.limit),
        sortBy,
        sortOrder,
      });

      if (debouncedSearch) params.set("search", debouncedSearch);
      if (bloodGroupFilter) params.set("bloodGroup", bloodGroupFilter);
      if (availabilityFilter) params.set("isAvailable", availabilityFilter);
      
      // Add deleted filter for the deleted tab
      if (activeTab === "deleted") {
        params.set("deleted", "true");
      }

      const response = await fetch(`/api/donors?${params}`);
      const data = await response.json();

      if (data.success) {
        setDonors(data.data);
        setPagination(data.pagination);
      }
    } catch (error) {
      console.error("Failed to fetch donors:", error);
    } finally {
      setLoading(false);
    }
  }, [pagination.page, pagination.limit, sortBy, sortOrder, debouncedSearch, bloodGroupFilter, availabilityFilter, activeTab]);

  useEffect(() => {
    fetchDonors();
  }, [fetchDonors]);

  // Reset pagination when switching tabs
  useEffect(() => {
    setPagination(prev => ({ ...prev, page: 1 }));
  }, [activeTab]);

  const handleSort = (field: SortField) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortBy(field);
      setSortOrder("asc");
    }
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortBy !== field) return null;
    return sortOrder === "asc" ? (
      <ChevronUp className="h-4 w-4" />
    ) : (
      <ChevronDown className="h-4 w-4" />
    );
  };

  const handleCreateDonor = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setFormError("");
    setSubmitting(true);

    const formData = new FormData(e.currentTarget);
    const data = {
      firstName: formData.get("firstName") as string,
      lastName: formData.get("lastName") as string,
      email: formData.get("email") as string,
      phone: formData.get("phone") as string,
      bloodGroup: formData.get("bloodGroup") as string,
      dateOfBirth: formData.get("dateOfBirth") as string,
      gender: formData.get("gender") as string,
      address: formData.get("address") as string,
      city: formData.get("city") as string,
      state: formData.get("state") as string,
      pincode: formData.get("pincode") as string,
      isAvailable: formData.get("isAvailable") === "true",
      lastDonation: (formData.get("lastDonation") as string) || undefined,
      medicalNotes: (formData.get("medicalNotes") as string) || undefined,
    };

    try {
      const response = await fetch("/api/donors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      const result = await response.json();

      if (result.success) {
        setShowCreateModal(false);
        setDeletedDonorConflict(null);
        fetchDonors();
      } else if (result.code === "DELETED_DONOR_EXISTS" && result.deletedDonor) {
        // Show prompt to restore the deleted donor
        setDeletedDonorConflict(result.deletedDonor);
        setShowCreateModal(false);
      } else {
        setFormError(result.error || "Failed to create donor");
      }
    } catch {
      setFormError("An error occurred");
    } finally {
      setSubmitting(false);
    }
  };

  // Handle restoring a donor
  const handleRestoreDonor = async (donorId: string) => {
    setSubmitting(true);
    try {
      const response = await fetch(`/api/donors/${donorId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isAvailable: true }),
      });

      const result = await response.json();

      if (result.success) {
        setDeletedDonorConflict(null);
        setShowRestoreModal(false);
        setSelectedDonor(null);
        // Switch to active tab to show restored donor
        setActiveTab("active");
        fetchDonors();
      } else {
        setFormError(result.error || "Failed to restore donor");
      }
    } catch {
      setFormError("An error occurred while restoring");
    } finally {
      setSubmitting(false);
    }
  };

  const handleEditDonor = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!selectedDonor) return;

    setFormError("");
    setSubmitting(true);

    const formData = new FormData(e.currentTarget);
    const data = {
      firstName: formData.get("firstName") as string,
      lastName: formData.get("lastName") as string,
      email: formData.get("email") as string,
      phone: formData.get("phone") as string,
      bloodGroup: formData.get("bloodGroup") as string,
      dateOfBirth: formData.get("dateOfBirth") as string,
      gender: formData.get("gender") as string,
      address: formData.get("address") as string,
      city: formData.get("city") as string,
      state: formData.get("state") as string,
      pincode: formData.get("pincode") as string,
      isAvailable: formData.get("isAvailable") === "true",
      lastDonation: (formData.get("lastDonation") as string) || null,
      medicalNotes: (formData.get("medicalNotes") as string) || null,
    };

    try {
      const response = await fetch(`/api/donors/${selectedDonor.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      const result = await response.json();

      if (result.success) {
        setShowEditModal(false);
        setSelectedDonor(null);
        fetchDonors();
        
        // Show notification if matches were invalidated
        if (result.matchesInvalidated) {
          setMatchInvalidatedMessage(
            `Donor updated. ${result.affectedRequestCount} blood request${result.affectedRequestCount > 1 ? 's' : ''} affected. Please re-run matching from the Requests page.`
          );
          setTimeout(() => setMatchInvalidatedMessage(""), 8000);
        }
      } else {
        setFormError(result.error || "Failed to update donor");
      }
    } catch {
      setFormError("An error occurred");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteDonor = async () => {
    if (!selectedDonor) return;
    setSubmitting(true);

    try {
      const response = await fetch(`/api/donors/${selectedDonor.id}`, {
        method: "DELETE",
      });

      const result = await response.json();

      if (result.success) {
        setShowDeleteModal(false);
        setSelectedDonor(null);
        fetchDonors();
      }
    } catch (error) {
      console.error("Failed to delete donor:", error);
    } finally {
      setSubmitting(false);
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImportResult(null);
    setImportProgress(null);

    // Parse CSV (handles quoted fields with commas)
    const parseCSVLine = (line: string): string[] => {
      const result: string[] = [];
      let current = "";
      let inQuotes = false;
      
      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
          inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
          result.push(current.trim().replace(/^["']|["']$/g, ""));
          current = "";
        } else {
          current += char;
        }
      }
      result.push(current.trim().replace(/^["']|["']$/g, ""));
      return result;
    };

    const text = await file.text();
    const lines = text.split("\n").filter((line) => line.trim());
    if (lines.length < 2) {
      setImportResult({
        success: 0,
        failed: 0,
        duplicates: 0,
        errors: [{ row: 0, error: "CSV file is empty or has no data rows" }],
      });
      return;
    }

    const headers = parseCSVLine(lines[0]).map((h) => h.toLowerCase());
    const rows: Record<string, string>[] = [];

    // Expected headers (case-insensitive)
    const headerMap: Record<string, string> = {
      firstname: "firstName",
      first_name: "firstName",
      "first name": "firstName",
      lastname: "lastName",
      last_name: "lastName",
      "last name": "lastName",
      email: "email",
      phone: "phone",
      bloodgroup: "bloodGroup",
      blood_group: "bloodGroup",
      "blood group": "bloodGroup",
      dateofbirth: "dateOfBirth",
      date_of_birth: "dateOfBirth",
      "date of birth": "dateOfBirth",
      dob: "dateOfBirth",
      gender: "gender",
      address: "address",
      city: "city",
      state: "state",
      pincode: "pincode",
      zip: "pincode",
      zipcode: "pincode",
      isavailable: "isAvailable",
      available: "isAvailable",
      lastdonation: "lastDonation",
      last_donation: "lastDonation",
      "last donation": "lastDonation",
      medicalnotes: "medicalNotes",
      medical_notes: "medicalNotes",
      notes: "medicalNotes",
    };

    const mappedHeaders = headers.map(
      (h) => headerMap[h.replace(/['"]/g, "").toLowerCase()] || h
    );

    for (let i = 1; i < lines.length; i++) {
      const values = parseCSVLine(lines[i]);
      const row: Record<string, string> = {};
      mappedHeaders.forEach((header, idx) => {
        row[header] = values[idx] || "";
      });
      rows.push(row);
    }

    // Initialize progress with phase indicator
    setImportProgress({
      total: rows.length,
      processed: 0,
      currentName: "Starting import...",
      logs: [],
    });

    try {
      setSubmitting(true);

      // Use EventSource for Server-Sent Events (streaming)
      const response = await fetch("/api/donors/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows }),
      });

      if (!response.ok || !response.body) {
        throw new Error("Failed to start import");
      }

      // Process the stream
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      const logs: Array<{ name: string; status: "success" | "duplicate" | "failed"; message?: string }> = [];
      let finalResult: ImportResult | null = null;

      while (true) {
        const { done, value } = await reader.read();
        
        if (done) break;

        // Decode the chunk and add to buffer
        buffer += decoder.decode(value, { stream: true });
        
        // Process complete messages (ending with \n\n)
        const messages = buffer.split("\n\n");
        buffer = messages.pop() || ""; // Keep incomplete message in buffer

        for (const message of messages) {
          if (!message.trim() || !message.startsWith("data: ")) continue;
          
          try {
            const data = JSON.parse(message.substring(6)); // Remove "data: " prefix
            
            switch (data.type) {
              case "start":
                setImportProgress(prev => prev ? { ...prev, total: data.total } : null);
                break;

              case "phase":
                const phaseText = data.phase === "validating" ? "Validating data..." :
                                data.phase === "inserting" ? `Inserting ${data.validCount} donors...` :
                                data.phase === "ledger" ? "Creating ledger entries..." : "Processing...";
                setImportProgress(prev => prev ? { ...prev, currentName: phaseText } : null);
                break;

              case "success":
                logs.push({ name: data.name, status: "success" });
                setImportProgress(prev => prev ? {
                  ...prev,
                  processed: data.processed,
                  currentName: data.name,
                  logs: [...logs],
                } : null);
                break;

              case "error":
                logs.push({ name: data.name, status: "failed", message: data.error });
                setImportProgress(prev => prev ? {
                  ...prev,
                  processed: data.processed || prev.processed + 1,
                  currentName: data.name,
                  logs: [...logs],
                } : null);
                break;

              case "duplicate":
                logs.push({ name: data.name, status: "duplicate", message: data.error });
                setImportProgress(prev => prev ? {
                  ...prev,
                  processed: data.processed || prev.processed + 1,
                  currentName: data.name,
                  logs: [...logs],
                } : null);
                break;

              case "complete":
                finalResult = data.result;
                setImportProgress(prev => prev ? {
                  ...prev,
                  processed: rows.length,
                  currentName: "Complete",
                  logs: [...logs],
                } : null);
                break;

              case "error":
                throw new Error(data.error);
            }

            // Auto-scroll to bottom
            setTimeout(() => {
              importLogRef.current?.scrollTo({
                top: importLogRef.current.scrollHeight,
                behavior: "smooth",
              });
            }, 10);
          } catch (e) {
            console.error("Error parsing SSE message:", e);
          }
        }
      }

      // Set final result
      if (finalResult) {
        setImportResult(finalResult);
        if (finalResult.success > 0) {
          fetchDonors();
        }
      }
    } catch (error) {
      console.error("Import error:", error);
      setImportResult({
        success: 0,
        failed: rows.length,
        duplicates: 0,
        errors: [{ row: 0, error: error instanceof Error ? error.message : "Failed to import donors" }],
      });
      setImportProgress(null);
    } finally {
      setSubmitting(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const downloadTemplate = () => {
    const headers = [
      "firstName",
      "lastName",
      "email",
      "phone",
      "bloodGroup",
      "dateOfBirth",
      "gender",
      "address",
      "city",
      "state",
      "pincode",
      "isAvailable",
      "lastDonation",
      "medicalNotes",
    ];
    const exampleRow = [
      "John",
      "Doe",
      "john.doe@example.com",
      "9876543210",
      "O+",
      "1990-01-15",
      "Male",
      "123 Main St",
      "Mumbai",
      "Maharashtra",
      "400001",
      "true",
      "2024-01-01",
      "No allergies",
    ];

    const csv = [headers.join(","), exampleRow.join(",")].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "donor_import_template.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-IN", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const DonorForm = ({ donor, onSubmit }: { donor?: Donor; onSubmit: (e: React.FormEvent<HTMLFormElement>) => void }) => (
    <form onSubmit={onSubmit} className="space-y-6">
      {formError && (
        <div className="bg-red-50 text-red-700 px-4 py-3 rounded-lg text-sm">
          {formError}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <Input
          label="First Name"
          name="firstName"
          defaultValue={donor?.firstName}
          required
        />
        <Input
          label="Last Name"
          name="lastName"
          defaultValue={donor?.lastName}
          required
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Input
          label="Email"
          name="email"
          type="email"
          defaultValue={donor?.email}
          required
        />
        <Input
          label="Phone"
          name="phone"
          defaultValue={donor?.phone}
          required
        />
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Select
          label="Blood Group"
          name="bloodGroup"
          defaultValue={donor?.bloodGroup || ""}
          options={bloodGroupOptions.slice(1)}
          required
        />
        <Input
          label="Date of Birth"
          name="dateOfBirth"
          type="date"
          defaultValue={donor?.dateOfBirth?.split("T")[0]}
          required
        />
        <Select
          label="Gender"
          name="gender"
          defaultValue={donor?.gender || ""}
          options={[
            { value: "Male", label: "Male" },
            { value: "Female", label: "Female" },
            { value: "Other", label: "Other" },
          ]}
          required
        />
      </div>

      <Input
        label="Address"
        name="address"
        defaultValue={donor?.address}
        required
      />

      <div className="grid grid-cols-3 gap-4">
        <Input
          label="City"
          name="city"
          defaultValue={donor?.city}
          required
        />
        <Input
          label="State"
          name="state"
          defaultValue={donor?.state}
          required
        />
        <Input
          label="Pincode"
          name="pincode"
          defaultValue={donor?.pincode}
          required
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Select
          label="Availability"
          name="isAvailable"
          defaultValue={donor?.isAvailable === false ? "false" : "true"}
          options={[
            { value: "true", label: "Available" },
            { value: "false", label: "Unavailable" },
          ]}
        />
        <Input
          label="Last Donation Date"
          name="lastDonation"
          type="date"
          defaultValue={donor?.lastDonation?.split("T")[0]}
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Medical Notes
        </label>
        <textarea
          name="medicalNotes"
          rows={3}
          defaultValue={donor?.medicalNotes || ""}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500"
          placeholder="Any relevant medical information..."
        />
      </div>

      <div className="flex justify-end gap-3 pt-4 border-t">
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            setShowCreateModal(false);
            setShowEditModal(false);
            setSelectedDonor(null);
            setFormError("");
          }}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={submitting}>
          {submitting ? "Saving..." : donor ? "Update Donor" : "Add Donor"}
        </Button>
      </div>
    </form>
  );

  return (
    <div className="p-6 lg:p-8">
      <div className="space-y-6">
      {/* Match Invalidation Notification */}
      {matchInvalidatedMessage && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 rounded-lg flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-amber-600" />
            <span className="text-sm font-medium">{matchInvalidatedMessage}</span>
          </div>
          <button
            onClick={() => setMatchInvalidatedMessage("")}
            className="text-amber-600 hover:text-amber-800"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Donor Management</h1>
          <p className="text-slate-500 mt-1">
            Manage blood donors and their information
          </p>
        </div>
        <div className="flex items-center gap-3">
          {session?.user.role === "SYSTEM_ADMIN" && activeTab === "active" && (
            <Button
              variant="outline"
              onClick={() => setShowImportModal(true)}
            >
              <Upload className="h-4 w-4 mr-2" />
              Import CSV
            </Button>
          )}
          {activeTab === "active" && (
            <Button onClick={() => setShowCreateModal(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Add Donor
            </Button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200">
        <button
          onClick={() => setActiveTab("active")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors cursor-pointer ${
            activeTab === "active"
              ? "border-red-500 text-red-600"
              : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
          }`}
        >
          Active Donors
        </button>
        <button
          onClick={() => setActiveTab("deleted")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors cursor-pointer ${
            activeTab === "deleted"
              ? "border-red-500 text-red-600"
              : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
          }`}
        >
          <Trash2 className="h-4 w-4 inline mr-1" />
          Deleted Donors
        </button>
      </div>

      {/* Search and Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search by name, email, phone, or city..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500"
              />
            </div>
            <Button
              variant="outline"
              onClick={() => setShowFilters(!showFilters)}
            >
              <Filter className="h-4 w-4 mr-2" />
              Filters
              {(bloodGroupFilter || availabilityFilter) && (
                <span className="ml-2 bg-red-100 text-red-700 px-2 py-0.5 rounded-full text-xs">
                  {[bloodGroupFilter, availabilityFilter].filter(Boolean).length}
                </span>
              )}
            </Button>
          </div>

          {showFilters && (
            <div className="mt-4 pt-4 border-t flex items-end gap-4">
              <div className="w-48">
                <Select
                  label="Blood Group"
                  value={bloodGroupFilter}
                  onChange={(e) => setBloodGroupFilter(e.target.value)}
                  options={bloodGroupOptions}
                />
              </div>
              <div className="w-40">
                <Select
                  label="Availability"
                  value={availabilityFilter}
                  onChange={(e) => setAvailabilityFilter(e.target.value)}
                  options={availabilityOptions}
                />
              </div>
              {(bloodGroupFilter || availabilityFilter) && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setBloodGroupFilter("");
                    setAvailabilityFilter("");
                  }}
                >
                  <X className="h-4 w-4 mr-1" />
                  Clear
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Donors Table - Compact Design */}
      <Card className="shadow-sm overflow-hidden">
        <CardHeader className="border-b border-slate-200 bg-slate-50/50">
          <CardTitle className="text-base">
            {activeTab === "deleted" ? "Deleted Donors" : "Donors"} ({pagination.total})
          </CardTitle>
        </CardHeader>
        
        {loading ? (
          <div className="p-16 text-center">
            <div className="flex items-center justify-center gap-3 text-slate-500">
              <div className="h-5 w-5 border-2 border-rose-500 border-t-transparent rounded-full animate-spin" />
              Loading donors...
            </div>
          </div>
        ) : donors.length === 0 ? (
          <div className="p-16 text-center">
            <div className="text-slate-500">
              <Droplet className="h-12 w-12 mx-auto text-slate-300 mb-4" />
              <p className="font-medium text-slate-700">No donors found</p>
              <p className="text-sm mt-1">
                {search || bloodGroupFilter || availabilityFilter
                  ? "Try adjusting your filters"
                  : "Get started by adding your first donor"}
              </p>
            </div>
          </div>
        ) : (
          <>
            {/* Compact Table Header */}
            <div className={`bg-slate-100 px-4 py-2.5 grid gap-2 text-xs font-semibold text-slate-600 uppercase tracking-wider border-b border-slate-200 ${
              activeTab === "deleted" ? "grid-cols-10" : "grid-cols-12"
            }`}>
              <div 
                className="col-span-1 cursor-pointer hover:text-slate-900 flex items-center gap-1"
                onClick={() => handleSort("bloodGroup")}
              >
                Blood <SortIcon field="bloodGroup" />
              </div>
              <div 
                className="col-span-2 cursor-pointer hover:text-slate-900 flex items-center gap-1"
                onClick={() => handleSort("firstName")}
              >
                Name <SortIcon field="firstName" />
              </div>
              <div className="col-span-2">Contact</div>
              <div 
                className="col-span-2 cursor-pointer hover:text-slate-900 flex items-center gap-1"
                onClick={() => handleSort("city")}
              >
                Location <SortIcon field="city" />
              </div>
              {activeTab === "deleted" ? (
                <div className="col-span-2">Deleted At</div>
              ) : (
                <>
                  <div className="col-span-1 text-center">Status</div>
                  <div className="col-span-2">Last Donation</div>
                </>
              )}
              <div className={`text-right ${activeTab === "deleted" ? "col-span-1" : "col-span-2"}`}>Actions</div>
            </div>

            {/* Compact Donor Rows */}
            <div className="divide-y divide-slate-100">
              {donors.map((donor) => (
                <div
                  key={donor.id}
                  className={`grid gap-2 px-4 py-2.5 items-center hover:bg-slate-50 cursor-pointer transition-colors group ${
                    activeTab === "deleted" ? "grid-cols-10 bg-slate-50/50" : "grid-cols-12"
                  }`}
                  onClick={() => {
                    setSelectedDonor(donor);
                    setShowDetailModal(true);
                  }}
                >
                  {/* Blood Group */}
                  <div className="col-span-1">
                    <Badge 
                      variant={activeTab === "deleted" ? "secondary" : "primary"} 
                      className="font-bold text-xs px-1.5 py-0.5"
                    >
                      {bloodGroupDisplay[donor.bloodGroup] || donor.bloodGroup}
                    </Badge>
                  </div>

                  {/* Name */}
                  <div className="col-span-2 min-w-0">
                    <div className={`font-medium text-sm truncate transition-colors ${
                      activeTab === "deleted" ? "text-slate-500" : "text-slate-900 group-hover:text-rose-600"
                    }`}>
                      {donor.firstName} {donor.lastName}
                    </div>
                    <div className="text-xs text-slate-500">
                      {donor.gender} • {formatDate(donor.dateOfBirth)}
                    </div>
                  </div>

                  {/* Contact */}
                  <div className="col-span-2 min-w-0">
                    <div className="text-sm text-slate-700 truncate flex items-center gap-1">
                      <Mail className="h-3 w-3 text-slate-400 shrink-0" />
                      {donor.email}
                    </div>
                    <div className="text-xs text-slate-500 flex items-center gap-1">
                      <Phone className="h-3 w-3 text-slate-400 shrink-0" />
                      {donor.phone}
                    </div>
                  </div>

                  {/* Location */}
                  <div className="col-span-2 min-w-0">
                    <div className="text-sm text-slate-700 truncate flex items-center gap-1">
                      <MapPin className="h-3 w-3 text-slate-400 shrink-0" />
                      {donor.city}, {donor.state}
                    </div>
                    <div className="text-xs text-slate-500">{donor.pincode}</div>
                  </div>

                  {activeTab === "deleted" ? (
                    <div className="col-span-2 text-sm text-slate-500">
                      {donor.deletedAt ? formatDate(donor.deletedAt) : "Unknown"}
                    </div>
                  ) : (
                    <>
                      {/* Status */}
                      <div className="col-span-1 text-center">
                        <Badge variant={donor.isAvailable ? "success" : "secondary"} size="sm" className="text-[10px]">
                          {donor.isAvailable ? "Available" : "Unavailable"}
                        </Badge>
                      </div>

                      {/* Last Donation */}
                      <div className="col-span-2">
                        {donor.lastDonation ? (
                          <div className="flex items-center gap-1 text-sm text-slate-700">
                            <Calendar className="h-3.5 w-3.5 text-slate-400" />
                            {formatDate(donor.lastDonation)}
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400">Never donated</span>
                        )}
                      </div>
                    </>
                  )}

                  {/* Actions */}
                  <div className={`flex items-center justify-end gap-1 ${activeTab === "deleted" ? "col-span-1" : "col-span-2"}`} onClick={(e) => e.stopPropagation()}>
                    {activeTab === "deleted" ? (
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-green-600 hover:text-green-700 hover:bg-green-50 h-7 text-xs px-2"
                        onClick={() => {
                          setSelectedDonor(donor);
                          setShowRestoreModal(true);
                        }}
                      >
                        Restore
                      </Button>
                    ) : (
                      <>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0"
                          onClick={() => {
                            setSelectedDonor(donor);
                            setShowEditModal(true);
                          }}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-red-600 hover:text-red-700 hover:bg-red-50 h-7 w-7 p-0"
                          onClick={() => {
                            setSelectedDonor(donor);
                            setShowDeleteModal(true);
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-slate-500 hover:bg-slate-100 h-7 w-7 p-0"
                      onClick={() => {
                        setSelectedDonor(donor);
                        setShowDetailModal(true);
                      }}
                      title="View Details"
                    >
                      <Eye className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {!loading && donors.length > 0 && (
          <div className="p-4 border-t border-slate-200 bg-slate-50/50">
            <Pagination
              currentPage={pagination.page}
              totalPages={pagination.totalPages}
              onPageChange={(page) =>
                setPagination((prev) => ({ ...prev, page }))
              }
            />
          </div>
        )}
      </Card>

      {/* Donor Detail Modal */}
      <Modal
        isOpen={showDetailModal}
        onClose={() => {
          setShowDetailModal(false);
          setSelectedDonor(null);
        }}
        title="Donor Details"
        size="lg"
      >
        {selectedDonor && (
          <div className="space-y-6">
            {/* Donor Header */}
            <div className="flex items-start gap-4 p-4 bg-slate-50 rounded-xl border border-slate-200">
              <Badge variant={activeTab === "deleted" ? "secondary" : "primary"} className="font-bold text-2xl px-4 py-2">
                {bloodGroupDisplay[selectedDonor.bloodGroup] || selectedDonor.bloodGroup}
              </Badge>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3">
                  <h3 className="text-xl font-semibold text-slate-900">
                    {selectedDonor.firstName} {selectedDonor.lastName}
                  </h3>
                  <Badge variant={selectedDonor.isAvailable ? "success" : "secondary"}>
                    {selectedDonor.isAvailable ? "Available" : "Unavailable"}
                  </Badge>
                  {activeTab === "deleted" && (
                    <Badge variant="danger">Deleted</Badge>
                  )}
                </div>
                <div className="flex items-center gap-4 mt-2 text-sm text-slate-600">
                  <span>{selectedDonor.gender}</span>
                  <span>•</span>
                  <span>Born {formatDate(selectedDonor.dateOfBirth)}</span>
                </div>
              </div>
            </div>

            {/* Info Grid */}
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 bg-white rounded-lg border border-slate-200">
                <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                  <User className="h-3.5 w-3.5" />
                  Contact Information
                </h4>
                <div className="space-y-2.5">
                  <div className="flex items-center gap-2 text-sm">
                    <Phone className="h-4 w-4 text-slate-400" />
                    <span className="text-slate-700">{selectedDonor.phone}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <Mail className="h-4 w-4 text-slate-400" />
                    <span className="text-slate-700">{selectedDonor.email}</span>
                  </div>
                </div>
              </div>

              <div className="p-4 bg-white rounded-lg border border-slate-200">
                <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5" />
                  Address
                </h4>
                <div className="space-y-1 text-sm text-slate-700">
                  <div>{selectedDonor.address}</div>
                  <div>{selectedDonor.city}, {selectedDonor.state}</div>
                  <div className="text-slate-500">{selectedDonor.pincode}</div>
                </div>
              </div>
            </div>

            {/* Donation Info */}
            <div className="p-4 bg-white rounded-lg border border-slate-200">
              <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                <Droplet className="h-3.5 w-3.5" />
                Donation History
              </h4>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-slate-500">Last Donation</span>
                  <div className="font-medium text-slate-900 mt-1">
                    {selectedDonor.lastDonation 
                      ? formatDate(selectedDonor.lastDonation)
                      : "Never donated"}
                  </div>
                </div>
                <div>
                  <span className="text-slate-500">Registered</span>
                  <div className="font-medium text-slate-900 mt-1">
                    {formatDate(selectedDonor.createdAt)}
                  </div>
                </div>
              </div>
            </div>

            {/* Medical Notes */}
            {selectedDonor.medicalNotes && (
              <div className="p-4 bg-white rounded-lg border border-slate-200">
                <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                  Medical Notes
                </h4>
                <p className="text-sm text-slate-700 leading-relaxed">
                  {selectedDonor.medicalNotes}
                </p>
              </div>
            )}

            {/* Deleted Info */}
            {activeTab === "deleted" && selectedDonor.deletedAt && (
              <div className="p-4 bg-red-50 rounded-lg border border-red-200">
                <h4 className="text-xs font-semibold text-red-700 uppercase tracking-wider mb-2">
                  Deletion Information
                </h4>
                <p className="text-sm text-red-700">
                  This donor was deleted on {formatDate(selectedDonor.deletedAt)}
                </p>
              </div>
            )}

            {/* Modal Actions */}
            <div className="flex justify-between items-center pt-4 border-t border-slate-200">
              <div className="flex gap-2">
                {activeTab === "deleted" ? (
                  <Button
                    size="sm"
                    className="bg-green-600 hover:bg-green-700"
                    onClick={() => {
                      setShowDetailModal(false);
                      setShowRestoreModal(true);
                    }}
                  >
                    Restore Donor
                  </Button>
                ) : (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setShowDetailModal(false);
                        setShowEditModal(true);
                      }}
                    >
                      <Pencil className="h-4 w-4 mr-1.5" />
                      Edit
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-red-600 border-red-200 hover:bg-red-50"
                      onClick={() => {
                        setShowDetailModal(false);
                        setShowDeleteModal(true);
                      }}
                    >
                      <Trash2 className="h-4 w-4 mr-1.5" />
                      Delete
                    </Button>
                  </>
                )}
              </div>
              <Button
                variant="outline"
                onClick={() => {
                  setShowDetailModal(false);
                  setSelectedDonor(null);
                }}
              >
                Close
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Create Modal */}
      <Modal
        isOpen={showCreateModal}
        onClose={() => {
          setShowCreateModal(false);
          setFormError("");
        }}
        title="Add New Donor"
        size="lg"
      >
        <DonorForm onSubmit={handleCreateDonor} />
      </Modal>

      {/* Edit Modal */}
      <Modal
        isOpen={showEditModal}
        onClose={() => {
          setShowEditModal(false);
          setSelectedDonor(null);
          setFormError("");
        }}
        title="Edit Donor"
        size="lg"
      >
        {selectedDonor && (
          <DonorForm donor={selectedDonor} onSubmit={handleEditDonor} />
        )}
      </Modal>

      {/* Delete Confirmation */}
      <ConfirmModal
        isOpen={showDeleteModal}
        onClose={() => {
          setShowDeleteModal(false);
          setSelectedDonor(null);
        }}
        onConfirm={handleDeleteDonor}
        title="Delete Donor"
        message={`Are you sure you want to delete ${selectedDonor?.firstName} ${selectedDonor?.lastName}? This action cannot be undone.`}
        confirmText="Delete"
        confirmVariant="danger"
        loading={submitting}
      />

      {/* Import Modal */}
      <Modal
        isOpen={showImportModal}
        onClose={() => {
          setShowImportModal(false);
          setImportResult(null);
        }}
        title="Import Donors from CSV"
        size="lg"
      >
        <div className="space-y-6">
          <div className="bg-gray-50 rounded-lg p-4">
            <h4 className="font-medium text-gray-900 mb-2">CSV Format Requirements</h4>
            <p className="text-sm text-gray-600 mb-3">
              Your CSV file should include the following columns:
            </p>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="bg-white px-3 py-2 rounded border">firstName (required)</div>
              <div className="bg-white px-3 py-2 rounded border">lastName (required)</div>
              <div className="bg-white px-3 py-2 rounded border">email (required)</div>
              <div className="bg-white px-3 py-2 rounded border">phone (required)</div>
              <div className="bg-white px-3 py-2 rounded border">bloodGroup (required)</div>
              <div className="bg-white px-3 py-2 rounded border">dateOfBirth (required)</div>
              <div className="bg-white px-3 py-2 rounded border">gender (required)</div>
              <div className="bg-white px-3 py-2 rounded border">address (required)</div>
              <div className="bg-white px-3 py-2 rounded border">city (required)</div>
              <div className="bg-white px-3 py-2 rounded border">state (required)</div>
              <div className="bg-white px-3 py-2 rounded border">pincode (required)</div>
              <div className="bg-white px-3 py-2 rounded border text-gray-500">isAvailable (optional)</div>
              <div className="bg-white px-3 py-2 rounded border text-gray-500">lastDonation (optional)</div>
              <div className="bg-white px-3 py-2 rounded border text-gray-500">medicalNotes (optional)</div>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="mt-4"
              onClick={downloadTemplate}
            >
              <Download className="h-4 w-4 mr-2" />
              Download Template
            </Button>
          </div>

          <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              onChange={handleFileSelect}
              className="hidden"
            />
            <Upload className="h-10 w-10 mx-auto text-gray-400 mb-3" />
            <p className="text-gray-600 mb-3">
              Drag and drop your CSV file here, or
            </p>
            <Button
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              disabled={submitting}
            >
              {submitting ? "Importing..." : "Select File"}
            </Button>
          </div>

          {/* Live Import Progress */}
          {importProgress && (
            <div className="space-y-3">
              {/* Progress bar */}
              <div className="flex items-center justify-between text-sm text-gray-600 mb-1">
                <span>
                  Processing: <span className="font-medium">{importProgress.processed}</span> of <span className="font-medium">{importProgress.total}</span>
                </span>
                <span className="text-gray-500">
                  {importProgress.currentName}
                </span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                {importProgress.processed < importProgress.total ? (
                  // Indeterminate progress bar while server is processing
                  <div className="bg-red-500 h-2 w-1/3 rounded-full animate-[indeterminate_1.5s_infinite_linear]" 
                       style={{ 
                         animation: 'indeterminate 1.5s infinite linear',
                       }}
                  />
                ) : (
                  <div 
                    className="bg-red-500 h-2 rounded-full transition-all duration-300"
                    style={{ width: '100%' }}
                  />
                )}
              </div>
              <style jsx>{`
                @keyframes indeterminate {
                  0% { transform: translateX(-100%); }
                  100% { transform: translateX(400%); }
                }
              `}</style>
              
              {/* Live log */}
              <div 
                ref={importLogRef}
                className="bg-gray-900 rounded-lg p-3 h-40 overflow-y-auto font-mono text-xs"
              >
                {importProgress.logs.length === 0 && (
                  <div className="text-gray-400 animate-pulse">
                    Sending data to server...
                  </div>
                )}
                {importProgress.logs.map((log, idx) => (
                  <div 
                    key={idx} 
                    className={`py-0.5 ${
                      log.status === "success" 
                        ? "text-green-400" 
                        : log.status === "duplicate" 
                          ? "text-yellow-400" 
                          : "text-red-400"
                    }`}
                  >
                    <span className="text-gray-500">[{idx + 1}]</span>{" "}
                    {log.status === "success" ? "✓" : log.status === "duplicate" ? "○" : "✗"}{" "}
                    {log.name}
                    {log.message && <span className="text-gray-500"> — {log.message}</span>}
                  </div>
                ))}
                {importProgress.logs.length > 0 && importProgress.processed < importProgress.total && (
                  <div className="text-gray-400 animate-pulse">Processing on server...</div>
                )}
              </div>
            </div>
          )}

          {/* Final Import Results */}
          {importResult && !submitting && (
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-green-50 text-green-700 px-4 py-3 rounded-lg text-center">
                  <div className="text-2xl font-bold">{importResult.success}</div>
                  <div className="text-xs mt-1">Imported</div>
                </div>
                <div className="bg-yellow-50 text-yellow-700 px-4 py-3 rounded-lg text-center">
                  <div className="text-2xl font-bold">{importResult.duplicates}</div>
                  <div className="text-xs mt-1">Duplicates</div>
                </div>
                <div className="bg-red-50 text-red-700 px-4 py-3 rounded-lg text-center">
                  <div className="text-2xl font-bold">{importResult.failed}</div>
                  <div className="text-xs mt-1">Failed</div>
                </div>
              </div>

              {importResult.errors.length > 0 && (
                <div className="bg-gray-50 rounded-lg p-4 max-h-48 overflow-y-auto">
                  <h4 className="font-medium text-gray-900 mb-2">Errors</h4>
                  <div className="space-y-1 text-sm">
                    {importResult.errors.slice(0, 10).map((err, idx) => (
                      <div key={idx} className="text-red-600">
                        Row {err.row}: {err.error}
                        {err.email && ` (${err.email})`}
                        {err.phone && ` (${err.phone})`}
                      </div>
                    ))}
                    {importResult.errors.length > 10 && (
                      <div className="text-gray-500">
                        ... and {importResult.errors.length - 10} more errors
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button
              variant="outline"
              onClick={() => {
                setShowImportModal(false);
                setImportResult(null);
                setImportProgress(null);
              }}
              disabled={submitting}
            >
              {importResult ? "Done" : "Close"}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Restore Confirmation Modal */}
      <ConfirmModal
        isOpen={showRestoreModal}
        onClose={() => {
          setShowRestoreModal(false);
          setSelectedDonor(null);
          setFormError("");
        }}
        onConfirm={() => selectedDonor && handleRestoreDonor(selectedDonor.id)}
        title="Restore Donor"
        message={
          <>
            Are you sure you want to restore <strong>{selectedDonor?.firstName} {selectedDonor?.lastName}</strong>?
            <br /><br />
            This donor will become active again and can be matched with blood requests.
          </>
        }
        confirmText="Restore Donor"
        confirmVariant="default"
        loading={submitting}
      />

      {/* Deleted Donor Conflict Modal - When trying to add a donor that was previously deleted */}
      <Modal
        isOpen={!!deletedDonorConflict}
        onClose={() => setDeletedDonorConflict(null)}
        title="Donor Previously Deleted"
        size="md"
      >
        {deletedDonorConflict && (
          <div className="space-y-4">
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <p className="text-yellow-800">
                A donor with this email or phone was previously deleted. Would you like to restore them instead?
              </p>
            </div>

            <div className="bg-gray-50 rounded-lg p-4">
              <h4 className="font-medium text-gray-900 mb-3">Deleted Donor Details</h4>
              <div className="space-y-2 text-sm">
                <div className="flex">
                  <span className="text-gray-500 w-24 shrink-0">Name:</span>
                  <span className="font-medium">{deletedDonorConflict.firstName} {deletedDonorConflict.lastName}</span>
                </div>
                <div className="flex items-center">
                  <span className="text-gray-500 w-24 shrink-0">Blood Group:</span>
                  <Badge variant="secondary">
                    {bloodGroupDisplay[deletedDonorConflict.bloodGroup] || deletedDonorConflict.bloodGroup}
                  </Badge>
                </div>
                <div className="flex">
                  <span className="text-gray-500 w-24 shrink-0">Email:</span>
                  <span className="break-all">{deletedDonorConflict.email}</span>
                </div>
                <div className="flex">
                  <span className="text-gray-500 w-24 shrink-0">Phone:</span>
                  <span>{deletedDonorConflict.phone}</span>
                </div>
                <div className="flex">
                  <span className="text-gray-500 w-24 shrink-0">Deleted:</span>
                  <span>{formatDate(deletedDonorConflict.deletedAt)}</span>
                </div>
              </div>
            </div>

            {formError && (
              <div className="bg-red-50 text-red-700 px-4 py-3 rounded-lg text-sm">
                {formError}
              </div>
            )}

            <div className="flex justify-end gap-3 pt-4 border-t">
              <Button
                variant="outline"
                onClick={() => {
                  setDeletedDonorConflict(null);
                  setFormError("");
                }}
              >
                Cancel
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  // Switch to deleted tab to view the donor
                  setDeletedDonorConflict(null);
                  setActiveTab("deleted");
                }}
              >
                View Deleted Donors
              </Button>
              <Button
                onClick={() => handleRestoreDonor(deletedDonorConflict.id)}
                disabled={submitting}
              >
                {submitting ? "Restoring..." : "Restore Donor"}
              </Button>
            </div>
          </div>
        )}
      </Modal>
      </div>
    </div>
  );
}
