"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import type { TriageRecord, Appointment, Patient, Doctor } from "@/lib/types";
import {
  URGENCY_LABELS,
  URGENCY_COLORS,
  DEPARTMENT_COLORS,
} from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";

// ─── Types ──────────────────────────────────────────────────────────────────

type Tab = "queue" | "appointments" | "analytics";

interface TriageWithPatient extends TriageRecord {
  patients: Patient | null;
}

interface AppointmentWithRefs extends Appointment {
  patients: Patient | null;
  doctor_registry: Doctor | null;
  triage_records: TriageRecord | null;
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const [activeTab, setActiveTab] = useState<Tab>("queue");
  const [triageRecords, setTriageRecords] = useState<TriageWithPatient[]>([]);
  const [appointments, setAppointments] = useState<AppointmentWithRefs[]>([]);
  const [selectedRecord, setSelectedRecord] = useState<TriageWithPatient | null>(null);
  const [loading, setLoading] = useState(true);

  const supabase = createClient();

  // ─── Data fetching ──────────────────────────────────────────────────────

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [triageRes, apptRes] = await Promise.all([
      supabase
        .from("triage_records")
        .select("*, patients(*)")
        .order("created_at", { ascending: false })
        .limit(50),
      supabase
        .from("appointments")
        .select("*, patients(*), doctor_registry(*), triage_records(*)")
        .order("slot_time", { ascending: true })
        .limit(20),
    ]);

    if (triageRes.data) setTriageRecords(triageRes.data as TriageWithPatient[]);
    if (apptRes.data) setAppointments(apptRes.data as AppointmentWithRefs[]);
    setLoading(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ─── Realtime subscription ────────────────────────────────────────────

  useEffect(() => {
    const channel = supabase
      .channel("portal-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "triage_records" },
        () => {
          fetchData();
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "appointments" },
        () => {
          fetchData();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Analytics calculations ───────────────────────────────────────────

  const departmentData = (() => {
    const counts: Record<string, number> = {};
    triageRecords.forEach((r) => {
      const dept = r.department || "Unknown";
      counts[dept] = (counts[dept] || 0) + 1;
    });
    return Object.entries(counts)
      .map(([department, count]) => ({ department, count }))
      .sort((a, b) => b.count - a.count);
  })();

  const urgencyData = (() => {
    const counts: Record<number, number> = {};
    triageRecords.forEach((r) => {
      const urg = r.urgency_score || 3;
      counts[urg] = (counts[urg] || 0) + 1;
    });
    return Object.entries(counts).map(([urgency, count]) => ({
      name: URGENCY_LABELS[Number(urgency)] || `Level ${urgency}`,
      value: count,
      urgency: Number(urgency),
    }));
  })();

  const stats = {
    total: triageRecords.length,
    pending: triageRecords.filter((r) => r.status === "pending").length,
    booked: triageRecords.filter((r) => r.status === "booked").length,
    resolved: triageRecords.filter((r) => r.status === "resolved").length,
    emergencies: triageRecords.filter((r) => r.is_emergency).length,
    accuracy:
      triageRecords.filter((r) => r.doctor_feedback === "correct").length /
        Math.max(triageRecords.filter((r) => r.doctor_feedback).length, 1) *
        100,
    appointments: appointments.length,
  };

  // ─── Feedback handler ─────────────────────────────────────────────────

  const handleFeedback = async (
    recordId: string,
    feedback: "correct" | "wrong" | "partial"
  ) => {
    await supabase
      .from("triage_records")
      .update({ doctor_feedback: feedback })
      .eq("id", recordId);
    fetchData();
  };

  // ─── Render ───────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-[#0a0a0f]">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-white/5 bg-[#0a0a0f]/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-3">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-500 to-cyan-500">
              <span className="text-sm font-bold text-white">S</span>
            </div>
            <div>
              <span className="text-lg font-semibold tracking-tight text-white">
                shebok.ai
              </span>
              <Badge
                variant="secondary"
                className="ml-2 bg-emerald-500/10 text-emerald-400 text-[10px] border border-emerald-500/20"
              >
                Doctor Portal
              </Badge>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-3 py-1.5 border border-emerald-500/20">
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-xs text-emerald-400 font-medium">
                Live
              </span>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-6">
        {/* Stats Row */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7 mb-6">
          {[
            { label: "Total Triages", value: stats.total, color: "text-white" },
            { label: "Pending", value: stats.pending, color: "text-amber-400" },
            { label: "Booked", value: stats.booked, color: "text-blue-400" },
            { label: "Resolved", value: stats.resolved, color: "text-emerald-400" },
            { label: "Emergencies", value: stats.emergencies, color: "text-red-400" },
            { label: "Appointments", value: stats.appointments, color: "text-violet-400" },
            {
              label: "AI Accuracy",
              value: `${stats.accuracy.toFixed(0)}%`,
              color: "text-cyan-400",
            },
          ].map((s) => (
            <div
              key={s.label}
              className="rounded-xl border border-white/5 bg-white/[0.02] p-3 backdrop-blur"
            >
              <p className="text-[11px] font-medium text-zinc-500 uppercase tracking-wider">
                {s.label}
              </p>
              <p className={`text-2xl font-bold ${s.color} mt-1`}>{s.value}</p>
            </div>
          ))}
        </div>

        {/* Tab Navigation */}
        <div className="flex gap-1 mb-6 bg-white/[0.03] rounded-lg p-1 border border-white/5 w-fit">
          {(
            [
              { id: "queue", label: "Triage Queue", emoji: "🏥" },
              { id: "appointments", label: "Appointments", emoji: "📅" },
              { id: "analytics", label: "Analytics", emoji: "📊" },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
                activeTab === tab.id
                  ? "bg-white/10 text-white shadow-sm"
                  : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              {tab.emoji} {tab.label}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
          </div>
        ) : (
          <>
            {/* ─── Queue Tab ──────────────────────────────────────── */}
            {activeTab === "queue" && (
              <div className="grid gap-4 lg:grid-cols-[1fr_400px]">
                {/* Triage List */}
                <div className="space-y-3">
                  {triageRecords.length === 0 ? (
                    <div className="rounded-xl border border-white/5 bg-white/[0.02] p-12 text-center">
                      <p className="text-zinc-500">
                        No triage records yet. Send a WhatsApp message to start.
                      </p>
                    </div>
                  ) : (
                    triageRecords.map((record) => (
                      <div
                        key={record.id}
                        onClick={() => setSelectedRecord(record)}
                        className={`rounded-xl border p-4 cursor-pointer transition-all hover:bg-white/[0.03] ${
                          selectedRecord?.id === record.id
                            ? "border-emerald-500/30 bg-emerald-500/[0.03]"
                            : "border-white/5 bg-white/[0.02]"
                        } ${record.is_emergency ? "border-red-500/30 bg-red-500/[0.03]" : ""}`}
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1.5">
                              <span className="text-sm font-medium text-white truncate">
                                {record.patients?.name || `Patient ${record.patient_id?.slice(0, 8)}`}
                              </span>
                              {record.is_emergency && (
                                <Badge className="bg-red-500/20 text-red-400 border-red-500/30 text-[10px]">
                                  🚨 EMERGENCY
                                </Badge>
                              )}
                            </div>
                            <p className="text-sm text-zinc-400 truncate">
                              {record.chief_complaint || "No complaint recorded"}
                            </p>
                            <div className="flex items-center gap-2 mt-2">
                              {record.department && (
                                <Badge
                                  className="text-[10px] border"
                                  style={{
                                    backgroundColor: `${DEPARTMENT_COLORS[record.department] || "#6366f1"}15`,
                                    color: DEPARTMENT_COLORS[record.department] || "#6366f1",
                                    borderColor: `${DEPARTMENT_COLORS[record.department] || "#6366f1"}30`,
                                  }}
                                >
                                  {record.department}
                                </Badge>
                              )}
                              {record.icd10_code && (
                                <Badge
                                  variant="secondary"
                                  className="text-[10px] bg-white/5 text-zinc-400 border border-white/10"
                                >
                                  {record.icd10_code}
                                </Badge>
                              )}
                              {record.urgency_score && (
                                <Badge
                                  className="text-[10px] border"
                                  style={{
                                    backgroundColor: `${URGENCY_COLORS[record.urgency_score]}15`,
                                    color: URGENCY_COLORS[record.urgency_score],
                                    borderColor: `${URGENCY_COLORS[record.urgency_score]}30`,
                                  }}
                                >
                                  Urgency {record.urgency_score}/5
                                </Badge>
                              )}
                              <Badge
                                variant="secondary"
                                className={`text-[10px] border ${
                                  record.status === "pending"
                                    ? "bg-amber-500/10 text-amber-400 border-amber-500/20"
                                    : record.status === "booked"
                                    ? "bg-blue-500/10 text-blue-400 border-blue-500/20"
                                    : "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                                }`}
                              >
                                {record.status}
                              </Badge>
                            </div>
                          </div>
                          <span className="text-[11px] text-zinc-600 whitespace-nowrap ml-3">
                            {new Date(record.created_at).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                {/* Detail Panel */}
                <div className="hidden lg:block">
                  {selectedRecord ? (
                    <div className="sticky top-20 rounded-xl border border-white/5 bg-white/[0.02] overflow-hidden">
                      {/* Header */}
                      <div className="border-b border-white/5 bg-gradient-to-r from-emerald-500/5 to-cyan-500/5 p-4">
                        <h3 className="text-base font-semibold text-white">
                          Patient Summary
                        </h3>
                        <p className="text-xs text-zinc-500 mt-0.5">
                          {selectedRecord.patients?.name || "Anonymous Patient"}
                        </p>
                      </div>

                      <div className="p-4 space-y-4">
                        {/* Two-panel layout: Summary + Entities */}
                        <div>
                          <p className="text-[11px] font-medium text-emerald-400 uppercase tracking-wider mb-1.5">
                            AI Narrative Summary
                          </p>
                          <p className="text-sm text-zinc-300 leading-relaxed">
                            {selectedRecord.deepseek_summary || "No summary available"}
                          </p>
                        </div>

                        <div className="border-t border-white/5 pt-3">
                          <p className="text-[11px] font-medium text-cyan-400 uppercase tracking-wider mb-1.5">
                            Extracted Entities (BioBERT)
                          </p>
                          <div className="space-y-2">
                            {selectedRecord.symptoms?.length > 0 && (
                              <div>
                                <span className="text-[10px] text-zinc-500">Symptoms:</span>
                                <div className="flex flex-wrap gap-1 mt-0.5">
                                  {(Array.isArray(selectedRecord.symptoms) ? selectedRecord.symptoms : []).map(
                                    (s: string, i: number) => (
                                      <span
                                        key={i}
                                        className="text-[11px] px-2 py-0.5 rounded-full bg-violet-500/10 text-violet-400 border border-violet-500/20"
                                      >
                                        {s}
                                      </span>
                                    )
                                  )}
                                </div>
                              </div>
                            )}
                            {selectedRecord.body_locations?.length > 0 && (
                              <div>
                                <span className="text-[10px] text-zinc-500">Body Locations:</span>
                                <div className="flex flex-wrap gap-1 mt-0.5">
                                  {(Array.isArray(selectedRecord.body_locations) ? selectedRecord.body_locations : []).map(
                                    (s: string, i: number) => (
                                      <span
                                        key={i}
                                        className="text-[11px] px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20"
                                      >
                                        {s}
                                      </span>
                                    )
                                  )}
                                </div>
                              </div>
                            )}
                            {selectedRecord.icd10_code && (
                              <div>
                                <span className="text-[10px] text-zinc-500">ICD-10:</span>
                                <span className="ml-1 text-sm font-mono text-amber-400">
                                  {selectedRecord.icd10_code}
                                </span>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Feedback */}
                        <div className="border-t border-white/5 pt-3">
                          <p className="text-[11px] font-medium text-zinc-500 uppercase tracking-wider mb-2">
                            AI Classification Feedback
                          </p>
                          <div className="flex gap-2">
                            {(["correct", "wrong", "partial"] as const).map((fb) => (
                              <Button
                                key={fb}
                                size="sm"
                                variant={
                                  selectedRecord.doctor_feedback === fb
                                    ? "default"
                                    : "outline"
                                }
                                onClick={() =>
                                  handleFeedback(selectedRecord.id, fb)
                                }
                                className={`text-xs capitalize ${
                                  selectedRecord.doctor_feedback === fb
                                    ? fb === "correct"
                                      ? "bg-emerald-600 hover:bg-emerald-700"
                                      : fb === "wrong"
                                      ? "bg-red-600 hover:bg-red-700"
                                      : "bg-amber-600 hover:bg-amber-700"
                                    : "border-white/10 text-zinc-400 hover:text-white"
                                }`}
                              >
                                {fb === "correct" ? "✓ Correct" : fb === "wrong" ? "✗ Wrong" : "◐ Partial"}
                              </Button>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-xl border border-dashed border-white/10 p-12 text-center">
                      <p className="text-sm text-zinc-600">
                        Select a triage record to view details
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ─── Appointments Tab ──────────────────────────────── */}
            {activeTab === "appointments" && (
              <div className="space-y-3">
                {appointments.length === 0 ? (
                  <div className="rounded-xl border border-white/5 bg-white/[0.02] p-12 text-center">
                    <p className="text-zinc-500">
                      No appointments yet. Complete a triage to book.
                    </p>
                  </div>
                ) : (
                  appointments.map((appt) => (
                    <Card
                      key={appt.id}
                      className="border-white/5 bg-white/[0.02]"
                    >
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-4">
                            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500/20 to-violet-500/20 border border-blue-500/20">
                              <span className="text-xl">📅</span>
                            </div>
                            <div>
                              <p className="text-sm font-medium text-white">
                                {appt.patients?.name || "Patient"}
                                <span className="text-zinc-500 mx-1.5">→</span>
                                Dr. {appt.doctor_registry?.name || "Unknown"}
                              </p>
                              <p className="text-xs text-zinc-500 mt-0.5">
                                {appt.doctor_registry?.specialty} ·{" "}
                                {new Date(appt.slot_time).toLocaleDateString()} at{" "}
                                {new Date(appt.slot_time).toLocaleTimeString([], {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })}
                              </p>
                            </div>
                          </div>
                          <Badge
                            className={`text-[10px] border ${
                              appt.status === "confirmed"
                                ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                                : appt.status === "pending"
                                ? "bg-amber-500/10 text-amber-400 border-amber-500/20"
                                : "bg-zinc-500/10 text-zinc-400 border-zinc-500/20"
                            }`}
                          >
                            {appt.status}
                          </Badge>
                        </div>
                        {appt.triage_records?.chief_complaint && (
                          <p className="text-xs text-zinc-500 mt-2 pl-16">
                            Chief complaint: {appt.triage_records.chief_complaint}
                          </p>
                        )}
                      </CardContent>
                    </Card>
                  ))
                )}
              </div>
            )}

            {/* ─── Analytics Tab ─────────────────────────────────── */}
            {activeTab === "analytics" && (
              <div className="grid gap-4 md:grid-cols-2">
                {/* Department Distribution */}
                <Card className="border-white/5 bg-white/[0.02]">
                  <CardHeader>
                    <CardTitle className="text-sm text-white">
                      Department Distribution
                    </CardTitle>
                    <CardDescription className="text-xs">
                      Triage records by department
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {departmentData.length > 0 ? (
                      <ResponsiveContainer width="100%" height={280}>
                        <BarChart
                          data={departmentData}
                          layout="vertical"
                          margin={{ left: 20 }}
                        >
                          <XAxis type="number" tick={{ fill: "#71717a", fontSize: 11 }} />
                          <YAxis
                            type="category"
                            dataKey="department"
                            tick={{ fill: "#a1a1aa", fontSize: 11 }}
                            width={120}
                          />
                          <Tooltip
                            contentStyle={{
                              background: "#18181b",
                              border: "1px solid rgba(255,255,255,0.1)",
                              borderRadius: "8px",
                              fontSize: "12px",
                            }}
                          />
                          <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                            {departmentData.map((entry) => (
                              <Cell
                                key={entry.department}
                                fill={
                                  DEPARTMENT_COLORS[entry.department] || "#6366f1"
                                }
                              />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    ) : (
                      <p className="text-sm text-zinc-600 text-center py-8">
                        No data yet
                      </p>
                    )}
                  </CardContent>
                </Card>

                {/* Urgency Distribution */}
                <Card className="border-white/5 bg-white/[0.02]">
                  <CardHeader>
                    <CardTitle className="text-sm text-white">
                      Urgency Distribution
                    </CardTitle>
                    <CardDescription className="text-xs">
                      Patient urgency scores
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {urgencyData.length > 0 ? (
                      <ResponsiveContainer width="100%" height={280}>
                        <PieChart>
                          <Pie
                            data={urgencyData}
                            dataKey="value"
                            nameKey="name"
                            cx="50%"
                            cy="50%"
                            outerRadius={100}
                            innerRadius={50}
                            paddingAngle={3}
                            label={({ name, value }) => `${name}: ${value}`}
                            labelLine={false}
                          >
                            {urgencyData.map((entry) => (
                              <Cell
                                key={entry.name}
                                fill={
                                  URGENCY_COLORS[entry.urgency] || "#6366f1"
                                }
                              />
                            ))}
                          </Pie>
                          <Tooltip
                            contentStyle={{
                              background: "#18181b",
                              border: "1px solid rgba(255,255,255,0.1)",
                              borderRadius: "8px",
                              fontSize: "12px",
                            }}
                          />
                          <Legend
                            wrapperStyle={{ fontSize: "11px", color: "#a1a1aa" }}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                    ) : (
                      <p className="text-sm text-zinc-600 text-center py-8">
                        No data yet
                      </p>
                    )}
                  </CardContent>
                </Card>

                {/* Accuracy Card */}
                <Card className="border-white/5 bg-white/[0.02] md:col-span-2">
                  <CardHeader>
                    <CardTitle className="text-sm text-white">
                      AI Classification Accuracy
                    </CardTitle>
                    <CardDescription className="text-xs">
                      Based on doctor feedback annotations
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center gap-8">
                      <div className="relative h-32 w-32">
                        <svg className="h-32 w-32 -rotate-90" viewBox="0 0 120 120">
                          <circle
                            cx="60"
                            cy="60"
                            r="50"
                            fill="none"
                            stroke="rgba(255,255,255,0.05)"
                            strokeWidth="10"
                          />
                          <circle
                            cx="60"
                            cy="60"
                            r="50"
                            fill="none"
                            stroke="url(#accuracy-gradient)"
                            strokeWidth="10"
                            strokeLinecap="round"
                            strokeDasharray={`${(stats.accuracy / 100) * 314} 314`}
                          />
                          <defs>
                            <linearGradient id="accuracy-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
                              <stop offset="0%" stopColor="#10b981" />
                              <stop offset="100%" stopColor="#06b6d4" />
                            </linearGradient>
                          </defs>
                        </svg>
                        <div className="absolute inset-0 flex items-center justify-center">
                          <span className="text-2xl font-bold text-white">
                            {stats.accuracy.toFixed(0)}%
                          </span>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <span className="h-3 w-3 rounded-full bg-emerald-500" />
                          <span className="text-sm text-zinc-400">
                            Correct: {triageRecords.filter((r) => r.doctor_feedback === "correct").length}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="h-3 w-3 rounded-full bg-amber-500" />
                          <span className="text-sm text-zinc-400">
                            Partial: {triageRecords.filter((r) => r.doctor_feedback === "partial").length}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="h-3 w-3 rounded-full bg-red-500" />
                          <span className="text-sm text-zinc-400">
                            Wrong: {triageRecords.filter((r) => r.doctor_feedback === "wrong").length}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="h-3 w-3 rounded-full bg-zinc-700" />
                          <span className="text-sm text-zinc-400">
                            Pending review: {triageRecords.filter((r) => !r.doctor_feedback).length}
                          </span>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
