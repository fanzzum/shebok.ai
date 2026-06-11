"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import Image from "next/image";

const GENERAL_SUBJECTS = [
  "Medicine", "Surgery", "Ophthalmology", "Obstetrics & Gynaecology", "Paediatrics",
  "Otolaryngology - Head & Neck Surgery", "Psychiatry", "Anaesthesiology",
  "Radiology & Imaging", "Radiotherapy", "Dermatology & Venereology",
  "Physical Medicine & Rehabilitation", "Haematology", "Biochemistry",
  "Pathology", "Microbiology", "Conservative Dentistry & Endodontics",
  "Oral and Maxillofacial Surgery", "Prosthodontics", "Orthodontics & Dentofacial Orthopaedics",
  "Transfusion Medicine", "Family Medicine", "Anatomy", "Physiology", "Pharmacology",
  "Forensic Medicine", "Community Medicine"
];

const SPECIALIZED_SUBJECTS = [
  "Gastroenterology", "Neurology", "Nephrology", "Endocrinology & Metabolism",
  "Cardiology", "Pulmonology", "Hepatology", "Rheumatology",
  "Infectious Disease & Tropical Medicine", "Urology", "Neuro-surgery",
  "Cardiovascular Surgery", "Thoracic Surgery", "Plastic and Reconstructive Surgery",
  "Orthopaedic Surgery", "Paediatric Surgery", "Neonatology",
  "Paediatric Haematology & Oncology", "Paediatric Nephrology",
  "Paediatric Gastroenterology & Nutrition", "Paediatric Pulmonology",
  "Paediatric Neurology & Development", "Paediatric Cardiology", "Feto-Maternal Medicine",
  "Gynaecological Oncology", "Reproductive Endocrinology & Infertility",
  "Hepatobiliary Surgery", "Colorectal Surgery", "Surgical Oncology", "Vitreo Retina",
  "Paediatric Ophthalmology", "Casualty and Emergency Surgery", "Medical Oncology",
  "Palliative Medicine", "Paediatric Endocrinology and Metabolism",
  "Paediatric Critical Care Medicine", "Child and Adolescent Psychiatry",
  "Female Pelvic Medicine and Reconstructive Surgery"
];

const SPECIALTIES = [...GENERAL_SUBJECTS, ...SPECIALIZED_SUBJECTS];

export default function SignupPage() {
  const router = useRouter();
  const supabase = createClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [selectedSpecialties, setSelectedSpecialties] = useState<string[]>([]);
  const [bmdcReg, setBmdcReg] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);

  const toggleSpecialty = (sp: string) => {
    setSelectedSpecialties(prev => {
      if (prev.includes(sp)) return prev.filter(s => s !== sp);
      if (prev.length >= 2) return prev; // max 2
      return [...prev, sp];
    });
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedSpecialties.length === 0) {
      setError("Please select at least one specialty.");
      return;
    }
    
    setLoading(true);
    setError(null);
    
    try {
      // 1. Sign up the user in Supabase Auth
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email,
        password,
      });

      if (authError) throw authError;

      // 2. Call our API route to bypass RLS and link/create the doctor_registry row
      const res = await fetch("/api/auth/register-doctor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: authData.user?.id,
          email: authData.user?.email,
          name,
          specialty: selectedSpecialties[0], // primary specialty
          bmdc_reg: bmdcReg,
        }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || "Failed to register doctor profile");
      }

      // Success!
      setShowSuccess(true);
    } catch (err: any) {
      setError(err.message || "Something went wrong.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center p-6 text-white selection:bg-emerald-500/30">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative w-full max-w-md bg-white/[0.02] border border-white/5 p-8 rounded-3xl backdrop-blur-xl shadow-2xl"
      >
        {showSuccess && (
          <div className="absolute inset-0 z-50 flex items-center justify-center p-6 bg-[#0a0a0f]/90 backdrop-blur-md rounded-3xl">
            <div className="bg-[#0a0a0f] border border-emerald-500/30 p-8 rounded-2xl shadow-2xl text-center w-full">
              <div className="w-16 h-16 bg-emerald-500/20 text-emerald-400 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h3 className="text-xl font-bold mb-2">Check your email</h3>
              <p className="text-sm text-zinc-400 mb-6">A confirmation mail has been sent to {email}. Please verify your account to continue.</p>
              <Link href="/login" className="block w-full bg-emerald-500 text-white rounded-xl py-3 font-semibold hover:bg-emerald-600 transition-colors">
                Go to Login
              </Link>
            </div>
          </div>
        )}
        <div className="flex justify-center mb-6">
          <Image src="/logo-transparent.png" alt="Shebok AI" width={72} height={72} className="drop-shadow-lg" />
        </div>
        
        <h2 className="text-2xl font-bold text-center mb-2">Partner with Shebok</h2>
        <p className="text-zinc-400 text-center mb-8 text-sm">Join the AI-powered healthcare network</p>

        {error && (
          <div className="mb-6 p-3 bg-red-500/10 border border-red-500/20 text-red-400 text-sm rounded-lg text-center">
            {error}
          </div>
        )}

        <form onSubmit={handleSignup} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-zinc-400 uppercase tracking-wider mb-1.5">Doctor Name</label>
            <input
              type="text"
              required
              placeholder="e.g. Dr. A. Rahman"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/50 transition-all"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-400 uppercase tracking-wider mb-1.5">Email Address</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/50 transition-all"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-400 uppercase tracking-wider mb-1.5">BMDC Registration No.</label>
            <input
              type="text"
              required
              placeholder="e.g. A-12345"
              value={bmdcReg}
              onChange={(e) => setBmdcReg(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/50 transition-all"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-400 uppercase tracking-wider mb-1.5">Password</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/50 transition-all"
            />
          </div>

          <div className="pt-2">
            <div className="flex items-center justify-between mb-2">
              <label className="block text-xs font-medium text-zinc-400 uppercase tracking-wider">Specialties</label>
              <span className="text-xs text-zinc-500">{selectedSpecialties.length}/2 max</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {SPECIALTIES.map(sp => (
                <button
                  key={sp}
                  type="button"
                  onClick={() => toggleSpecialty(sp)}
                  className={`text-[11px] px-3 py-1.5 rounded-full border transition-all ${
                    selectedSpecialties.includes(sp) 
                      ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-400' 
                      : 'bg-white/5 border-white/10 text-zinc-400 hover:bg-white/10'
                  }`}
                >
                  {sp}
                </button>
              ))}
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full mt-8 bg-gradient-to-r from-emerald-500 to-cyan-500 text-white rounded-xl px-4 py-3 font-semibold hover:opacity-90 transition-opacity shadow-lg shadow-emerald-500/25 disabled:opacity-50"
          >
            {loading ? "Creating account..." : "Sign Up"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-zinc-500">
          Already have an account?{" "}
          <Link href="/login" className="text-emerald-400 hover:text-emerald-300 font-medium transition-colors">
            Log In
          </Link>
        </p>
      </motion.div>
    </div>
  );
}
