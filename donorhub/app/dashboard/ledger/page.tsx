"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { redirect } from "next/navigation";
import {
  Search,
  Filter,
  Shield,
  CheckCircle,
  XCircle,
  Clock,
  FileText,
  ChevronRight,
  ChevronDown,
  X,
  Loader2,
  Hash,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Pagination } from "@/components/ui/pagination";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface LedgerEntry {
  id: string;
  sequence: number;
  eventType: string;
  entityId: string;
  entityType: string;
  payload: Record<string, unknown>;
  currentHash: string;
  previousHash: string;
  timestamp: string;
}

interface PaginationData {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

const eventTypeLabels: Record<string, { label: string; color: "success" | "info" | "warning" | "primary" }> = {
  DONOR_CREATED: { label: "Donor Created", color: "success" },
  DONOR_UPDATED: { label: "Donor Updated", color: "info" },
  REQUEST_CREATED: { label: "Request Created", color: "warning" },
  REQUEST_UPDATED: { label: "Request Updated", color: "info" },
  REQUEST_FULFILLED: { label: "Request Fulfilled", color: "success" },
  MATCH_CREATED: { label: "Match Created", color: "primary" },
};

export default function LedgerPage() {
  const { data: session, status } = useSession();
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [pagination, setPagination] = useState<PaginationData>({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 0,
  });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [eventTypeFilter, setEventTypeFilter] = useState("");
  const [entityTypeFilter, setEntityTypeFilter] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [filterOptions, setFilterOptions] = useState<{
    eventTypes: string[];
    entityTypes: string[];
  }>({ eventTypes: [], entityTypes: [] });

  // Expanded rows for viewing details
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  // Verification state
  const [verifying, setVerifying] = useState<string | null>(null);
  const [verificationResults, setVerificationResults] = useState<
    Record<string, { isValid: boolean; error?: string }>
  >({});

  // Pretty/Raw JSON toggle state (per entry)
  const [prettyView, setPrettyView] = useState<Record<string, boolean>>({});

  // Redirect if not admin
  useEffect(() => {
    if (status === "authenticated" && session?.user?.role !== "SYSTEM_ADMIN") {
      redirect("/dashboard");
    }
  }, [session, status]);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const fetchEntries = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(pagination.page),
        limit: String(pagination.limit),
      });

      if (debouncedSearch) params.set("search", debouncedSearch);
      if (eventTypeFilter) params.set("eventType", eventTypeFilter);
      if (entityTypeFilter) params.set("entityType", entityTypeFilter);

      const response = await fetch(`/api/ledger?${params}`);
      const data = await response.json();

      if (data.success) {
        setEntries(data.data);
        setPagination(data.pagination);
        setFilterOptions(data.filters);
      }
    } catch (error) {
      console.error("Failed to fetch ledger:", error);
    } finally {
      setLoading(false);
    }
  }, [pagination.page, pagination.limit, debouncedSearch, eventTypeFilter, entityTypeFilter]);

  useEffect(() => {
    if (status === "authenticated" && session?.user?.role === "SYSTEM_ADMIN") {
      fetchEntries();
    }
  }, [fetchEntries, status, session?.user?.role]);

  const toggleExpand = (id: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const verifyEntry = async (entryId: string) => {
    setVerifying(entryId);
    try {
      const response = await fetch("/api/ledger", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entryId }),
      });

      const result = await response.json();

      if (result.success) {
        // Build error message including debug info if verification failed
        let errorMsg = result.data.note;
        if (!result.data.isValid && result.data.debug) {
          const debug = result.data.debug;
          errorMsg = `${errorMsg} [hasTimestamp: ${debug.hasStoredTimestamp}]`;
        }
        
        setVerificationResults((prev) => ({
          ...prev,
          [entryId]: { 
            isValid: result.data.isValid,
            error: errorMsg,
          },
        }));
      } else {
        setVerificationResults((prev) => ({
          ...prev,
          [entryId]: { isValid: false, error: result.error },
        }));
      }
    } catch {
      setVerificationResults((prev) => ({
        ...prev,
        [entryId]: { isValid: false, error: "Verification failed" },
      }));
    } finally {
      setVerifying(null);
    }
  };

  const formatDateTime = (dateString: string) => {
    return new Date(dateString).toLocaleString("en-IN", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  };

  const truncateHash = (hash: string | undefined | null) => {
    if (!hash) return "N/A";
    return `${hash.slice(0, 8)}...${hash.slice(-8)}`;
  };

  if (status === "loading") {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="h-8 w-8 border-4 border-red-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (session?.user?.role !== "SYSTEM_ADMIN") {
    return null;
  }

  return (
    <div className="p-6 lg:p-8">
      <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Audit Ledger</h1>
          <p className="text-slate-500 mt-1">
            Immutable hash chain of all system events for accountability
          </p>
        </div>
        <div className="flex items-center gap-2 px-4 py-2 bg-green-50 text-green-700 rounded-lg">
          <Shield className="h-5 w-5" />
          <span className="font-medium">Blockchain-Style Integrity</span>
        </div>
      </div>

      {/* Search and Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search by entity ID..."
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
              {(eventTypeFilter || entityTypeFilter) && (
                <span className="ml-2 bg-red-100 text-red-700 px-2 py-0.5 rounded-full text-xs">
                  {[eventTypeFilter, entityTypeFilter].filter(Boolean).length}
                </span>
              )}
            </Button>
          </div>

          {showFilters && (
            <div className="mt-4 pt-4 border-t flex items-end gap-4">
              <div className="w-48">
                <Select
                  label="Event Type"
                  value={eventTypeFilter}
                  onChange={(e) => setEventTypeFilter(e.target.value)}
                  options={[
                    { value: "", label: "All Events" },
                    ...filterOptions.eventTypes.map((type) => ({
                      value: type,
                      label: eventTypeLabels[type]?.label || type,
                    })),
                  ]}
                />
              </div>
              <div className="w-48">
                <Select
                  label="Entity Type"
                  value={entityTypeFilter}
                  onChange={(e) => setEntityTypeFilter(e.target.value)}
                  options={[
                    { value: "", label: "All Entities" },
                    ...filterOptions.entityTypes.map((type) => ({
                      value: type,
                      label: type,
                    })),
                  ]}
                />
              </div>
              {(eventTypeFilter || entityTypeFilter) && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setEventTypeFilter("");
                    setEntityTypeFilter("");
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

      {/* Ledger Table */}
      <Card>
        <CardHeader className="border-b">
          <CardTitle className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Hash className="h-5 w-5 text-gray-400" />
              Ledger Entries ({pagination.total})
            </span>
          </CardTitle>
        </CardHeader>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b">
                <th className="w-10 px-4 py-3"></th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  Timestamp
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  Event
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  Entity
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  Hash
                </th>
                <th className="px-6 py-3 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  Verify
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center">
                    <div className="flex items-center justify-center gap-2 text-gray-500">
                      <div className="h-5 w-5 border-2 border-red-500 border-t-transparent rounded-full animate-spin" />
                      Loading ledger entries...
                    </div>
                  </td>
                </tr>
              ) : entries.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center">
                    <div className="text-gray-500">
                      <FileText className="h-12 w-12 mx-auto text-gray-300 mb-3" />
                      <p className="font-medium">No ledger entries found</p>
                      <p className="text-sm mt-1">
                        {search || eventTypeFilter || entityTypeFilter
                          ? "Try adjusting your filters"
                          : "Entries will appear as system events occur"}
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                entries.map((entry) => (
                  <React.Fragment key={entry.id}>
                    <tr
                      className="hover:bg-gray-50 cursor-pointer"
                      onClick={() => toggleExpand(entry.id)}
                    >
                      <td className="px-4 py-4">
                        {expandedRows.has(entry.id) ? (
                          <ChevronDown className="h-4 w-4 text-gray-400" />
                        ) : (
                          <ChevronRight className="h-4 w-4 text-gray-400" />
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2 text-sm text-gray-600">
                          <Clock className="h-4 w-4 text-gray-400" />
                          {formatDateTime(entry.timestamp)}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <Badge
                          variant={
                            eventTypeLabels[entry.eventType]?.color || "secondary"
                          }
                        >
                          {eventTypeLabels[entry.eventType]?.label || entry.eventType}
                        </Badge>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm font-medium text-gray-900">
                          {entry.entityType}
                        </div>
                        <div className="text-xs text-gray-500 font-mono">
                          {entry.entityId.slice(0, 12)}...
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="font-mono text-xs text-gray-600 bg-gray-100 px-2 py-1 rounded">
                          {truncateHash(entry.currentHash)}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            verifyEntry(entry.id);
                          }}
                          disabled={verifying === entry.id}
                        >
                          {verifying === entry.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : verificationResults[entry.id] ? (
                            verificationResults[entry.id].isValid ? (
                              <CheckCircle className="h-4 w-4 text-green-500" />
                            ) : (
                              <XCircle className="h-4 w-4 text-red-500" />
                            )
                          ) : (
                            <Shield className="h-4 w-4" />
                          )}
                        </Button>
                      </td>
                    </tr>
                    {expandedRows.has(entry.id) && (
                      <tr className="bg-gray-50">
                        <td colSpan={6} className="px-6 py-4">
                          <div className="grid grid-cols-2 gap-6">
                            <div>
                              <div className="flex items-center justify-between mb-2">
                                <h4 className="text-sm font-semibold text-gray-700">
                                  Event Data
                                </h4>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() =>
                                    setPrettyView((prev) => ({
                                      ...prev,
                                      [entry.id]: !prev[entry.id],
                                    }))
                                  }
                                  className="text-xs h-7 px-2"
                                >
                                  {prettyView[entry.id] ? "Pretty" : "Raw"}
                                </Button>
                              </div>
                              {prettyView[entry.id] ? (
                                <pre className="bg-white border rounded-lg p-4 text-xs text-gray-700 overflow-x-auto max-h-64 whitespace-pre-wrap break-all">
                                  {JSON.stringify(entry.payload, null, 2)}
                                </pre>
                              ) : (
                                <div className="bg-white border rounded-lg p-4 text-xs text-gray-700 max-h-64 overflow-y-auto">
                                  <table className="w-full">
                                    <tbody>
                                      {Object.entries(entry.payload)
                                        .filter(([key]) => key !== "_hashTimestamp")
                                        .map(([key, value]) => (
                                        <tr key={key} className="border-b border-gray-100 last:border-0">
                                          <td className="py-1.5 pr-4 font-medium text-gray-600 align-top whitespace-nowrap">
                                            {key}
                                          </td>
                                          <td className="py-1.5 text-gray-800 break-all">
                                            {typeof value === "object" && value !== null
                                              ? JSON.stringify(value)
                                              : String(value ?? "-")}
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              )}
                            </div>
                            <div className="space-y-4">
                              <div>
                                <h4 className="text-sm font-semibold text-gray-700 mb-2">
                                  Current Hash
                                </h4>
                                <div className="bg-white border rounded-lg p-3 font-mono text-xs text-gray-600 break-all">
                                  {entry.currentHash}
                                </div>
                              </div>
                              <div>
                                <h4 className="text-sm font-semibold text-gray-700 mb-2">
                                  Previous Hash
                                </h4>
                                <div className="bg-white border rounded-lg p-3 font-mono text-xs text-gray-600 break-all">
                                  {entry.previousHash || (
                                    <span className="text-gray-400 italic">
                                      Genesis entry (no previous hash)
                                    </span>
                                  )}
                                </div>
                              </div>
                              {verificationResults[entry.id] && (
                                <div
                                  className={`p-4 rounded-lg ${
                                    verificationResults[entry.id].isValid
                                      ? "bg-green-50 text-green-700"
                                      : "bg-red-50 text-red-700"
                                  }`}
                                >
                                  <div className="flex items-center gap-2 font-medium">
                                    {verificationResults[entry.id].isValid ? (
                                      <>
                                        <CheckCircle className="h-5 w-5" />
                                        Hash Verified Successfully
                                      </>
                                    ) : (
                                      <>
                                        <XCircle className="h-5 w-5" />
                                        Hash Verification Failed
                                      </>
                                    )}
                                  </div>
                                  {verificationResults[entry.id].error && (
                                    <p className="text-sm mt-1">
                                      {verificationResults[entry.id].error}
                                    </p>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))
              )}
            </tbody>
          </table>
        </div>
        {!loading && entries.length > 0 && (
          <div className="p-4 border-t">
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

      {/* Info Card */}
      <Card>
        <CardContent className="p-6">
          <div className="flex items-start gap-4">
            <div className="p-3 bg-blue-50 rounded-lg">
              <Shield className="h-6 w-6 text-blue-600" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900">
                About the Audit Ledger
              </h3>
              <p className="text-sm text-gray-600 mt-1">
                This ledger uses a blockchain-inspired hash chain to ensure data
                integrity. Each entry is cryptographically linked to the previous
                one, making any tampering immediately detectable. Click the shield
                icon to verify an entry&apos;s hash integrity.
              </p>
              <div className="mt-4 grid grid-cols-3 gap-4 text-sm">
                <div className="bg-gray-50 p-3 rounded-lg">
                  <div className="font-medium text-gray-900">SHA-256 Hashing</div>
                  <div className="text-gray-500">Industry-standard algorithm</div>
                </div>
                <div className="bg-gray-50 p-3 rounded-lg">
                  <div className="font-medium text-gray-900">Chain Integrity</div>
                  <div className="text-gray-500">Each entry links to previous</div>
                </div>
                <div className="bg-gray-50 p-3 rounded-lg">
                  <div className="font-medium text-gray-900">Immutable Records</div>
                  <div className="text-gray-500">Tamper-evident audit trail</div>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
      </div>
    </div>
  );
}
