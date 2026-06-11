"use client";

import { useState } from "react";
import { VoiceInput } from "./VoiceInput";
import { Button } from "./ui/button";
import { X, Save, FileDown, Loader2 } from "lucide-react";
import type { TriageRecord, Patient, Doctor } from "@/lib/types";
import { createClient } from "@/lib/supabase/client";
import { PDFDownloadLink } from "@react-pdf/renderer";
import { PrescriptionPDF } from "./PrescriptionPDF";

interface VoicePrescriptionModalProps {
  isOpen: boolean;
  onClose: () => void;
  record: TriageRecord & { patients: Patient | null };
  doctor: Doctor;
  onSaved?: () => void;
}

export function VoicePrescriptionModal({ isOpen, onClose, record, doctor, onSaved }: VoicePrescriptionModalProps) {
  const [pastIllness, setPastIllness] = useState("");
  const [disease, setDisease] = useState("");
  const [investigation, setInvestigation] = useState("");
  const [referredOpd, setReferredOpd] = useState("");
  const [medicines, setMedicines] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const supabase = createClient();

  if (!isOpen) return null;

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const { error } = await supabase.from("prescriptions").insert({
        patient_id: record.patient_id,
        doctor_id: doctor.id,
        triage_record_id: record.id || null,
        past_illness: pastIllness,
        disease: disease,
        investigation: investigation,
        referred_opd: referredOpd,
        medicines: medicines,
      });

      if (error) throw error;
      alert("Prescription saved successfully!");
      if (onSaved) onSaved();
    } catch (err: any) {
      console.error(err);
      alert("Failed to save prescription: " + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const currentData = {
    pastIllness,
    disease,
    investigation,
    referredOpd,
    medicines,
    patient: record.patients,
    doctor,
    date: new Date().toLocaleDateString(),
    time: new Date().toLocaleTimeString(),
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-[#0a0a0f] border border-white/10 rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/5 bg-white/[0.02]">
          <div>
            <h2 className="text-xl font-bold text-white">Digital Prescription</h2>
            <p className="text-sm text-zinc-400">Patient: {record.patients?.name || "Unknown"} | Triage ID: {record.id ? record.id.slice(0, 8) : "N/A"}</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors text-zinc-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-6">
              <VoiceInput
                label="Past Illness"
                placeholder="e.g. HTN, Hypothyroidism"
                value={pastIllness}
                onChange={setPastIllness}
                rows={3}
                field="past_illness"
              />
              <VoiceInput
                label="Disease / Diagnosis"
                placeholder="e.g. Painful knee (Rt)"
                value={disease}
                onChange={setDisease}
                rows={3}
                field="disease"
              />
              <VoiceInput
                label="Investigation"
                placeholder="e.g. x-ray Rt Knee B/V, X-RAY L/S Spine B/V"
                value={investigation}
                onChange={setInvestigation}
                rows={4}
                field="investigation"
              />
              <VoiceInput
                label="Referred OPD"
                placeholder="e.g. Orthopedic"
                value={referredOpd}
                onChange={setReferredOpd}
                rows={2}
                field="referred_opd"
              />
            </div>
            <div>
              <VoiceInput
                label="Medicines (Rx)"
                placeholder="e.g. 1. Naproxen 500 mg Tab 1+0+1 [5 Day(s)] After Meal..."
                value={medicines}
                onChange={setMedicines}
                rows={16}
                field="medicines"
              />
            </div>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-white/5 bg-white/[0.02] flex items-center justify-end gap-4">
          <Button variant="outline" onClick={onClose} className="border-white/10 text-zinc-300 hover:bg-white/5">
            Cancel
          </Button>

          <Button
            onClick={handleSave}
            disabled={isSaving}
            className="bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20 border border-emerald-500/20"
          >
            {isSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
            Save to Records
          </Button>

          <PDFDownloadLink
            document={<PrescriptionPDF data={currentData} />}
            fileName={`Prescription_${record.patients?.name || "Patient"}_${new Date().toISOString().slice(0, 10)}.pdf`}
          >
            {({ loading }) => (
              <Button
                disabled={loading}
                className="bg-gradient-to-r from-emerald-500 to-cyan-500 text-white hover:opacity-90 shadow-lg"
              >
                {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <FileDown className="w-4 h-4 mr-2" />}
                {loading ? "Generating PDF..." : "Download PDF"}
              </Button>
            )}
          </PDFDownloadLink>
        </div>
      </div>
    </div>
  );
}
