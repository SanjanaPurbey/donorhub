"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { redirect } from "next/navigation";
import {
  AlertTriangle,
  Database,
  Trash2,
  Loader2,
  CheckCircle,
  XCircle,
  Shield,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function DevToolsPage() {
  const { data: session, status } = useSession();
  const [devToolsEnabled, setDevToolsEnabled] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [resetting, setResetting] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [result, setResult] = useState<{
    success: boolean;
    message: string;
    deleted?: {
      ledgerEntries: number;
      matches: number;
      bloodRequests: number;
      donors: number;
    };
  } | null>(null);

  // Redirect if not admin
  useEffect(() => {
    if (status === "authenticated" && session?.user?.role !== "SYSTEM_ADMIN") {
      redirect("/dashboard");
    }
  }, [session, status]);

  // Check if dev tools are enabled
  useEffect(() => {
    const checkDevTools = async () => {
      try {
        const response = await fetch("/api/admin/reset-database");
        const data = await response.json();
        setDevToolsEnabled(data.enabled ?? false);
      } catch {
        setDevToolsEnabled(false);
      } finally {
        setLoading(false);
      }
    };

    if (status === "authenticated") {
      checkDevTools();
    }
  }, [status]);

  const handleReset = async () => {
    if (confirmText !== "RESET DATABASE") {
      return;
    }

    setResetting(true);
    setResult(null);

    try {
      const response = await fetch("/api/admin/reset-database", {
        method: "DELETE",
      });

      const data = await response.json();

      if (response.ok) {
        setResult({
          success: true,
          message: data.message,
          deleted: data.deleted,
        });
        setConfirmReset(false);
        setConfirmText("");
      } else {
        setResult({
          success: false,
          message: data.error || "Failed to reset database",
        });
      }
    } catch {
      setResult({
        success: false,
        message: "An error occurred while resetting the database",
      });
    } finally {
      setResetting(false);
    }
  };

  if (status === "loading" || loading) {
    return (
      <div className="flex justify-center items-center min-h-64">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    );
  }

  if (session?.user?.role !== "SYSTEM_ADMIN") {
    return null;
  }

  if (!devToolsEnabled) {
    return (
      <div className="p-6 lg:p-8">
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Developer Tools
          </h1>
          <p className="text-gray-600 mt-1">
            Development and testing utilities
          </p>
        </div>

        <Card className="border-yellow-200 bg-yellow-50">
          <CardContent className="pt-6">
            <div className="flex items-start gap-4">
              <Shield className="h-8 w-8 text-yellow-600 shrink-0" />
              <div>
                <h3 className="font-semibold text-yellow-800">
                  Developer Tools Disabled
                </h3>
                <p className="text-sm text-yellow-700 mt-1">
                  Developer tools are currently disabled. To enable them, set the
                  environment variable:
                </p>
                <pre className="bg-yellow-100 rounded px-3 py-2 mt-2 text-sm font-mono text-yellow-800">
                  ENABLE_DEV_TOOLS=true
                </pre>
                <p className="text-xs text-yellow-600 mt-2">
                  ⚠️ Only enable this in development environments. Never enable in production.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8">
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Developer Tools</h1>
        <p className="text-gray-600 mt-1">
          Development and testing utilities
        </p>
      </div>

      {/* Warning Banner */}
      <Card className="border-red-200 bg-red-50">
        <CardContent className="pt-6">
          <div className="flex items-start gap-4">
            <AlertTriangle className="h-8 w-8 text-red-600 shrink-0" />
            <div>
              <h3 className="font-semibold text-red-800">
                Development Mode Active
              </h3>
              <p className="text-sm text-red-700 mt-1">
                Developer tools are enabled. These actions are destructive and
                cannot be undone. Ensure you are in a development environment.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Result Message */}
      {result && (
        <Card
          className={
            result.success
              ? "border-green-200 bg-green-50"
              : "border-red-200 bg-red-50"
          }
        >
          <CardContent className="pt-6">
            <div className="flex items-start gap-4">
              {result.success ? (
                <CheckCircle className="h-6 w-6 text-green-600 shrink-0" />
              ) : (
                <XCircle className="h-6 w-6 text-red-600 shrink-0" />
              )}
              <div>
                <h3
                  className={`font-semibold ${
                    result.success ? "text-green-800" : "text-red-800"
                  }`}
                >
                  {result.success ? "Reset Complete" : "Reset Failed"}
                </h3>
                <p
                  className={`text-sm mt-1 ${
                    result.success ? "text-green-700" : "text-red-700"
                  }`}
                >
                  {result.message}
                </p>
                {result.deleted && (
                  <div className="mt-3 grid grid-cols-2 gap-2 text-sm text-green-700">
                    <div>Donors deleted: {result.deleted.donors}</div>
                    <div>Blood requests: {result.deleted.bloodRequests}</div>
                    <div>Matches: {result.deleted.matches}</div>
                    <div>Ledger entries: {result.deleted.ledgerEntries}</div>
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Database Reset Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            Database Reset
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-gray-600">
            Reset the database by removing all data except user accounts.
            This will delete:
          </p>
          <ul className="text-sm text-gray-600 list-disc list-inside space-y-1 ml-2">
            <li>All donors</li>
            <li>All blood requests</li>
            <li>All donor matches</li>
            <li>All hash ledger entries</li>
          </ul>
          <p className="text-sm text-gray-600">
            <strong>Preserved:</strong> Admin and coordinator user accounts
          </p>

          {!confirmReset ? (
            <Button
              variant="destructive"
              onClick={() => setConfirmReset(true)}
              className="mt-4"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Reset Database
            </Button>
          ) : (
            <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg space-y-4">
              <p className="text-sm font-medium text-red-800">
                Type <code className="bg-red-100 px-1 rounded">RESET DATABASE</code> to confirm:
              </p>
              <input
                type="text"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder="RESET DATABASE"
                className="w-full px-3 py-2 border border-red-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 text-sm"
              />
              <div className="flex gap-2">
                <Button
                  variant="destructive"
                  onClick={handleReset}
                  disabled={confirmText !== "RESET DATABASE" || resetting}
                >
                  {resetting ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Resetting...
                    </>
                  ) : (
                    <>
                      <Trash2 className="h-4 w-4 mr-2" />
                      Confirm Reset
                    </>
                  )}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setConfirmReset(false);
                    setConfirmText("");
                  }}
                  disabled={resetting}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
    </div>
  );
}
