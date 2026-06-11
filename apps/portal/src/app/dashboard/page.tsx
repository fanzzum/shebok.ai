"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import type { TriageRecord, Appointment, Patient, Doctor, Prescription } from "@/lib/types";
import { URGENCY_LABELS, URGENCY_COLORS, DEPARTMENT_COLORS } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { VoicePrescriptionModal } from "@/components/VoicePrescriptionModal";

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
  const [isPrescriptionModalOpen, setIsPrescriptionModalOpen] = useState(false);
  const [historicalPrescriptions, setHistoricalPrescriptions] = useState<Prescription[]>([]);

  // Slots & BMDC State
  const [slots, setSlots] = useState<{ time: string; location: string }[]>([]);
  const [newTime, setNewTime] = useState("");
  const [newLocation, setNewLocation] = useState("");
  const [verificationUrl, setVerificationUrl] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [visitingFee, setVisitingFee] = useState<number | "">("");
  const [isEditingFee, setIsEditingFee] = useState(false);

  useEffect(() => {
    if (selectedRecord?.patient_id) {
      supabase.from("prescriptions")
        .select("*, doctor:doctor_registry(*)")
        .eq("patient_id", selectedRecord.patient_id)
        .order("created_at", { ascending: false })
        .then(({ data }) => setHistoricalPrescriptions(data || []));
    } else {
      setHistoricalPrescriptions([]);
    }
  }, [selectedRecord?.patient_id, supabase]);

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
    setVisitingFee(doctorProfile.visiting_fee || 1000);

    let loadedSlots = doctorProfile.available_slots || [];
    if (typeof loadedSlots === "string") {
      try { loadedSlots = JSON.parse(loadedSlots); } catch (e) { loadedSlots = []; }
    }
    if (loadedSlots.length > 0 && typeof loadedSlots[0] === "string") {
      loadedSlots = loadedSlots.map((s: string) => ({ time: s, location: "General Hospital" }));
    }
    setSlots(loadedSlots);

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

  const saveSlots = async (newSlots: any[]) => {
    if (!doctor) return;
    const { error } = await supabase
      .from("doctor_registry")
      .update({ available_slots: newSlots })
      .eq("id", doctor.id);
      
    if (!error) {
      setSlots(newSlots);
    } else {
      alert("Failed to save slots");
    }
  };

  const saveFee = async () => {
    if (!doctor || visitingFee === "") return;
    const { error } = await supabase
      .from("doctor_registry")
      .update({ visiting_fee: Number(visitingFee) })
      .eq("id", doctor.id);
      
    if (!error) {
      // @ts-ignore
      setDoctor({ ...doctor, visiting_fee: Number(visitingFee) });
      setIsEditingFee(false);
    } else {
      alert("Failed to save visiting fee");
    }
  };

  const addSlot = () => {
    if (!newTime || !newLocation) return;
    const updated = [...slots, { time: newTime, location: newLocation }];
    setNewTime("");
    setNewLocation("");
    saveSlots(updated);
  };

  const removeSlot = (idx: number) => {
    const updated = slots.filter((_, i) => i !== idx);
    saveSlots(updated);
  };

  const verifyBmdc = async () => {
    if (!verificationUrl || !doctor) return;
    try {
      setVerifying(true);
      const parsed = new URL(verificationUrl);
      if (!parsed.hostname.endsWith("bmdc.org.bd")) {
        alert("Must be a valid bmdc.org.bd URL.");
        setVerifying(false);
        return;
      }

      setDoctor({ ...doctor, bmdc_verification_status: "PENDING" } as any);

      const res = await fetch("/api/verify-bmdc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: verificationUrl, doctor_id: doctor.id })
      });
      
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      const { data: updatedDoctor } = await supabase
        .from("doctor_registry")
        .select("*")
        .eq("id", doctor.id)
        .single();
        
      setDoctor(updatedDoctor as Doctor);
      setVerificationUrl("");
    } catch (e: any) {
      alert("Verification Error: " + e.message);
    } finally {
      setVerifying(false);
    }
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

        {/* Doctor Settings & Verification */}
        <div className="grid lg:grid-cols-[1fr_1fr] gap-6 mb-8">
          
          {/* Availability Card */}
          <Card className="border-white/5 bg-white/[0.02]">
            <CardHeader className="pb-3 border-b border-white/5">
              <CardTitle className="text-lg flex justify-between items-center">
                <span>Availability & Fees</span>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-zinc-400">Visiting Fee:</span>
                  {isEditingFee ? (
                    <div className="flex items-center gap-1">
                      <input 
                        type="number" 
                        value={visitingFee} 
                        onChange={(e) => setVisitingFee(e.target.value ? Number(e.target.value) : "")}
                        className="bg-black/20 border border-white/10 rounded px-2 py-0.5 w-16 text-xs text-emerald-400 focus:outline-none"
                      />
                      <button onClick={saveFee} className="text-emerald-400 hover:text-emerald-300 text-xs px-1">Save</button>
                      <button onClick={() => {
                        // @ts-ignore
                        setVisitingFee(doctor.visiting_fee || 1000);
                        setIsEditingFee(false);
                      }} className="text-zinc-500 hover:text-zinc-400 text-xs px-1">Cancel</button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <Badge className="bg-emerald-500/10 text-emerald-400 border-none">
                        {/* @ts-ignore */}
                        {doctor.visiting_fee || 1000} BDT
                      </Badge>
                      <button onClick={() => setIsEditingFee(true)} className="text-zinc-500 hover:text-white text-xs">Edit</button>
                    </div>
                  )}
                </div>
              </CardTitle>
              <CardDescription className="text-xs text-zinc-400">Manage your chamber times, locations, and fee.</CardDescription>
            </CardHeader>
            <CardContent className="p-4 space-y-4">
              <div className="space-y-2 max-h-40 overflow-y-auto pr-2 scrollbar-thin">
                {slots.map((s, idx) => (
                  <div key={idx} className="flex items-center justify-between p-2 rounded-md bg-black/20 border border-white/5 text-sm">
                    <div>
                      <div className="font-semibold text-emerald-400">{s.time}</div>
                      <div className="text-xs text-zinc-400">{s.location}</div>
                    </div>
                    <button onClick={() => removeSlot(idx)} className="text-red-400 hover:text-red-300 text-xs px-2">Remove</button>
                  </div>
                ))}
                {slots.length === 0 && <p className="text-xs text-zinc-500">No slots configured.</p>}
              </div>

              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-white/5">
                <input 
                  className="bg-black/20 border border-white/10 rounded px-2 py-1 text-sm text-white focus:outline-none focus:border-emerald-500" 
                  placeholder="Time (e.g. Today 4 PM)" 
                  value={newTime} onChange={e => setNewTime(e.target.value)} 
                />
                <input 
                  className="bg-black/20 border border-white/10 rounded px-2 py-1 text-sm text-white focus:outline-none focus:border-emerald-500" 
                  placeholder="Location" 
                  value={newLocation} onChange={e => setNewLocation(e.target.value)} 
                />
              </div>
              <Button onClick={addSlot} disabled={!newTime || !newLocation} variant="outline" size="sm" className="w-full mt-2 border-white/10 text-emerald-400 hover:text-emerald-300">
                + Add Slot
              </Button>
            </CardContent>
          </Card>

          {/* BMDC Verification Card */}
          <Card className="border-white/5 bg-white/[0.02]">
            <CardHeader className="pb-3 border-b border-white/5">
              <CardTitle className="text-lg flex items-center justify-between">
                <span>BMDC Verification</span>
                {/* @ts-ignore */}
                {doctor.bmdc_verification_status === "VALID" ? (
                  <Badge className="bg-emerald-500/20 text-emerald-400 border-none text-[10px]">VERIFIED</Badge>
                // @ts-ignore
                ) : doctor.bmdc_verification_status === "PENDING" ? (
                  <Badge className="bg-yellow-500/20 text-yellow-400 border-none text-[10px]">PENDING</Badge>
                ) : (
                  // @ts-ignore
                  <Badge className="bg-red-500/20 text-red-400 border-none text-[10px]">{doctor.bmdc_verification_status || "UNVERIFIED"}</Badge>
                )}
              </CardTitle>
              <CardDescription className="text-xs text-zinc-400">Verify your BMDC registry via AI compliance node.</CardDescription>
            </CardHeader>
            <CardContent className="p-4 space-y-4">
              {/* @ts-ignore */}
              {doctor.bmdc_verification_status !== "VALID" && (
                <div className="space-y-3">
                  <input 
                    className="w-full bg-black/20 border border-white/10 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500" 
                    placeholder="https://verify.bmdc.org.bd/regdata/..." 
                    value={verificationUrl} onChange={e => setVerificationUrl(e.target.value)} 
                  />
                  <Button onClick={verifyBmdc} disabled={verifying || !verificationUrl} size="sm" className="w-full bg-emerald-600 hover:bg-emerald-500 text-white">
                    {verifying ? "Running Audit..." : "Run AI Compliance Audit"}
                  </Button>
                </div>
              )}
              {/* @ts-ignore */}
              {doctor.bmdc_verification_response && (
                <div className="p-3 bg-black/20 rounded-md border border-white/5 text-xs text-zinc-300 space-y-1">
                  {/* @ts-ignore */}
                  <p><span className="text-zinc-500">Name:</span> {doctor.bmdc_verification_response.extracted_credentials?.doctor_name}</p>
                  {/* @ts-ignore */}
                  <p><span className="text-zinc-500">Reg No:</span> {doctor.bmdc_verification_response.extracted_credentials?.bmdc_registration_number}</p>
                  {/* @ts-ignore */}
                  {doctor.bmdc_verification_response.audit_trail_reasons?.length > 0 && (
                    <div className="mt-2 text-zinc-400">
                      <span className="text-zinc-500">Audit Notes:</span>
                      <ul className="list-disc pl-4 mt-1">
                        {/* @ts-ignore */}
                        {doctor.bmdc_verification_response.audit_trail_reasons.map((r: string, i: number) => <li key={i}>{r}</li>)}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
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
                  <Card key={appt.id} onClick={() => {
                          if (appt.triage_records) {
                            setSelectedRecord({
                              ...appt.triage_records,
                              patients: appt.patients
                            });
                          }
                        }} className="border-white/5 bg-white/[0.02] hover:bg-white/[0.04] transition-colors cursor-pointer relative group">
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
                      
                      <div className="flex justify-end mt-3">
                        <Button size="sm" onClick={(e) => {
                          e.stopPropagation();
                          const recordToUse = appt.triage_records || {
                            id: "",
                            patient_id: appt.patient_id,
                            created_at: new Date().toISOString(),
                            chief_complaint: "",
                            symptoms: [],
                            body_locations: [],
                            severity_markers: [],
                            icd10_code: null,
                            deepseek_summary: "No triage summary available (direct appointment)",
                            urgency_score: null,
                            department: null,
                            clinical_observation: null,
                            doctor_feedback: null,
                            status: "booked",
                            is_emergency: false,
                          };
                          setSelectedRecord({
                            ...recordToUse,
                            patients: appt.patients
                          } as TriageWithPatient);
                          setIsPrescriptionModalOpen(true);
                        }} className="bg-emerald-500/20 hover:bg-emerald-500 text-emerald-400 hover:text-white border border-emerald-500/20 transition-all">
                          🎤 Write Prescription
                        </Button>
                      </div>
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
                    <div className="bg-gradient-to-r from-emerald-500/10 to-cyan-500/10 p-4 border-b border-white/10 flex justify-between items-center">
                      <div>
                        <h3 className="font-bold text-white mb-1">Patient Details</h3>
                        <p className="text-xs text-zinc-400">{selectedRecord.patients?.name}</p>
                      </div>
                      <Button size="sm" onClick={() => setIsPrescriptionModalOpen(true)} className="bg-emerald-500 hover:bg-emerald-600 text-white shadow-lg">
                        🎤 Write Prescription
                      </Button>
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
                      <div className="pt-4 border-t border-white/5">
                        <p className="text-[10px] uppercase tracking-wider text-zinc-500 mb-2">Historical Prescriptions & Investigations</p>
                        {historicalPrescriptions.length === 0 ? (
                          <p className="text-xs text-zinc-500">No past records found for this patient.</p>
                        ) : (
                          <div className="space-y-3 max-h-48 overflow-y-auto pr-2 scrollbar-thin">
                            {historicalPrescriptions.map((rx) => (
                              <div key={rx.id} className="p-3 bg-black/20 rounded-lg border border-white/5 space-y-2">
                                <div className="flex justify-between items-start">
                                  <p className="text-xs font-semibold text-emerald-400">Dr. {rx.doctor?.name} ({rx.doctor?.specialty})</p>
                                  <p className="text-[10px] text-zinc-500">{new Date(rx.created_at).toLocaleDateString()}</p>
                                </div>
                                {rx.disease && <p className="text-xs text-zinc-300"><span className="text-zinc-500">Diagnosis:</span> {rx.disease}</p>}
                                {rx.investigation && <p className="text-xs text-zinc-300"><span className="text-zinc-500">Inv:</span> {rx.investigation}</p>}
                                {rx.medicines && <p className="text-xs text-zinc-300"><span className="text-zinc-500">Rx:</span> {rx.medicines}</p>}
                              </div>
                            ))}
                          </div>
                        )}
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

      {selectedRecord && doctor && (
        <VoicePrescriptionModal
          isOpen={isPrescriptionModalOpen}
          onClose={() => setIsPrescriptionModalOpen(false)}
          record={selectedRecord}
          doctor={doctor}
          onSaved={() => {
            // Re-fetch historical records
            supabase.from("prescriptions")
              .select("*, doctor:doctor_registry(*)")
              .eq("patient_id", selectedRecord.patient_id)
              .order("created_at", { ascending: false })
              .then(({ data }) => setHistoricalPrescriptions(data || []));
            setIsPrescriptionModalOpen(false);
          }}
        />
      )}
    </div>
  );
}
