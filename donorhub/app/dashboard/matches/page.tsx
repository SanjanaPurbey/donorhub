"use client";

import { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import {
  Search,
  Filter,
  ChevronRight,
  Phone,
  MapPin,
  X,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  Users,
  TrendingUp,
  Droplets,
  Sparkles,
  Eye,
  Code,
  User,
  Mail,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Pagination } from "@/components/ui/pagination";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Modal } from "@/components/ui/modal";

interface MLMatchFactors {
  bloodCompatibility: number;
  locationProximity: number;
  recencyFactor: number;
  donationHistory: number;
  urgencyBoost: number;
}

interface Donor {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  bloodGroup: string;
  city: string;
  state: string;
  lastDonation: string | null;
  dateOfBirth?: string;
  donationCount?: number;
}

interface DonorMatch {
  id: string;
  donorId: string;
  status: string;
  matchScore: number | null;
  matchReason: string | null;
  rank?: number;
  factors?: MLMatchFactors | null;
  createdAt: string;
  confirmedAt: string | null;
  completedAt: string | null;
  donor: Donor;
}

interface BloodRequest {
  id: string;
  patientName: string;
  bloodGroup: string;
  unitsRequired: number;
  hospital: string;
  hospitalAddress: string;
  city: string;
  state: string;
  urgency: string;
  status: string;
  deadline: string;
  contactName: string;
  contactPhone: string;
  notes: string | null;
  createdAt: string;
  fulfilledAt: string | null;
  matches: DonorMatch[];
}

interface GroupedMatch {
  bloodRequest: BloodRequest;
  matches: DonorMatch[];
  stats: {
    total: number;
    pending: number;
    confirmed: number;
    completed: number;
    rejected: number;
  };
}

interface PaginationData {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

type SortField = "createdAt" | "urgency" | "deadline";
type SortOrder = "asc" | "desc";

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

const requestStatusOptions = [
  { value: "", label: "All Statuses" },
  { value: "MATCHED", label: "Matched" },
  { value: "FULFILLED", label: "Fulfilled" },
];

const urgencyOptions = [
  { value: "", label: "All Urgencies" },
  { value: "CRITICAL", label: "Critical" },
  { value: "HIGH", label: "High" },
  { value: "MEDIUM", label: "Medium" },
  { value: "LOW", label: "Low" },
];

const matchStatusColors: Record<string, "warning" | "success" | "danger" | "info" | "secondary"> = {
  PENDING: "warning",
  CONFIRMED: "success",
  REJECTED: "danger",
  COMPLETED: "info",
};

const urgencyColors: Record<string, "danger" | "warning" | "info" | "secondary"> = {
  CRITICAL: "danger",
  HIGH: "warning",
  MEDIUM: "info",
  LOW: "secondary",
};

const requestStatusColors: Record<string, "warning" | "success" | "danger" | "info" | "secondary"> = {
  PENDING: "warning",
  MATCHED: "info",
  FULFILLED: "success",
  CANCELLED: "danger",
};

// Score bar component for ML factors visualization
function ScoreBar({ label, score, color }: { label: string; score: number; color: string }) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-slate-600">{label}</span>
        <span className="font-medium text-slate-700">{(score * 100).toFixed(0)}%</span>
      </div>
      <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
        <div 
          className={`h-full ${color} transition-all duration-300`}
          style={{ width: `${score * 100}%` }}
        />
      </div>
    </div>
  );
}

export default function MatchesPage() {
  const searchParams = useSearchParams();
  const expandRequestId = searchParams.get("expand");
  
  const [groupedMatches, setGroupedMatches] = useState<GroupedMatch[]>([]);
  const [pagination, setPagination] = useState<PaginationData>({
    page: 1,
    limit: 10,
    total: 0,
    totalPages: 0,
  });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [sortBy] = useState<SortField>("createdAt");
  const [sortOrder] = useState<SortOrder>("desc");
  const [statusFilter, setStatusFilter] = useState("");
  const [urgencyFilter, setUrgencyFilter] = useState("");
  const [showFilters, setShowFilters] = useState(false);

  // Expanded rows state - initialize with expandRequestId if provided
  const [expandedRows, setExpandedRows] = useState<Set<string>>(() => {
    if (expandRequestId) {
      return new Set([expandRequestId]);
    }
    return new Set();
  });

  // Modal state
  const [selectedGroup, setSelectedGroup] = useState<GroupedMatch | null>(null);
  const [showFulfillModal, setShowFulfillModal] = useState(false);
  const [selectedDonorId, setSelectedDonorId] = useState<string | null>(null);
  const [fulfilling, setFulfilling] = useState(false);
  
  // Donor detail modal state
  const [showDonorDetailModal, setShowDonorDetailModal] = useState(false);
  const [selectedDonorMatch, setSelectedDonorMatch] = useState<{ match: DonorMatch; rank: number } | null>(null);
  const [showRawData, setShowRawData] = useState(false);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const fetchGroupedMatches = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(pagination.page),
        limit: String(pagination.limit),
        sortBy,
        sortOrder,
        hasMatches: "true",
      });

      if (debouncedSearch) params.set("search", debouncedSearch);
      if (statusFilter) params.set("status", statusFilter);
      if (urgencyFilter) params.set("urgency", urgencyFilter);

      // Fetch blood requests with matches
      const response = await fetch(`/api/blood-requests?${params}`);
      const data = await response.json();

      if (data.success) {
        // Transform to grouped format with stats
        const grouped: GroupedMatch[] = data.data.map((request: BloodRequest) => {
          const matches = request.matches || [];
          return {
            bloodRequest: request,
            matches: matches.sort((a: DonorMatch, b: DonorMatch) => 
              (b.matchScore || 0) - (a.matchScore || 0)
            ),
            stats: {
              total: matches.length,
              pending: matches.filter((m: DonorMatch) => m.status === "PENDING").length,
              confirmed: matches.filter((m: DonorMatch) => m.status === "CONFIRMED").length,
              completed: matches.filter((m: DonorMatch) => m.status === "COMPLETED").length,
              rejected: matches.filter((m: DonorMatch) => m.status === "REJECTED").length,
            },
          };
        });

        setGroupedMatches(grouped);
        setPagination(data.pagination);
      }
    } catch (error) {
      console.error("Failed to fetch matches:", error);
    } finally {
      setLoading(false);
    }
  }, [pagination.page, pagination.limit, sortBy, sortOrder, debouncedSearch, statusFilter, urgencyFilter]);

  useEffect(() => {
    fetchGroupedMatches();
  }, [fetchGroupedMatches]);

  // Auto-expand and scroll to the request when navigated from Requests page
  useEffect(() => {
    if (expandRequestId && groupedMatches.length > 0 && !loading) {
      // Make sure it's expanded
      setExpandedRows((prev) => {
        if (!prev.has(expandRequestId)) {
          return new Set([...prev, expandRequestId]);
        }
        return prev;
      });
      
      // Scroll to the request row
      setTimeout(() => {
        const element = document.getElementById(`request-${expandRequestId}`);
        if (element) {
          element.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      }, 100);
    }
  }, [expandRequestId, groupedMatches, loading]);

  const toggleExpand = (requestId: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(requestId)) {
        next.delete(requestId);
      } else {
        next.add(requestId);
      }
      return next;
    });
  };

  const handleUpdateMatchStatus = async (matchId: string, newStatus: string) => {
    try {
      const response = await fetch(`/api/matches/${matchId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });

      const result = await response.json();

      if (result.success) {
        fetchGroupedMatches();
      } else {
        alert(result.error || "Failed to update status");
      }
    } catch (error) {
      console.error("Failed to update status:", error);
    }
  };

  const handleFulfillRequest = async () => {
    if (!selectedGroup || !selectedDonorId) return;

    setFulfilling(true);
    try {
      // Find the selected match
      const selectedMatch = selectedGroup.matches.find(m => m.id === selectedDonorId);
      
      // If match is pending, first confirm it
      if (selectedMatch?.status === "PENDING") {
        const confirmResponse = await fetch(`/api/matches/${selectedDonorId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "CONFIRMED" }),
        });

        if (!confirmResponse.ok) {
          const error = await confirmResponse.json();
          throw new Error(error.error || "Failed to confirm match");
        }
      }

      // Then mark the match as completed (if not already)
      if (selectedMatch?.status !== "COMPLETED") {
        const completeResponse = await fetch(`/api/matches/${selectedDonorId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "COMPLETED" }),
        });

        if (!completeResponse.ok) {
          const error = await completeResponse.json();
          throw new Error(error.error || "Failed to complete match");
        }
      }

      // Finally, mark the blood request as fulfilled
      const fulfillResponse = await fetch(`/api/blood-requests/${selectedGroup.bloodRequest.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "FULFILLED" }),
      });

      if (!fulfillResponse.ok) {
        const error = await fulfillResponse.json();
        throw new Error(error.error || "Failed to fulfill request");
      }

      // Refresh data and close modal
      fetchGroupedMatches();
      setShowFulfillModal(false);
      setSelectedGroup(null);
      setSelectedDonorId(null);
    } catch (error) {
      console.error("Failed to fulfill request:", error);
      alert(error instanceof Error ? error.message : "Failed to fulfill request");
    } finally {
      setFulfilling(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-IN", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const formatDateTime = (dateString: string) => {
    return new Date(dateString).toLocaleString("en-IN", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const formatScore = (score: number | null) => {
    if (score === null) return "N/A";
    return (score * 100).toFixed(0) + "%";
  };

  const getDaysUntilDeadline = (deadline: string) => {
    const days = Math.ceil((new Date(deadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    return days;
  };

  const getDeadlineColor = (deadline: string, status: string) => {
    // For fulfilled/cancelled requests, use neutral color regardless of deadline
    if (status === "FULFILLED" || status === "CANCELLED") return "text-slate-500";
    const days = getDaysUntilDeadline(deadline);
    if (days < 0) return "text-red-600";
    if (days <= 2) return "text-orange-600";
    if (days <= 7) return "text-yellow-600";
    return "text-green-600";
  };

  const getDeadlineText = (deadline: string, status: string) => {
    const days = getDaysUntilDeadline(deadline);
    // For fulfilled requests, show completed status without overdue warning
    if (status === "FULFILLED") {
      return days >= 0 ? `${days} days left` : "Completed";
    }
    if (status === "CANCELLED") {
      return "Cancelled";
    }
    // For active requests, show overdue if past deadline
    if (days < 0) return "Overdue";
    if (days === 0) return "Due today";
    if (days === 1) return "1 day left";
    return `${days} days left`;
  };

  return (
    <div className="p-6 lg:p-8">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Match Management</h1>
            <p className="text-slate-500 mt-1">
              View blood requests and their matched donors — select who fulfilled each request
            </p>
          </div>
        </div>

        {/* Search and Filters */}
        <Card className="shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search by patient name, hospital, or contact..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 border border-slate-300 rounded-lg text-sm focus:border-rose-500 transition-colors"
                />
              </div>
              <Button
                variant="outline"
                onClick={() => setShowFilters(!showFilters)}
              >
                <Filter className="h-4 w-4 mr-2" />
                Filters
                {(statusFilter || urgencyFilter) && (
                  <span className="ml-2 bg-rose-100 text-rose-700 px-2 py-0.5 rounded-full text-xs font-medium">
                    {[statusFilter, urgencyFilter].filter(Boolean).length}
                  </span>
                )}
              </Button>
            </div>

            {showFilters && (
              <div className="mt-4 pt-4 border-t border-slate-200 flex items-end gap-4">
                <div className="w-40">
                  <Select
                    label="Request Status"
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    options={requestStatusOptions}
                  />
                </div>
                <div className="w-40">
                  <Select
                    label="Urgency"
                    value={urgencyFilter}
                    onChange={(e) => setUrgencyFilter(e.target.value)}
                    options={urgencyOptions}
                  />
                </div>
                {(statusFilter || urgencyFilter) && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
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

        {/* Info Banner - Explaining the difference from Donors tab */}
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-blue-600 shrink-0 mt-0.5" />
            <div className="text-sm text-blue-800">
              <p className="font-medium">How is this different from the Donors tab?</p>
              <ul className="mt-1 space-y-1 list-disc list-inside text-blue-700">
                <li>Shows <strong>ML-ranked matches</strong> specific to each blood request&apos;s requirements</li>
                <li>Donors are filtered for <strong>blood compatibility</strong>, <strong>56-day donation gap</strong>, and <strong>availability</strong></li>
                <li>Displays <strong>match scores</strong> based on location proximity, urgency, and donation history</li>
                <li>Allows you to <strong>track and complete</strong> the donation workflow</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <Card className="shadow-sm overflow-hidden">
          <CardHeader className="border-b border-slate-200 bg-slate-50/50">
            <CardTitle className="flex items-center justify-between text-base">
              <span>Blood Requests with Matches ({pagination.total})</span>
            </CardTitle>
          </CardHeader>
          
          {loading ? (
            <div className="p-16 text-center">
              <div className="flex items-center justify-center gap-3 text-slate-500">
                <div className="h-5 w-5 border-2 border-rose-500 border-t-transparent rounded-full animate-spin" />
                Loading matches...
              </div>
            </div>
          ) : groupedMatches.length === 0 ? (
            <div className="p-16 text-center">
              <div className="text-slate-500">
                <Users className="h-12 w-12 mx-auto text-slate-300 mb-4" />
                <p className="font-medium text-slate-700">No matched requests found</p>
                <p className="text-sm mt-1">
                  {search || statusFilter || urgencyFilter
                    ? "Try adjusting your filters"
                    : "Blood requests with matches will appear here after you click 'Find Match' on the Requests page"}
                </p>
              </div>
            </div>
          ) : (
            <div className="divide-y divide-slate-200">
              {groupedMatches.map((group) => (
                <div 
                  key={group.bloodRequest.id} 
                  id={`request-${group.bloodRequest.id}`}
                  className={`bg-white transition-colors ${
                    expandRequestId === group.bloodRequest.id ? "ring-2 ring-rose-500/20" : ""
                  }`}
                >
                  {/* Request Row - Clickable Header */}
                  <div
                    className="p-4 hover:bg-slate-50 cursor-pointer transition-colors"
                    onClick={() => toggleExpand(group.bloodRequest.id)}
                  >
                    <div className="flex items-center gap-4">
                      {/* Expand Icon */}
                      <div className="shrink-0">
                        <ChevronRight
                          className={`h-5 w-5 text-slate-400 transition-transform duration-200 ${
                            expandedRows.has(group.bloodRequest.id) ? "rotate-90" : ""
                          }`}
                        />
                      </div>

                      {/* Blood Group Badge */}
                      <Badge variant="primary" className="font-bold text-lg px-3 py-1.5">
                        {bloodGroupDisplay[group.bloodRequest.bloodGroup]}
                      </Badge>

                      {/* Request Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3">
                          <h3 className="font-semibold text-slate-900 truncate">
                            {group.bloodRequest.patientName}
                          </h3>
                          <Badge variant={urgencyColors[group.bloodRequest.urgency]} size="sm">
                            {group.bloodRequest.urgency}
                          </Badge>
                          <Badge variant={requestStatusColors[group.bloodRequest.status]} size="sm">
                            {group.bloodRequest.status}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-4 mt-1.5 text-sm text-slate-500">
                          <span className="flex items-center gap-1.5">
                            <MapPin className="h-3.5 w-3.5 text-slate-400" />
                            {group.bloodRequest.hospital}
                          </span>
                          <span className="flex items-center gap-1.5">
                            <Droplets className="h-3.5 w-3.5 text-slate-400" />
                            {group.bloodRequest.unitsRequired} unit(s)
                          </span>
                          <span className={`flex items-center gap-1.5 font-medium ${getDeadlineColor(group.bloodRequest.deadline, group.bloodRequest.status)}`}>
                            <Clock className="h-3.5 w-3.5" />
                            {getDeadlineText(group.bloodRequest.deadline, group.bloodRequest.status)}
                          </span>
                        </div>
                      </div>

                      {/* Match Stats */}
                      <div className="flex items-center gap-2">
                        <div className="text-center px-3 py-1.5 bg-slate-100 rounded-lg border border-slate-200">
                          <div className="text-lg font-bold text-slate-800">{group.stats.total}</div>
                          <div className="text-xs text-slate-500">Matches</div>
                        </div>
                        {group.stats.confirmed > 0 && (
                          <div className="text-center px-3 py-1.5 bg-emerald-50 rounded-lg border border-emerald-200">
                            <div className="text-lg font-bold text-emerald-700">{group.stats.confirmed}</div>
                            <div className="text-xs text-emerald-600">Confirmed</div>
                          </div>
                        )}
                        {group.stats.completed > 0 && (
                          <div className="text-center px-3 py-1.5 bg-blue-50 rounded-lg border border-blue-200">
                            <div className="text-lg font-bold text-blue-700">{group.stats.completed}</div>
                            <div className="text-xs text-blue-600">Completed</div>
                          </div>
                        )}
                      </div>

                      {/* Actions */}
                      {group.bloodRequest.status === "MATCHED" && (
                        <Button
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedGroup(group);
                            setSelectedDonorId(null);
                            setShowFulfillModal(true);
                          }}
                        >
                          <CheckCircle className="h-4 w-4 mr-1" />
                          Mark Fulfilled
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* Expanded Donors Section */}
                  {expandedRows.has(group.bloodRequest.id) && (
                    <div className="bg-slate-50 border-t border-slate-200 px-4 py-4">
                      <div className="pl-9">
                        <h4 className="font-semibold text-slate-800 mb-3 flex items-center gap-2">
                          <Sparkles className="h-4 w-4 text-purple-500" />
                          Matched Donors ({group.matches.length})
                          <span className="text-sm font-normal text-slate-500">
                            — Click a row for details
                          </span>
                        </h4>
                        
                        {/* Compact Table Header */}
                        <div className="bg-slate-100 rounded-t-lg px-3 py-2 grid grid-cols-12 gap-2 text-xs font-semibold text-slate-600 uppercase tracking-wider">
                          <div className="col-span-1">Rank</div>
                          <div className="col-span-1">Blood</div>
                          <div className="col-span-3">Donor</div>
                          <div className="col-span-2">Location</div>
                          <div className="col-span-1 text-center">Donations</div>
                          <div className="col-span-2 text-center">Match Score</div>
                          <div className="col-span-1 text-center">Status</div>
                          <div className="col-span-1 text-right">Actions</div>
                        </div>
                        
                        {/* Compact Donor Rows */}
                        <div className="bg-white rounded-b-lg border border-slate-200 border-t-0 divide-y divide-slate-100">
                          {group.matches.map((match, index) => (
                            <div
                              key={match.id}
                              className="grid grid-cols-12 gap-2 px-3 py-2.5 items-center hover:bg-slate-50 cursor-pointer transition-colors group"
                              onClick={() => {
                                setSelectedDonorMatch({ match, rank: index + 1 });
                                setShowDonorDetailModal(true);
                                setShowRawData(false);
                              }}
                            >
                              {/* Rank */}
                              <div className="col-span-1">
                                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                                  index === 0 ? "bg-yellow-100 text-yellow-700" :
                                  index === 1 ? "bg-slate-200 text-slate-600" :
                                  index === 2 ? "bg-orange-100 text-orange-700" :
                                  "bg-slate-100 text-slate-500"
                                }`}>
                                  #{index + 1}
                                </div>
                              </div>

                              {/* Blood Group */}
                              <div className="col-span-1">
                                <Badge variant="primary" className="font-bold text-xs px-1.5 py-0.5">
                                  {bloodGroupDisplay[match.donor.bloodGroup]}
                                </Badge>
                              </div>

                              {/* Donor Name */}
                              <div className="col-span-3 min-w-0">
                                <div className="font-medium text-slate-900 text-sm truncate group-hover:text-rose-600 transition-colors">
                                  {match.donor.firstName} {match.donor.lastName}
                                </div>
                                <div className="text-xs text-slate-500 truncate">
                                  {match.donor.phone}
                                </div>
                              </div>

                              {/* Location */}
                              <div className="col-span-2 text-sm text-slate-600 truncate">
                                {match.donor.city}
                              </div>

                              {/* Donation Count */}
                              <div className="col-span-1 text-center">
                                {match.donor.donationCount !== undefined && match.donor.donationCount > 0 ? (
                                  <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">
                                    <Droplets className="h-3 w-3" />
                                    {match.donor.donationCount}
                                  </span>
                                ) : (
                                  <span className="text-xs text-slate-400">—</span>
                                )}
                              </div>

                              {/* Match Score */}
                              <div className="col-span-2">
                                {match.matchScore !== null ? (
                                  <div className="flex items-center gap-1.5">
                                    <div className="flex-1 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                                      <div 
                                        className={`h-full rounded-full ${
                                          match.matchScore >= 0.8 ? "bg-emerald-500" :
                                          match.matchScore >= 0.6 ? "bg-amber-500" :
                                          "bg-slate-400"
                                        }`}
                                        style={{ width: `${match.matchScore * 100}%` }}
                                      />
                                    </div>
                                    <span className={`text-xs font-semibold min-w-9 text-right ${
                                      match.matchScore >= 0.8 ? "text-emerald-700" :
                                      match.matchScore >= 0.6 ? "text-amber-700" :
                                      "text-slate-600"
                                    }`}>
                                      {formatScore(match.matchScore)}
                                    </span>
                                  </div>
                                ) : (
                                  <span className="text-xs text-slate-400">N/A</span>
                                )}
                              </div>

                              {/* Status */}
                              <div className="col-span-1 text-center">
                                <Badge variant={matchStatusColors[match.status]} size="sm" className="text-[10px]">
                                  {match.status}
                                </Badge>
                              </div>

                              {/* Actions */}
                              <div className="col-span-1 flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                                {match.status === "PENDING" && (
                                  <>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="text-red-600 hover:bg-red-50 h-6 w-6 p-0"
                                      onClick={() => handleUpdateMatchStatus(match.id, "REJECTED")}
                                      title="Reject"
                                    >
                                      <XCircle className="h-3.5 w-3.5" />
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="text-emerald-600 hover:bg-emerald-50 h-6 w-6 p-0"
                                      onClick={() => handleUpdateMatchStatus(match.id, "CONFIRMED")}
                                      title="Confirm"
                                    >
                                      <CheckCircle className="h-3.5 w-3.5" />
                                    </Button>
                                  </>
                                )}
                                {match.status === "CONFIRMED" && (
                                  <Button
                                    size="sm"
                                    className="h-6 text-xs px-2"
                                    onClick={() => handleUpdateMatchStatus(match.id, "COMPLETED")}
                                  >
                                    Complete
                                  </Button>
                                )}
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="text-slate-500 hover:bg-slate-100 h-6 w-6 p-0"
                                  onClick={() => {
                                    setSelectedDonorMatch({ match, rank: index + 1 });
                                    setShowDonorDetailModal(true);
                                    setShowRawData(false);
                                  }}
                                  title="View Details"
                                >
                                  <Eye className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>

                        {/* Request Details */}
                        <div className="mt-4 p-4 bg-white rounded-xl border border-slate-200">
                          <h5 className="font-semibold text-slate-800 mb-3 text-sm">Request Details</h5>
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                            <div>
                              <span className="text-slate-500 text-xs uppercase tracking-wider">Contact</span>
                              <div className="font-medium text-slate-900 mt-1">{group.bloodRequest.contactName}</div>
                              <div className="text-slate-600">{group.bloodRequest.contactPhone}</div>
                            </div>
                            <div>
                              <span className="text-slate-500 text-xs uppercase tracking-wider">Hospital</span>
                              <div className="font-medium text-slate-900 mt-1">{group.bloodRequest.hospital}</div>
                              <div className="text-slate-600">{group.bloodRequest.city}, {group.bloodRequest.state}</div>
                            </div>
                            <div>
                              <span className="text-slate-500 text-xs uppercase tracking-wider">Deadline</span>
                              <div className="font-medium text-slate-900 mt-1">{formatDate(group.bloodRequest.deadline)}</div>
                            </div>
                            <div>
                              <span className="text-slate-500 text-xs uppercase tracking-wider">Created</span>
                              <div className="font-medium text-slate-900 mt-1">{formatDateTime(group.bloodRequest.createdAt)}</div>
                            </div>
                          </div>
                          {group.bloodRequest.notes && (
                            <div className="mt-4 pt-4 border-t border-slate-200">
                              <span className="text-slate-500 text-xs uppercase tracking-wider">Notes</span>
                              <p className="text-slate-700 mt-1">{group.bloodRequest.notes}</p>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {!loading && groupedMatches.length > 0 && (
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

        {/* Fulfill Request Modal */}
        <Modal
          isOpen={showFulfillModal}
          onClose={() => {
            setShowFulfillModal(false);
            setSelectedGroup(null);
            setSelectedDonorId(null);
          }}
          title="Mark Request as Fulfilled"
          size="lg"
        >
          {selectedGroup && (
            <div className="space-y-6">
              {/* Request Summary */}
              <div className="p-4 bg-gray-50 rounded-lg">
                <div className="flex items-center gap-3">
                  <Badge variant="primary" className="font-bold text-lg px-3 py-1.5">
                    {bloodGroupDisplay[selectedGroup.bloodRequest.bloodGroup]}
                  </Badge>
                  <div>
                    <h3 className="font-semibold text-gray-900">
                      {selectedGroup.bloodRequest.patientName}
                    </h3>
                    <p className="text-sm text-gray-500">
                      {selectedGroup.bloodRequest.hospital} • {selectedGroup.bloodRequest.unitsRequired} unit(s) needed
                    </p>
                  </div>
                </div>
              </div>

              {/* Donor Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-3">
                  Select the donor who fulfilled this request:
                </label>
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {selectedGroup.matches
                    .filter((m) => m.status !== "REJECTED")
                    .map((match, index) => (
                      <label
                        key={match.id}
                        className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                          selectedDonorId === match.id
                            ? "border-red-500 bg-red-50"
                            : "border-gray-200 hover:bg-gray-50"
                        }`}
                      >
                        <input
                          type="radio"
                          name="fulfillDonor"
                          value={match.id}
                          checked={selectedDonorId === match.id}
                          onChange={() => setSelectedDonorId(match.id)}
                          className="h-4 w-4 text-red-600 focus:ring-red-500"
                        />
                        <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                          index === 0 ? "bg-yellow-100 text-yellow-700" : "bg-gray-100 text-gray-600"
                        }`}>
                          #{index + 1}
                        </div>
                        <Badge variant="primary" className="font-bold">
                          {bloodGroupDisplay[match.donor.bloodGroup]}
                        </Badge>
                        <div className="flex-1">
                          <div className="font-medium text-gray-900">
                            {match.donor.firstName} {match.donor.lastName}
                          </div>
                          <div className="text-sm text-gray-500">
                            {match.donor.city} • {match.donor.phone}
                          </div>
                        </div>
                        {match.matchScore !== null && (
                          <div className="text-sm text-purple-600 font-medium">
                            {formatScore(match.matchScore)} match
                          </div>
                        )}
                        <Badge variant={matchStatusColors[match.status]} size="sm">
                          {match.status}
                        </Badge>
                      </label>
                    ))}
                </div>
              </div>

              {/* Warning */}
              <div className="flex items-start gap-2 p-3 bg-yellow-50 rounded-lg text-yellow-800">
                <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
                <div className="text-sm">
                  <p className="font-medium">This action will:</p>
                  <ul className="mt-1 list-disc list-inside space-y-1">
                    <li>Mark the selected donor&apos;s match as COMPLETED</li>
                    <li>Update the donor&apos;s last donation date to today</li>
                    <li>Mark this blood request as FULFILLED</li>
                  </ul>
                </div>
              </div>

              {/* Actions */}
              <div className="flex justify-end gap-3 pt-4 border-t">
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowFulfillModal(false);
                    setSelectedGroup(null);
                    setSelectedDonorId(null);
                  }}
                  disabled={fulfilling}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleFulfillRequest}
                  disabled={!selectedDonorId || fulfilling}
                >
                  {fulfilling ? (
                    <>
                      <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                      Processing...
                    </>
                  ) : (
                    <>
                      <CheckCircle className="h-4 w-4 mr-2" />
                      Confirm Fulfillment
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}
        </Modal>

        {/* Donor Detail Modal */}
        <Modal
          isOpen={showDonorDetailModal}
          onClose={() => {
            setShowDonorDetailModal(false);
            setSelectedDonorMatch(null);
            setShowRawData(false);
          }}
          title="Donor Details"
          size="lg"
        >
          {selectedDonorMatch && (
            <div className="space-y-6">
              {/* Donor Header */}
              <div className="flex items-start gap-4 p-4 bg-slate-50 rounded-xl border border-slate-200">
                <div className={`w-14 h-14 rounded-full flex items-center justify-center text-lg font-bold ${
                  selectedDonorMatch.rank === 1 ? "bg-yellow-100 text-yellow-700 ring-2 ring-yellow-300" :
                  selectedDonorMatch.rank === 2 ? "bg-slate-200 text-slate-600 ring-2 ring-slate-300" :
                  selectedDonorMatch.rank === 3 ? "bg-orange-100 text-orange-700 ring-2 ring-orange-300" :
                  "bg-slate-100 text-slate-500"
                }`}>
                  #{selectedDonorMatch.rank}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3">
                    <h3 className="text-xl font-semibold text-slate-900">
                      {selectedDonorMatch.match.donor.firstName} {selectedDonorMatch.match.donor.lastName}
                    </h3>
                    <Badge variant="primary" className="font-bold text-base px-2.5 py-1">
                      {bloodGroupDisplay[selectedDonorMatch.match.donor.bloodGroup]}
                    </Badge>
                    <Badge variant={matchStatusColors[selectedDonorMatch.match.status]}>
                      {selectedDonorMatch.match.status}
                    </Badge>
                  </div>
                  {selectedDonorMatch.match.matchScore !== null && (
                    <div className="flex items-center gap-2 mt-2">
                      <span className="text-sm text-slate-600">Match Score:</span>
                      <div className="flex items-center gap-2">
                        <div className="w-32 h-2 bg-slate-200 rounded-full overflow-hidden">
                          <div 
                            className={`h-full rounded-full ${
                              selectedDonorMatch.match.matchScore >= 0.8 ? "bg-emerald-500" :
                              selectedDonorMatch.match.matchScore >= 0.6 ? "bg-amber-500" :
                              "bg-slate-400"
                            }`}
                            style={{ width: `${selectedDonorMatch.match.matchScore * 100}%` }}
                          />
                        </div>
                        <span className={`text-sm font-bold ${
                          selectedDonorMatch.match.matchScore >= 0.8 ? "text-emerald-700" :
                          selectedDonorMatch.match.matchScore >= 0.6 ? "text-amber-700" :
                          "text-slate-600"
                        }`}>
                          {formatScore(selectedDonorMatch.match.matchScore)}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Contact & Info Grid */}
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 bg-white rounded-lg border border-slate-200">
                  <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                    <User className="h-3.5 w-3.5" />
                    Contact Information
                  </h4>
                  <div className="space-y-2.5">
                    <div className="flex items-center gap-2 text-sm">
                      <Phone className="h-4 w-4 text-slate-400" />
                      <span className="text-slate-700">{selectedDonorMatch.match.donor.phone}</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <Mail className="h-4 w-4 text-slate-400" />
                      <span className="text-slate-700">{selectedDonorMatch.match.donor.email}</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <MapPin className="h-4 w-4 text-slate-400" />
                      <span className="text-slate-700">{selectedDonorMatch.match.donor.city}, {selectedDonorMatch.match.donor.state}</span>
                    </div>
                  </div>
                </div>

                <div className="p-4 bg-white rounded-lg border border-slate-200">
                  <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                    <Droplets className="h-3.5 w-3.5" />
                    Donation History
                  </h4>
                  <div className="space-y-2.5">
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-500">Total Donations</span>
                      <span className="font-semibold text-slate-900">
                        {selectedDonorMatch.match.donor.donationCount ?? 0}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-500">Last Donation</span>
                      <span className="font-semibold text-slate-900">
                        {selectedDonorMatch.match.donor.lastDonation 
                          ? formatDate(selectedDonorMatch.match.donor.lastDonation)
                          : "Never"}
                      </span>
                    </div>
                    {selectedDonorMatch.match.donor.dateOfBirth && (
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-500">Date of Birth</span>
                        <span className="font-semibold text-slate-900">
                          {formatDate(selectedDonorMatch.match.donor.dateOfBirth)}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* ML Ranking Factors */}
              {selectedDonorMatch.match.factors && (
                <div className="p-4 bg-white rounded-lg border border-slate-200">
                  <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                    <TrendingUp className="h-3.5 w-3.5" />
                    ML Ranking Factors
                  </h4>
                  <div className="grid grid-cols-2 gap-4">
                    <ScoreBar 
                      label="Blood Compatibility" 
                      score={selectedDonorMatch.match.factors.bloodCompatibility} 
                      color="bg-rose-500"
                    />
                    <ScoreBar 
                      label="Location Proximity" 
                      score={selectedDonorMatch.match.factors.locationProximity} 
                      color="bg-blue-500"
                    />
                    <ScoreBar 
                      label="Donation Recency" 
                      score={selectedDonorMatch.match.factors.recencyFactor} 
                      color="bg-emerald-500"
                    />
                    <ScoreBar 
                      label="Donation History" 
                      score={selectedDonorMatch.match.factors.donationHistory} 
                      color="bg-purple-500"
                    />
                  </div>
                  {selectedDonorMatch.match.factors.urgencyBoost > 1 && (
                    <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 px-3 py-2 rounded-md border border-amber-200 mt-3">
                      <TrendingUp className="h-4 w-4" />
                      <span className="font-medium">Urgency Boost Applied: +{((selectedDonorMatch.match.factors.urgencyBoost - 1) * 100).toFixed(0)}%</span>
                    </div>
                  )}
                </div>
              )}

              {/* Match Reason */}
              {selectedDonorMatch.match.matchReason && (
                <div className="p-4 bg-white rounded-lg border border-slate-200">
                  <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                    Match Reason
                  </h4>
                  <p className="text-sm text-slate-700 leading-relaxed">
                    {selectedDonorMatch.match.matchReason}
                  </p>
                </div>
              )}

              {/* Raw Data Toggle */}
              <div className="border-t border-slate-200 pt-4">
                <button
                  onClick={() => setShowRawData(!showRawData)}
                  className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-700 transition-colors"
                >
                  <Code className="h-4 w-4" />
                  {showRawData ? "Hide" : "Show"} Raw Data
                </button>
                {showRawData && (
                  <div className="mt-3 p-4 bg-slate-900 rounded-lg overflow-x-auto">
                    <pre className="text-xs text-slate-300 font-mono">
                      {JSON.stringify({
                        match: {
                          id: selectedDonorMatch.match.id,
                          status: selectedDonorMatch.match.status,
                          matchScore: selectedDonorMatch.match.matchScore,
                          matchReason: selectedDonorMatch.match.matchReason,
                          factors: selectedDonorMatch.match.factors,
                          createdAt: selectedDonorMatch.match.createdAt,
                        },
                        donor: selectedDonorMatch.match.donor,
                        rank: selectedDonorMatch.rank,
                      }, null, 2)}
                    </pre>
                  </div>
                )}
              </div>

              {/* Modal Actions */}
              <div className="flex justify-between items-center pt-4 border-t border-slate-200">
                <div className="flex gap-2">
                  {selectedDonorMatch.match.status === "PENDING" && (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-red-600 border-red-200 hover:bg-red-50"
                        onClick={() => {
                          handleUpdateMatchStatus(selectedDonorMatch.match.id, "REJECTED");
                          setShowDonorDetailModal(false);
                          setSelectedDonorMatch(null);
                        }}
                      >
                        <XCircle className="h-4 w-4 mr-1.5" />
                        Reject
                      </Button>
                      <Button
                        size="sm"
                        className="bg-emerald-600 hover:bg-emerald-700"
                        onClick={() => {
                          handleUpdateMatchStatus(selectedDonorMatch.match.id, "CONFIRMED");
                          setShowDonorDetailModal(false);
                          setSelectedDonorMatch(null);
                        }}
                      >
                        <CheckCircle className="h-4 w-4 mr-1.5" />
                        Confirm
                      </Button>
                    </>
                  )}
                  {selectedDonorMatch.match.status === "CONFIRMED" && (
                    <Button
                      size="sm"
                      onClick={() => {
                        handleUpdateMatchStatus(selectedDonorMatch.match.id, "COMPLETED");
                        setShowDonorDetailModal(false);
                        setSelectedDonorMatch(null);
                      }}
                    >
                      <CheckCircle className="h-4 w-4 mr-1.5" />
                      Mark Complete
                    </Button>
                  )}
                </div>
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowDonorDetailModal(false);
                    setSelectedDonorMatch(null);
                    setShowRawData(false);
                  }}
                >
                  Close
                </Button>
              </div>
            </div>
          )}
        </Modal>
      </div>
    </div>
  );
}
