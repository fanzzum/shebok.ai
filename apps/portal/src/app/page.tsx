"use client";

import { motion } from "framer-motion";
import { ArrowRight, Activity, Shield, Clock, Users, Database } from "lucide-react";
import Link from "next/link";
import Image from "next/image";

export default function LandingPage() {
  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { staggerChildren: 0.2 },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.5, ease: "easeOut" },
    },
  };

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white overflow-hidden selection:bg-emerald-500/30">
      {/* Background Gradients */}
      <div className="absolute inset-0 z-0">
        <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-emerald-500/20 rounded-full blur-[120px] mix-blend-screen" />
        <div className="absolute bottom-0 right-1/4 w-[600px] h-[600px] bg-cyan-500/10 rounded-full blur-[150px] mix-blend-screen" />
      </div>

      <div className="relative z-10">
        {/* Navigation */}
        <nav className="flex items-center justify-between px-8 py-6 max-w-7xl mx-auto">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="flex items-center gap-3"
          >
            <Image src="/logo-transparent.png" alt="Shebok AI" width={60} height={60} className="drop-shadow-lg" />
            <span className="text-xl font-bold tracking-tight">shebok.ai</span>
          </motion.div>
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="flex items-center gap-4"
          >
            <Link
              href="/login"
              className="text-sm font-medium text-zinc-400 hover:text-white transition-colors"
            >
              Doctor Login
            </Link>
            <Link
              href="/signup"
              className="px-5 py-2.5 text-sm font-medium bg-white text-black rounded-full hover:bg-zinc-200 transition-colors shadow-lg shadow-white/10"
            >
              Partner with us
            </Link>
          </motion.div>
        </nav>

        {/* Hero Section */}
        <main className="max-w-7xl mx-auto px-8 pt-20 pb-32">
          <motion.div
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            className="text-center max-w-4xl mx-auto"
          >
            <motion.div variants={itemVariants} className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm font-medium mb-8">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              Transforming Bangladesh Healthcare
            </motion.div>
            
            <motion.h1 variants={itemVariants} className="text-5xl md:text-7xl font-bold tracking-tight mb-8 leading-[1.1]">
              Instant Clinical Triage via{" "}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-cyan-400">
                WhatsApp.
              </span>
            </motion.h1>
            
            <motion.p variants={itemVariants} className="text-lg md:text-xl text-zinc-400 mb-12 max-w-2xl mx-auto leading-relaxed">
              Shebok AI eliminates the healthcare bottleneck in Bangladesh by autonomously triaging patients, classifying severity, and booking appointments—all before they step into the hospital.
            </motion.p>
            
            <motion.div variants={itemVariants} className="flex items-center justify-center gap-4">
              <Link
                href="/signup"
                className="group flex items-center gap-2 px-8 py-4 bg-emerald-500 text-white rounded-full font-semibold hover:bg-emerald-600 transition-all shadow-lg shadow-emerald-500/25 hover:shadow-emerald-500/40"
              >
                Join the Doctor Network
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </Link>
              <Link
                href="/login"
                className="px-8 py-4 bg-white/5 border border-white/10 rounded-full font-semibold hover:bg-white/10 transition-all"
              >
                Access Portal
              </Link>
            </motion.div>
          </motion.div>

          {/* Stats Section */}
          <motion.div
            variants={containerVariants}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-100px" }}
            className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-32"
          >
            {[
              { label: "Patients Triaged", value: "50,000+", icon: Users, color: "text-blue-400" },
              { label: "Partner Doctors", value: "2,500+", icon: Activity, color: "text-emerald-400" },
              { label: "Triage Accuracy", value: "94.8%", icon: Shield, color: "text-violet-400" },
              { label: "Time Saved/Patient", value: "45 mins", icon: Clock, color: "text-amber-400" },
            ].map((stat, i) => (
              <motion.div
                key={i}
                variants={itemVariants}
                className="p-6 rounded-2xl bg-white/[0.02] border border-white/5 backdrop-blur-sm hover:bg-white/[0.04] transition-colors"
              >
                <stat.icon className={`w-6 h-6 mb-4 ${stat.color} opacity-80`} />
                <h3 className="text-3xl font-bold mb-1">{stat.value}</h3>
                <p className="text-sm text-zinc-500 font-medium">{stat.label}</p>
              </motion.div>
            ))}
          </motion.div>

          {/* Market Problem Section */}
          <motion.div
            variants={containerVariants}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-100px" }}
            className="mt-32 max-w-4xl mx-auto"
          >
            <motion.h2 variants={itemVariants} className="text-3xl font-bold mb-12 text-center">
              The Healthcare Challenge We Solve
            </motion.h2>
            <div className="grid md:grid-cols-2 gap-8">
              <motion.div variants={itemVariants} className="p-8 rounded-3xl bg-gradient-to-br from-red-500/10 to-transparent border border-red-500/20">
                <div className="w-12 h-12 rounded-full bg-red-500/20 flex items-center justify-center mb-6">
                  <Database className="w-6 h-6 text-red-400" />
                </div>
                <h3 className="text-xl font-bold mb-3">The Overload</h3>
                <p className="text-zinc-400 leading-relaxed">
                  Hospitals in Bangladesh face severe overcrowding. Doctors spend 40% of their time on administrative tasks and preliminary symptom gathering rather than actual treatment.
                </p>
              </motion.div>
              <motion.div variants={itemVariants} className="p-8 rounded-3xl bg-gradient-to-br from-emerald-500/10 to-transparent border border-emerald-500/20">
                <div className="w-12 h-12 rounded-full bg-emerald-500/20 flex items-center justify-center mb-6">
                  <Shield className="w-6 h-6 text-emerald-400" />
                </div>
                <h3 className="text-xl font-bold mb-3">The Shebok Solution</h3>
                <p className="text-zinc-400 leading-relaxed">
                  We deploy LLMs directly on WhatsApp to conduct human-like triage. We extract symptoms, assess severity using ESI protocols, and route to the right specialist instantly.
                </p>
              </motion.div>
            </div>
          </motion.div>
        </main>
      </div>
    </div>
  );
}
