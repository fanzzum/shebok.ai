"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import type { TriageRecord, Appointment, Patient, Doctor } from "@/lib/types";
import { URGENCY_LABELS, URGENCY_COLORS, DEPARTMENT_COLORS } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useRouter } from "next/navigation";
import Image from "next/image";

interface TriageWithPatient extends TriageRecord {
  patients: Patient | null;
}

interface AppointmentWithRefs extends Appointment {
  patients: Patient | null;
  triage_records: TriageRecord | null;
}

export default function DashboardPage() {
  const router = useRouter();
  const supabase = createClient();
  const [doctor, setDoctor] = useState<Doctor | null>(null);
  const [triageRecords, setTriageRecords] = useState<TriageWithPatient[]>([]);
  const [appointments, setAppointments] = useState<AppointmentWithRefs[]>([]);
  const [selectedRecord, setSelectedRecord] = useState<TriageWithPatient | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchProfileAndData = useCallback(async () => {
    setLoading(true);
    
    // 1. Get Logged In User
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return router.push("/login");

    // 2. Get Doctor Profile
    const { data: doctorProfile } = await supabase
      .from("doctor_registry")
      .select("*")
      .eq("auth_id", user.id)
      .single();

    if (!doctorProfile) {
      // Could happen if they haven't linked their account properly yet
      setLoading(false);
      return;
    }
    setDoctor(doctorProfile as Doctor);

    // 3. Fetch specific data for this doctor
    const [triageRes, apptRes] = await Promise.all([
      // Unassigned/Pending Triage in their department
      supabase
        .from("triage_records")
        .select("*, patients(*)")
        .eq("department", doctorProfile.specialty)
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .limit(20),
      // Their appointments
      supabase
        .from("appointments")
        .select("*, patients(*), triage_records(*)")
        .eq("doctor_id", doctorProfile.id)
        .order("slot_time", { ascending: true })
        .limit(20),
    ]);

    if (triageRes.data) setTriageRecords(triageRes.data as TriageWithPatient[]);
    if (apptRes.data) setAppointments(apptRes.data as AppointmentWithRefs[]);
    setLoading(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    fetchProfileAndData();
  }, [fetchProfileAndData]);

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel("portal-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "triage_records" }, () => fetchProfileAndData())
      .on("postgres_changes", { event: "*", schema: "public", table: "appointments" }, () => fetchProfileAndData())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleFeedback = async (recordId: string, feedback: "correct" | "wrong" | "partial") => {
    await supabase.from("triage_records").update({ doctor_feedback: feedback }).eq("id", recordId);
    fetchProfileAndData();
  };

  const handleSignout = async () => {
    await supabase.auth.signOut();
    router.push("/");
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
      </div>
    );
  }

  if (!doctor) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] text-white flex flex-col items-center justify-center p-6">
        <h2 className="text-xl mb-4">Doctor profile not found</h2>
        <p className="text-zinc-400 mb-6 text-center max-w-md">Your account hasn't been properly linked to a doctor registry yet. Please contact the administrator.</p>
        <Button onClick={handleSignout} variant="outline">Sign Out</Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-white/5 bg-[#0a0a0f]/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1400px] items-center justify-between px-6 py-3">
          <div className="flex items-center gap-3">
            <Image src="/logo-transparent.png" alt="Shebok AI" width={54} height={54} className="drop-shadow-lg" />
            <div>
              <span className="text-lg font-semibold tracking-tight">shebok.ai</span>
            </div>
          </div>
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-sm font-medium text-emerald-400">{doctor.name} ({doctor.specialty})</span>
            </div>
            <button onClick={handleSignout} className="text-sm text-zinc-400 hover:text-white transition-colors">
              Sign Out
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1400px] px-6 py-6">
        {/* Top Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {[
            { label: "My Appointments", value: appointments.length, color: "text-blue-400" },
            { label: "Pending in " + doctor.specialty, value: triageRecords.length, color: "text-amber-400" },
            { label: "Critical Emergencies", value: triageRecords.filter(r => r.is_emergency).length, color: "text-red-400" },
            { label: "Resolved Today", value: "0", color: "text-emerald-400" },
          ].map((s, i) => (
            <div key={i} className="rounded-2xl border border-white/5 bg-white/[0.02] p-5 backdrop-blur">
              <p className="text-xs font-medium text-zinc-500 uppercase tracking-wider">{s.label}</p>
              <p className={`text-3xl font-bold ${s.color} mt-2`}>{s.value}</p>
            </div>
          ))}
        </div>

        {/* Division Layout: Appointments on left, Triage/Queue on Right */}
        <div className="grid lg:grid-cols-[1fr_1fr] gap-6">
          
          {/* Left Column: Appointments */}
          <div className="flex flex-col gap-6">
            <h2 className="text-xl font-bold border-b border-white/10 pb-2">Upcoming Appointments</h2>
            <div className="space-y-3">
              {appointments.length === 0 ? (
                <div className="rounded-xl border border-dashed border-white/10 p-12 text-center text-zinc-500">
                  No upcoming appointments.
                </div>
              ) : (
                appointments.map((appt) => (
                  <Card key={appt.id} className="border-white/5 bg-white/[0.02] hover:bg-white/[0.04] transition-colors cursor-pointer">
                    <CardContent className="p-5">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/20 border border-blue-500/20 text-blue-400">
                            📅
                          </div>
                          <div>
                            <p className="font-semibold text-white">{appt.patients?.name || "Patient"}</p>
                            <p className="text-xs text-zinc-400">
                              {new Date(appt.slot_time).toLocaleDateString()} at {new Date(appt.slot_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </p>
                          </div>
                        </div>
                        <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20">{appt.status}</Badge>
                      </div>
                      {appt.triage_records?.chief_complaint && (
                        <div className="p-3 bg-black/20 rounded-lg text-sm text-zinc-300 border border-white/5">
                          <span className="text-zinc-500 text-xs uppercase mr-2">Complaint:</span>
                          {appt.triage_records.chief_complaint}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          </div>

          {/* Right Column: Triage Queue & Details */}
          <div className="flex flex-col gap-6">
            <h2 className="text-xl font-bold border-b border-white/10 pb-2">Pending Triage Queue ({doctor.specialty})</h2>
            
            <div className="grid gap-4 xl:grid-cols-[1fr_1fr] h-full">
              {/* Queue List */}
              <div className="space-y-3 overflow-y-auto max-h-[600px] pr-2 scrollbar-thin">
                {triageRecords.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-white/10 p-12 text-center text-zinc-500">
                    Queue is empty.
                  </div>
                ) : (
                  triageRecords.map((record) => (
                    <div
                      key={record.id}
                      onClick={() => setSelectedRecord(record)}
                      className={`rounded-xl border p-4 cursor-pointer transition-all ${
                        selectedRecord?.id === record.id
                          ? "border-emerald-500/50 bg-emerald-500/10"
                          : "border-white/5 bg-white/[0.02] hover:bg-white/[0.05]"
                      } ${record.is_emergency ? "border-red-500/50 bg-red-500/10" : ""}`}
                    >
                      <div className="flex justify-between items-start mb-2">
                        <span className="font-semibold text-white">{record.patients?.name || `Patient`}</span>
                        <span className="text-xs text-zinc-500">{new Date(record.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                      </div>
                      <p className="text-xs text-zinc-400 line-clamp-2 mb-2">{record.chief_complaint}</p>
                      <div className="flex gap-2">
                        {record.urgency_score && (
                          <Badge style={{ backgroundColor: `${URGENCY_COLORS[record.urgency_score]}20`, color: URGENCY_COLORS[record.urgency_score] }} className="text-[10px] border-none">
                            Urgency {record.urgency_score}/5
                          </Badge>
                        )}
                        {record.is_emergency && <Badge className="bg-red-500/20 text-red-400 text-[10px] border-none">EMERGENCY</Badge>}
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Selected Detail Panel */}
              <div className="h-full">
                {selectedRecord ? (
                  <div className="rounded-xl border border-white/10 bg-white/[0.02] overflow-hidden sticky top-24">
                    <div className="bg-gradient-to-r from-emerald-500/10 to-cyan-500/10 p-4 border-b border-white/10">
                      <h3 className="font-bold text-white mb-1">Patient Details</h3>
                      <p className="text-xs text-zinc-400">{selectedRecord.patients?.name}</p>
                    </div>
                    
                    <div className="p-4 space-y-4">
                      <div>
                        <p className="text-[10px] uppercase tracking-wider text-emerald-400 mb-1">AI Summary</p>
                        <p className="text-sm text-zinc-300 leading-relaxed bg-black/20 p-3 rounded-lg border border-white/5">
                          {selectedRecord.deepseek_summary || "No summary available"}
                        </p>
                      </div>

                      <div className="pt-2 border-t border-white/5">
                        <p className="text-[10px] uppercase tracking-wider text-cyan-400 mb-2">Extracted Entities</p>
                        {selectedRecord.symptoms?.length > 0 && (
                          <div className="flex flex-wrap gap-1 mb-2">
                            {(Array.isArray(selectedRecord.symptoms) ? selectedRecord.symptoms : []).map((s: string, i: number) => (
                              <span key={i} className="text-[10px] px-2 py-1 rounded bg-violet-500/20 text-violet-300">{s}</span>
                            ))}
                          </div>
                        )}
                        {selectedRecord.icd10_code && (
                          <div className="text-xs">
                            <span className="text-zinc-500">ICD-10: </span><span className="text-amber-400 font-mono">{selectedRecord.icd10_code}</span>
                          </div>
                        )}
                      </div>

                      <div className="pt-4 border-t border-white/5">
                        <p className="text-[10px] uppercase tracking-wider text-zinc-500 mb-2">Rate AI Triage Accuracy</p>
                        <div className="flex gap-2">
                          {(["correct", "wrong", "partial"] as const).map((fb) => (
                            <Button
                              key={fb}
                              size="sm"
                              variant={selectedRecord.doctor_feedback === fb ? "default" : "outline"}
                              onClick={() => handleFeedback(selectedRecord.id, fb)}
                              className={`text-xs flex-1 ${
                                selectedRecord.doctor_feedback === fb
                                  ? fb === "correct" ? "bg-emerald-600" : fb === "wrong" ? "bg-red-600" : "bg-amber-600"
                                  : "border-white/10 text-zinc-400"
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
                  <div className="rounded-xl border border-dashed border-white/10 h-64 flex items-center justify-center text-zinc-500 text-sm">
                    Select a patient to view details
                  </div>
                )}
              </div>
            </div>
          </div>

        </div>
      </main>
    </div>
  );
}
