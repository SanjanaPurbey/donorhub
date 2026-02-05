"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Plus,
  Pencil,
  Trash2,
  Search,
  Filter,
  ChevronUp,
  ChevronDown,
  Phone,
  Building2,
  Calendar,
  Clock,
  Users,
  X,
  AlertCircle,
  Loader2,
  ExternalLink,
  Eye,
  MapPin,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Modal, ConfirmModal } from "@/components/ui/modal";
import { Badge } from "@/components/ui/badge";
import { Pagination } from "@/components/ui/pagination";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface DonorMatch {
  id: string;
  donorId: string;
  status: string;
  matchScore: number | null;
  createdAt: string;
  donor: {
    id: string;
    firstName: string;
    lastName: string;
    phone: string;
    bloodGroup: string;
    city?: string;
  };
}

interface BloodRequest {
  id: string;
  patientName: string;
  bloodGroup: string;
  unitsRequired: number;
  urgency: string;
  hospital: string;
  hospitalAddress: string;
  city: string;
  state: string;
  contactName: string;
  contactPhone: string;
  deadline: string | null;
  notes: string | null;
  status: string;
  createdAt: string;
  createdBy?: {
    id: string;
    name: string;
    email: string;
  };
  matches?: DonorMatch[];
}

interface PaginationData {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

type SortField = "patientName" | "bloodGroup" | "urgency" | "status" | "createdAt";
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

const statusOptions = [
  { value: "", label: "All Statuses" },
  { value: "PENDING", label: "Pending" },
  { value: "MATCHED", label: "Matched" },
  { value: "FULFILLED", label: "Fulfilled" },
  { value: "CANCELLED", label: "Cancelled" },
];

const urgencyOptions = [
  { value: "", label: "All Urgencies" },
  { value: "CRITICAL", label: "Critical" },
  { value: "HIGH", label: "High" },
  { value: "MEDIUM", label: "Medium" },
  { value: "LOW", label: "Low" },
];

const statusColors: Record<string, "warning" | "info" | "success" | "secondary"> = {
  PENDING: "warning",
  MATCHED: "info",
  FULFILLED: "success",
  CANCELLED: "secondary",
};

const urgencyColors: Record<string, "danger" | "warning" | "info" | "secondary"> = {
  CRITICAL: "danger",
  HIGH: "warning",
  MEDIUM: "info",
  LOW: "secondary",
};

export default function BloodRequestsPage() {
  const router = useRouter();
  const [requests, setRequests] = useState<BloodRequest[]>([]);
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
  const [statusFilter, setStatusFilter] = useState("");
  const [urgencyFilter, setUrgencyFilter] = useState("");
  const [showFilters, setShowFilters] = useState(false);

  // Modal states
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<BloodRequest | null>(null);
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [matching, setMatching] = useState(false);
  const [matchInvalidatedMessage, setMatchInvalidatedMessage] = useState("");

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const fetchRequests = useCallback(async () => {
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
      if (statusFilter) params.set("status", statusFilter);
      if (urgencyFilter) params.set("urgency", urgencyFilter);

      const response = await fetch(`/api/blood-requests?${params}`);
      const data = await response.json();

      if (data.success) {
        setRequests(data.data);
        setPagination(data.pagination);
      }
    } catch (error) {
      console.error("Failed to fetch requests:", error);
    } finally {
      setLoading(false);
    }
  }, [pagination.page, pagination.limit, sortBy, sortOrder, debouncedSearch, bloodGroupFilter, statusFilter, urgencyFilter]);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

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

  const handleCreateRequest = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setFormError("");
    setSubmitting(true);

    const formData = new FormData(e.currentTarget);
    const data = {
      patientName: formData.get("patientName") as string,
      bloodGroup: formData.get("bloodGroup") as string,
      unitsRequired: parseInt(formData.get("unitsRequired") as string, 10),
      urgency: formData.get("urgency") as string,
      hospital: formData.get("hospital") as string,
      hospitalAddress: formData.get("hospitalAddress") as string,
      city: formData.get("city") as string,
      state: formData.get("state") as string,
      contactName: formData.get("contactName") as string,
      contactPhone: formData.get("contactPhone") as string,
      deadline: formData.get("deadline") as string,
      notes: (formData.get("notes") as string) || undefined,
    };

    try {
      const response = await fetch("/api/blood-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      const result = await response.json();

      if (result.success) {
        setShowCreateModal(false);
        fetchRequests();
      } else {
        setFormError(result.error || "Failed to create request");
      }
    } catch {
      setFormError("An error occurred");
    } finally {
      setSubmitting(false);
    }
  };

  const handleEditRequest = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!selectedRequest) return;

    setFormError("");
    setSubmitting(true);

    const formData = new FormData(e.currentTarget);
    const data = {
      patientName: formData.get("patientName") as string,
      bloodGroup: formData.get("bloodGroup") as string,
      unitsRequired: parseInt(formData.get("unitsRequired") as string, 10),
      urgency: formData.get("urgency") as string,
      hospital: formData.get("hospital") as string,
      hospitalAddress: formData.get("hospitalAddress") as string,
      city: formData.get("city") as string,
      state: formData.get("state") as string,
      contactName: formData.get("contactName") as string,
      contactPhone: formData.get("contactPhone") as string,
      deadline: (formData.get("deadline") as string) || null,
      notes: (formData.get("notes") as string) || null,
    };

    try {
      const response = await fetch(`/api/blood-requests/${selectedRequest.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      const result = await response.json();

      if (result.success) {
        setShowEditModal(false);
        setSelectedRequest(null);
        fetchRequests();
        
        // Show notification if matches were invalidated
        if (result.matchesInvalidated) {
          setMatchInvalidatedMessage("Matching criteria changed. Previous matches have been cleared. Please run 'Find Match' again.");
          setTimeout(() => setMatchInvalidatedMessage(""), 8000);
        }
      } else {
        setFormError(result.error || "Failed to update request");
      }
    } catch {
      setFormError("An error occurred");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteRequest = async () => {
    if (!selectedRequest) return;
    setSubmitting(true);

    try {
      const response = await fetch(`/api/blood-requests/${selectedRequest.id}`, {
        method: "DELETE",
      });

      const result = await response.json();

      if (result.success) {
        setShowDeleteModal(false);
        setSelectedRequest(null);
        fetchRequests();
      }
    } catch (error) {
      console.error("Failed to delete request:", error);
    } finally {
      setSubmitting(false);
    }
  };

  const handleFindDonors = async (request: BloodRequest) => {
    setMatching(true);
    setSelectedRequest(request);

    try {
      const response = await fetch(`/api/blood-requests/${request.id}/match`, {
        method: "POST",
      });

      const result = await response.json();

      if (result.success) {
        // Navigate to matches page with the request expanded
        router.push(`/dashboard/matches?expand=${request.id}`);
      } else {
        alert(result.error || "Failed to find donors");
      }
    } catch (error) {
      console.error("Failed to match donors:", error);
    } finally {
      setMatching(false);
      setSelectedRequest(null);
    }
  };

  // Navigate to matches page to view matched donors
  const handleViewMatches = (request: BloodRequest) => {
    router.push(`/dashboard/matches?expand=${request.id}`);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-IN", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const getDaysUntilDeadline = (deadline: string | null) => {
    if (!deadline) return null;
    const days = Math.ceil((new Date(deadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    return days;
  };

  const getDeadlineColor = (deadline: string | null, status: string) => {
    if (!deadline) return "text-slate-400";
    if (status === "FULFILLED" || status === "CANCELLED") return "text-slate-500";
    const days = getDaysUntilDeadline(deadline);
    if (days === null) return "text-slate-400";
    if (days < 0) return "text-red-600";
    if (days <= 2) return "text-orange-600";
    if (days <= 7) return "text-yellow-600";
    return "text-green-600";
  };

  const getDeadlineText = (deadline: string | null, status: string) => {
    if (!deadline) return "No deadline";
    const days = getDaysUntilDeadline(deadline);
    if (days === null) return "No deadline";
    if (status === "FULFILLED") return days >= 0 ? `${days}d left` : "Completed";
    if (status === "CANCELLED") return "Cancelled";
    if (days < 0) return "Overdue";
    if (days === 0) return "Today";
    if (days === 1) return "1d left";
    return `${days}d left`;
  };

  const RequestForm = ({ request, onSubmit }: { request?: BloodRequest; onSubmit: (e: React.FormEvent<HTMLFormElement>) => void }) => (
    <form onSubmit={onSubmit} className="space-y-6">
      {formError && (
        <div className="bg-red-50 text-red-700 px-4 py-3 rounded-lg text-sm">
          {formError}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <Input
          label="Patient Name"
          name="patientName"
          defaultValue={request?.patientName}
          required
        />
        <Select
          label="Blood Group Needed"
          name="bloodGroup"
          defaultValue={request?.bloodGroup || ""}
          options={bloodGroupOptions.slice(1)}
          required
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Input
          label="Units Required"
          name="unitsRequired"
          type="number"
          min="1"
          defaultValue={request?.unitsRequired?.toString() || "1"}
          required
        />
        <Select
          label="Urgency Level"
          name="urgency"
          defaultValue={request?.urgency || "MEDIUM"}
          options={urgencyOptions.slice(1)}
          required
        />
      </div>

      <Input
        label="Hospital Name"
        name="hospital"
        defaultValue={request?.hospital}
        required
      />

      <Input
        label="Hospital Address"
        name="hospitalAddress"
        defaultValue={request?.hospitalAddress}
        required
      />

      <div className="grid grid-cols-2 gap-4">
        <Input
          label="City"
          name="city"
          defaultValue={request?.city}
          required
        />
        <Input
          label="State"
          name="state"
          defaultValue={request?.state}
          required
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Input
          label="Contact Person Name"
          name="contactName"
          defaultValue={request?.contactName}
          required
        />
        <Input
          label="Contact Phone"
          name="contactPhone"
          defaultValue={request?.contactPhone}
          required
        />
      </div>

      <Input
        label="Deadline"
        name="deadline"
        type="date"
        defaultValue={request?.deadline?.split("T")[0]}
        required
      />

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Notes
        </label>
        <textarea
          name="notes"
          rows={3}
          defaultValue={request?.notes || ""}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500"
          placeholder="Any additional information..."
        />
      </div>

      <div className="flex justify-end gap-3 pt-4 border-t">
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            setShowCreateModal(false);
            setShowEditModal(false);
            setSelectedRequest(null);
            setFormError("");
          }}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={submitting}>
          {submitting ? "Saving..." : request ? "Update Request" : "Create Request"}
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
          <h1 className="text-2xl font-bold text-slate-900">Blood Requests</h1>
          <p className="text-slate-500 mt-1">
            Manage blood donation requests and find donors
          </p>
        </div>
        <Button onClick={() => setShowCreateModal(true)}>
          <Plus className="h-4 w-4 mr-2" />
          New Request
        </Button>
      </div>

      {/* Search and Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search by patient name, hospital, or contact..."
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
              {(bloodGroupFilter || statusFilter || urgencyFilter) && (
                <span className="ml-2 bg-red-100 text-red-700 px-2 py-0.5 rounded-full text-xs">
                  {[bloodGroupFilter, statusFilter, urgencyFilter].filter(Boolean).length}
                </span>
              )}
            </Button>
          </div>

          {showFilters && (
            <div className="mt-4 pt-4 border-t flex items-end gap-4">
              <div className="w-44">
                <Select
                  label="Blood Group"
                  value={bloodGroupFilter}
                  onChange={(e) => setBloodGroupFilter(e.target.value)}
                  options={bloodGroupOptions}
                />
              </div>
              <div className="w-36">
                <Select
                  label="Status"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  options={statusOptions}
                />
              </div>
              <div className="w-36">
                <Select
                  label="Urgency"
                  value={urgencyFilter}
                  onChange={(e) => setUrgencyFilter(e.target.value)}
                  options={urgencyOptions}
                />
              </div>
              {(bloodGroupFilter || statusFilter || urgencyFilter) && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setBloodGroupFilter("");
                    setStatusFilter("");
                    setUrgencyFilter("");
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

      {/* Requests Table - Compact Design */}
      <Card className="shadow-sm overflow-hidden">
        <CardHeader className="border-b border-slate-200 bg-slate-50/50">
          <CardTitle className="text-base">
            Blood Requests ({pagination.total})
          </CardTitle>
        </CardHeader>
        
        {loading ? (
          <div className="p-16 text-center">
            <div className="flex items-center justify-center gap-3 text-slate-500">
              <div className="h-5 w-5 border-2 border-rose-500 border-t-transparent rounded-full animate-spin" />
              Loading requests...
            </div>
          </div>
        ) : requests.length === 0 ? (
          <div className="p-16 text-center">
            <div className="text-slate-500">
              <AlertCircle className="h-12 w-12 mx-auto text-slate-300 mb-4" />
              <p className="font-medium text-slate-700">No blood requests found</p>
              <p className="text-sm mt-1">
                {search || bloodGroupFilter || statusFilter || urgencyFilter
                  ? "Try adjusting your filters"
                  : "Create your first blood request to get started"}
              </p>
            </div>
          </div>
        ) : (
          <>
            {/* Compact Table Header */}
            <div className="bg-slate-100 px-4 py-2.5 grid grid-cols-12 gap-2 text-xs font-semibold text-slate-600 uppercase tracking-wider border-b border-slate-200">
              <div 
                className="col-span-1 cursor-pointer hover:text-slate-900 flex items-center gap-1"
                onClick={() => handleSort("bloodGroup")}
              >
                Blood <SortIcon field="bloodGroup" />
              </div>
              <div 
                className="col-span-2 cursor-pointer hover:text-slate-900 flex items-center gap-1"
                onClick={() => handleSort("patientName")}
              >
                Patient <SortIcon field="patientName" />
              </div>
              <div className="col-span-2">Hospital</div>
              <div className="col-span-1 text-center">Units</div>
              <div 
                className="col-span-1 text-center cursor-pointer hover:text-slate-900 flex items-center justify-center gap-1"
                onClick={() => handleSort("urgency")}
              >
                Urgency <SortIcon field="urgency" />
              </div>
              <div 
                className="col-span-1 text-center cursor-pointer hover:text-slate-900 flex items-center justify-center gap-1"
                onClick={() => handleSort("status")}
              >
                Status <SortIcon field="status" />
              </div>
              <div className="col-span-1 text-center">Deadline</div>
              <div className="col-span-1 text-center">Matches</div>
              <div className="col-span-2 text-right">Actions</div>
            </div>

            {/* Compact Request Rows */}
            <div className="divide-y divide-slate-100">
              {requests.map((request) => (
                <div
                  key={request.id}
                  className="grid grid-cols-12 gap-2 px-4 py-2.5 items-center hover:bg-slate-50 cursor-pointer transition-colors group"
                  onClick={() => {
                    setSelectedRequest(request);
                    setShowDetailModal(true);
                  }}
                >
                  {/* Blood Group */}
                  <div className="col-span-1">
                    <Badge variant="primary" className="font-bold text-xs px-1.5 py-0.5">
                      {bloodGroupDisplay[request.bloodGroup] || request.bloodGroup}
                    </Badge>
                  </div>

                  {/* Patient */}
                  <div className="col-span-2 min-w-0">
                    <div className="font-medium text-slate-900 text-sm truncate group-hover:text-rose-600 transition-colors">
                      {request.patientName}
                    </div>
                    <div className="text-xs text-slate-500 truncate flex items-center gap-1">
                      <Phone className="h-3 w-3" />
                      {request.contactPhone}
                    </div>
                  </div>

                  {/* Hospital */}
                  <div className="col-span-2 min-w-0">
                    <div className="text-sm text-slate-700 truncate flex items-center gap-1">
                      <Building2 className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                      {request.hospital}
                    </div>
                    <div className="text-xs text-slate-500 truncate">
                      {request.city}
                    </div>
                  </div>

                  {/* Units */}
                  <div className="col-span-1 text-center">
                    <span className="inline-flex items-center justify-center w-6 h-6 text-xs font-bold bg-slate-100 text-slate-700 rounded-full">
                      {request.unitsRequired}
                    </span>
                  </div>

                  {/* Urgency */}
                  <div className="col-span-1 text-center">
                    <Badge variant={urgencyColors[request.urgency] || "secondary"} size="sm" className="text-[10px]">
                      {request.urgency}
                    </Badge>
                  </div>

                  {/* Status */}
                  <div className="col-span-1 text-center">
                    <Badge variant={statusColors[request.status] || "secondary"} size="sm" className="text-[10px]">
                      {request.status}
                    </Badge>
                  </div>

                  {/* Deadline */}
                  <div className="col-span-1 text-center">
                    <span className={`text-xs font-medium ${getDeadlineColor(request.deadline, request.status)}`}>
                      {getDeadlineText(request.deadline, request.status)}
                    </span>
                  </div>

                  {/* Matches */}
                  <div className="col-span-1 text-center">
                    {request.matches && request.matches.length > 0 ? (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-purple-700 bg-purple-50 px-1.5 py-0.5 rounded">
                        <Users className="h-3 w-3" />
                        {request.matches.length}
                      </span>
                    ) : (
                      <span className="text-xs text-slate-400">—</span>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="col-span-2 flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                    {request.status === "PENDING" && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs px-2"
                        onClick={() => handleFindDonors(request)}
                        disabled={matching && selectedRequest?.id === request.id}
                      >
                        {matching && selectedRequest?.id === request.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <>
                            <Users className="h-3.5 w-3.5 mr-1" />
                            Find
                          </>
                        )}
                      </Button>
                    )}
                    {request.status === "MATCHED" && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs px-2"
                        onClick={() => handleViewMatches(request)}
                      >
                        <ExternalLink className="h-3.5 w-3.5 mr-1" />
                        View
                      </Button>
                    )}
                    {request.status === "FULFILLED" && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs px-2"
                        onClick={() => handleViewMatches(request)}
                      >
                        <ExternalLink className="h-3.5 w-3.5 mr-1" />
                        View
                      </Button>
                    )}
                    {!["FULFILLED", "CANCELLED"].includes(request.status) && (
                      <>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0"
                          onClick={() => {
                            setSelectedRequest(request);
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
                            setSelectedRequest(request);
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
                        setSelectedRequest(request);
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

        {!loading && requests.length > 0 && (
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

      {/* Request Detail Modal */}
      <Modal
        isOpen={showDetailModal}
        onClose={() => {
          setShowDetailModal(false);
          setSelectedRequest(null);
        }}
        title="Request Details"
        size="lg"
      >
        {selectedRequest && (
          <div className="space-y-6">
            {/* Request Header */}
            <div className="flex items-start gap-4 p-4 bg-slate-50 rounded-xl border border-slate-200">
              <Badge variant="primary" className="font-bold text-2xl px-4 py-2">
                {bloodGroupDisplay[selectedRequest.bloodGroup] || selectedRequest.bloodGroup}
              </Badge>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3">
                  <h3 className="text-xl font-semibold text-slate-900">
                    {selectedRequest.patientName}
                  </h3>
                  <Badge variant={urgencyColors[selectedRequest.urgency] || "secondary"}>
                    {selectedRequest.urgency}
                  </Badge>
                  <Badge variant={statusColors[selectedRequest.status] || "secondary"}>
                    {selectedRequest.status}
                  </Badge>
                </div>
                <div className="flex items-center gap-4 mt-2 text-sm text-slate-600">
                  <span className="flex items-center gap-1">
                    <Users className="h-4 w-4 text-slate-400" />
                    {selectedRequest.unitsRequired} unit{selectedRequest.unitsRequired > 1 ? "s" : ""} required
                  </span>
                  {selectedRequest.deadline && (
                    <span className={`flex items-center gap-1 font-medium ${getDeadlineColor(selectedRequest.deadline, selectedRequest.status)}`}>
                      <Clock className="h-4 w-4" />
                      {getDeadlineText(selectedRequest.deadline, selectedRequest.status)}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Info Grid */}
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 bg-white rounded-lg border border-slate-200">
                <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                  <Building2 className="h-3.5 w-3.5" />
                  Hospital Information
                </h4>
                <div className="space-y-2.5">
                  <div className="text-sm">
                    <span className="font-medium text-slate-900">{selectedRequest.hospital}</span>
                  </div>
                  <div className="flex items-start gap-2 text-sm text-slate-600">
                    <MapPin className="h-4 w-4 text-slate-400 shrink-0 mt-0.5" />
                    <span>{selectedRequest.hospitalAddress}</span>
                  </div>
                  <div className="text-sm text-slate-600">
                    {selectedRequest.city}, {selectedRequest.state}
                  </div>
                </div>
              </div>

              <div className="p-4 bg-white rounded-lg border border-slate-200">
                <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                  <Phone className="h-3.5 w-3.5" />
                  Contact Information
                </h4>
                <div className="space-y-2.5">
                  <div className="text-sm">
                    <span className="font-medium text-slate-900">{selectedRequest.contactName}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-slate-600">
                    <Phone className="h-4 w-4 text-slate-400" />
                    <span>{selectedRequest.contactPhone}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Dates */}
            <div className="p-4 bg-white rounded-lg border border-slate-200">
              <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5" />
                Timeline
              </h4>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-slate-500">Created</span>
                  <div className="font-medium text-slate-900 mt-1">{formatDate(selectedRequest.createdAt)}</div>
                </div>
                <div>
                  <span className="text-slate-500">Deadline</span>
                  <div className={`font-medium mt-1 ${getDeadlineColor(selectedRequest.deadline, selectedRequest.status)}`}>
                    {selectedRequest.deadline ? formatDate(selectedRequest.deadline) : "Not specified"}
                  </div>
                </div>
              </div>
            </div>

            {/* Notes */}
            {selectedRequest.notes && (
              <div className="p-4 bg-white rounded-lg border border-slate-200">
                <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                  Notes
                </h4>
                <p className="text-sm text-slate-700 leading-relaxed">
                  {selectedRequest.notes}
                </p>
              </div>
            )}

            {/* Matches Info */}
            {selectedRequest.matches && selectedRequest.matches.length > 0 && (
              <div className="p-4 bg-purple-50 rounded-lg border border-purple-200">
                <h4 className="text-xs font-semibold text-purple-700 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <Users className="h-3.5 w-3.5" />
                  Matched Donors
                </h4>
                <p className="text-sm text-purple-700">
                  {selectedRequest.matches.length} donor{selectedRequest.matches.length > 1 ? "s" : ""} matched to this request
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3 border-purple-300 text-purple-700 hover:bg-purple-100"
                  onClick={() => {
                    setShowDetailModal(false);
                    handleViewMatches(selectedRequest);
                  }}
                >
                  <ExternalLink className="h-4 w-4 mr-1.5" />
                  View Matches
                </Button>
              </div>
            )}

            {/* Modal Actions */}
            <div className="flex justify-between items-center pt-4 border-t border-slate-200">
              <div className="flex gap-2">
                {selectedRequest.status === "PENDING" && (
                  <Button
                    size="sm"
                    onClick={() => {
                      setShowDetailModal(false);
                      handleFindDonors(selectedRequest);
                    }}
                  >
                    <Users className="h-4 w-4 mr-1.5" />
                    Find Donors
                  </Button>
                )}
                {!["FULFILLED", "CANCELLED"].includes(selectedRequest.status) && (
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
                  setSelectedRequest(null);
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
        title="Create Blood Request"
        size="lg"
      >
        <RequestForm onSubmit={handleCreateRequest} />
      </Modal>

      {/* Edit Modal */}
      <Modal
        isOpen={showEditModal}
        onClose={() => {
          setShowEditModal(false);
          setSelectedRequest(null);
          setFormError("");
        }}
        title="Edit Blood Request"
        size="lg"
      >
        {selectedRequest && (
          <RequestForm request={selectedRequest} onSubmit={handleEditRequest} />
        )}
      </Modal>

      {/* Delete Confirmation */}
      <ConfirmModal
        isOpen={showDeleteModal}
        onClose={() => {
          setShowDeleteModal(false);
          setSelectedRequest(null);
        }}
        onConfirm={handleDeleteRequest}
        title="Delete Blood Request"
        message={`Are you sure you want to delete the blood request for ${selectedRequest?.patientName}? This action cannot be undone.`}
        confirmText="Delete"
        confirmVariant="danger"
        loading={submitting}
      />
      </div>
    </div>
  );
}
