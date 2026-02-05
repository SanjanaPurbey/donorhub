import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { Heart, Droplet, GitMerge, AlertTriangle, CheckCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatBloodGroup, formatDateTime } from "@/lib/utils";
import Link from "next/link";

// Type for matches with included relations
interface MatchWithRelations {
  id: string;
  createdAt: Date;
  donor: { firstName: string; lastName: string; bloodGroup: string };
  bloodRequest: { patientName: string; hospital: string };
}

async function getDashboardStats() {
  const [
    totalDonors,
    availableDonors,
    totalRequests,
    pendingRequests,
    matchedRequests,
    fulfilledRequests,
    recentRequests,
    recentMatches,
  ] = await Promise.all([
    prisma.donor.count({ where: { deletedAt: null } }),
    prisma.donor.count({ where: { deletedAt: null, isAvailable: true } }),
    prisma.bloodRequest.count({ where: { deletedAt: null } }),
    prisma.bloodRequest.count({ where: { deletedAt: null, status: "PENDING" } }),
    prisma.bloodRequest.count({ where: { deletedAt: null, status: "MATCHED" } }),
    prisma.bloodRequest.count({ where: { deletedAt: null, status: "FULFILLED" } }),
    prisma.bloodRequest.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: {
        id: true,
        patientName: true,
        bloodGroup: true,
        hospital: true,
        urgency: true,
        status: true,
        createdAt: true,
      },
    }),
    prisma.donorMatch.findMany({
      orderBy: { createdAt: "desc" },
      take: 5,
      include: {
        donor: { select: { firstName: true, lastName: true, bloodGroup: true } },
        bloodRequest: { select: { patientName: true, hospital: true } },
      },
    }) as unknown as Promise<MatchWithRelations[]>,
  ]);

  return {
    totalDonors,
    availableDonors,
    totalRequests,
    pendingRequests,
    matchedRequests,
    fulfilledRequests,
    recentRequests,
    recentMatches,
  };
}

function StatCard({
  title,
  value,
  subtitle,
  icon,
}: {
  title: string;
  value: number;
  subtitle: string;
  icon: React.ReactNode;
}) {
  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm font-medium text-slate-500">{title}</p>
            <p className="mt-1 text-3xl font-bold text-slate-900">{value}</p>
            <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
          </div>
          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-rose-50 text-rose-600">
            {icon}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function getUrgencyStyles(urgency: string) {
  switch (urgency) {
    case "CRITICAL":
      return "bg-red-100 text-red-700";
    case "HIGH":
      return "bg-orange-100 text-orange-700";
    case "MEDIUM":
      return "bg-yellow-100 text-yellow-700";
    default:
      return "bg-green-100 text-green-700";
  }
}

function getStatusStyles(status: string) {
  switch (status) {
    case "PENDING":
      return "bg-blue-100 text-blue-700";
    case "MATCHED":
      return "bg-purple-100 text-purple-700";
    case "FULFILLED":
      return "bg-green-100 text-green-700";
    case "CANCELLED":
      return "bg-slate-100 text-slate-700";
    default:
      return "bg-slate-100 text-slate-700";
  }
}

export default async function DashboardPage() {
  const session = await auth();
  const stats = await getDashboardStats();

  return (
    <div className="p-6 lg:p-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">
          Welcome back, {session?.user?.name?.split(" ")[0]}
        </h1>
        <p className="mt-1 text-slate-500">
          Here is an overview of the blood donation coordination system.
        </p>
      </div>

      {/* Stats Grid */}
      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Total Donors"
          value={stats.totalDonors}
          subtitle={`${stats.availableDonors} available`}
          icon={<Heart className="h-6 w-6" />}
        />
        <StatCard
          title="Blood Requests"
          value={stats.totalRequests}
          subtitle={`${stats.pendingRequests} pending`}
          icon={<Droplet className="h-6 w-6" />}
        />
        <StatCard
          title="Matched"
          value={stats.matchedRequests}
          subtitle="Awaiting fulfillment"
          icon={<GitMerge className="h-6 w-6" />}
        />
        <StatCard
          title="Fulfilled"
          value={stats.fulfilledRequests}
          subtitle="Successfully completed"
          icon={<CheckCircle className="h-6 w-6" />}
        />
      </div>

      {/* Recent Activity */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Recent Requests */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-4">
            <CardTitle className="text-lg">Recent Blood Requests</CardTitle>
            <Link
              href="/dashboard/requests"
              className="text-sm font-medium text-rose-600 hover:text-rose-700"
            >
              View all
            </Link>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-slate-100">
              {stats.recentRequests.length === 0 ? (
                <div className="p-6 text-center text-sm text-slate-500">
                  No blood requests yet
                </div>
              ) : (
                stats.recentRequests.map((request) => (
                  <div key={request.id} className="flex items-center gap-4 px-6 py-4">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-rose-100 text-rose-700 font-semibold text-sm">
                      {formatBloodGroup(request.bloodGroup)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="truncate font-medium text-slate-900">
                        {request.patientName}
                      </p>
                      <p className="truncate text-sm text-slate-500">
                        {request.hospital}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`rounded-full px-2 py-1 text-xs font-medium ${getUrgencyStyles(request.urgency)}`}>
                        {request.urgency}
                      </span>
                      <span className={`rounded-full px-2 py-1 text-xs font-medium ${getStatusStyles(request.status)}`}>
                        {request.status}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>

        {/* Recent Matches */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-4">
            <CardTitle className="text-lg">Recent Matches</CardTitle>
            <Link
              href="/dashboard/matches"
              className="text-sm font-medium text-rose-600 hover:text-rose-700"
            >
              View all
            </Link>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-slate-100">
              {stats.recentMatches.length === 0 ? (
                <div className="p-6 text-center text-sm text-slate-500">
                  No matches yet
                </div>
              ) : (
                stats.recentMatches.map((match) => (
                  <div key={match.id} className="flex items-center gap-4 px-6 py-4">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                      <GitMerge className="h-5 w-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="truncate font-medium text-slate-900">
                        {match.donor.firstName} {match.donor.lastName}
                      </p>
                      <p className="truncate text-sm text-slate-500">
                        Matched with {match.bloodRequest.patientName}
                      </p>
                    </div>
                    <div className="text-right">
                      <span className="text-xs text-slate-500">
                        {formatDateTime(match.createdAt)}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      {stats.pendingRequests > 0 && (
        <Card className="mt-6 border-amber-200 bg-amber-50">
          <CardContent className="flex items-center gap-4 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-100">
              <AlertTriangle className="h-5 w-5 text-amber-600" />
            </div>
            <div className="flex-1">
              <p className="font-medium text-amber-900">
                {stats.pendingRequests} pending blood request{stats.pendingRequests !== 1 ? "s" : ""} need attention
              </p>
              <p className="text-sm text-amber-700">
                Review and match donors to fulfill these requests.
              </p>
            </div>
            <Link
              href="/dashboard/requests?status=PENDING"
              className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 transition-colors"
            >
              View Requests
            </Link>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
