/**
 * Database types matching Supabase schema.
 * Manually typed from supabase/migrations/001_initial_schema.sql
 */

export interface Patient {
  id: string;
  whatsapp_hash: string;
  nid_hash: string | null;
  name: string | null;
  dob: string | null;
  created_at: string;
  family_members: unknown[];
  consent_given_at: string | null;
  is_anonymous: boolean;
}

export interface TriageRecord {
  id: string;
  patient_id: string | null;
  created_at: string;
  chief_complaint: string | null;
  symptoms: string[];
  body_locations: string[];
  severity_markers: string[];
  icd10_code: string | null;
  deepseek_summary: string | null;
  urgency_score: number | null;
  department: string | null;
  clinical_observation: string | null;
  doctor_feedback: "correct" | "wrong" | "partial" | null;
  status: "pending" | "booked" | "resolved";
  is_emergency: boolean;
  // Joined
  patient?: Patient;
}

export interface Doctor {
  id: string;
  name: string;
  specialty: string;
  clinic_lat: number | null;
  clinic_lng: number | null;
  daily_capacity: number;
  available_slots: string[];
  bmdc_reg: string | null;
}

export interface Appointment {
  id: string;
  patient_id: string | null;
  doctor_id: string | null;
  triage_record_id: string | null;
  slot_time: string;
  status: "pending" | "confirmed" | "cancelled" | "completed";
  booking_confirmed_at: string | null;
  reminder_sent: boolean;
  created_at: string;
  // Joined
  patient?: Patient;
  doctor?: Doctor;
  triage_record?: TriageRecord;
}

// Dashboard stats
export interface DashboardStats {
  totalTriages: number;
  pendingTriages: number;
  bookedTriages: number;
  resolvedTriages: number;
  totalAppointments: number;
  emergencyCount: number;
  departmentBreakdown: { department: string; count: number }[];
  urgencyBreakdown: { urgency: number; count: number }[];
  accuracyRate: number;
}

// Urgency label mapping
export const URGENCY_LABELS: Record<number, string> = {
  1: "Routine",
  2: "Low",
  3: "Moderate",
  4: "High",
  5: "Critical",
};

export const URGENCY_COLORS: Record<number, string> = {
  1: "#22c55e", // green
  2: "#84cc16", // lime
  3: "#eab308", // yellow
  4: "#f97316", // orange
  5: "#ef4444", // red
};

export const DEPARTMENT_COLORS: Record<string, string> = {
  Cardiology: "#ef4444",
  Neurology: "#8b5cf6",
  Gastroenterology: "#f59e0b",
  Pulmonology: "#06b6d4",
  Medicine: "#3b82f6",
  Orthopedics: "#10b981",
  Dermatology: "#ec4899",
  ENT: "#6366f1",
  Gynecology: "#f43f5e",
  Pediatrics: "#14b8a6",
  Psychiatry: "#a855f7",
  Ophthalmology: "#0ea5e9",
  Urology: "#64748b",
  Emergency: "#dc2626",
};
