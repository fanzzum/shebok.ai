import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function Home() {
  return (
    <div className="min-h-screen bg-zinc-50">
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <span className="text-xl font-semibold tracking-tight">shebok.ai</span>
            <Badge variant="secondary">Doctor Portal</Badge>
          </div>
          <Button variant="outline" disabled>
            Sign in (Phase 4)
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-12">
        <div className="mb-10 space-y-3">
          <h1 className="text-3xl font-semibold tracking-tight text-zinc-900">
            Bangladesh-first AI healthcare navigator
          </h1>
          <p className="max-w-2xl text-lg text-zinc-600">
            Patients triage via WhatsApp in Bangla. Doctors see structured
            summaries, ICD-10 codes, and booked appointments — before the
            patient walks in.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">WhatsApp Triage</CardTitle>
              <CardDescription>Voice + text · Bangla / English</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-zinc-600">
                Dual-LLM pipeline: Meditron emergency gate → DeepSeek triage →
                BioBERT ICD-10 extraction.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Live Queue</CardTitle>
              <CardDescription>Supabase Realtime CDC</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-zinc-600">
                New triage records and appointments appear instantly — no page
                refresh.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Conversational Booking</CardTitle>
              <CardDescription>Same WhatsApp thread</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-zinc-600">
                Patients pick a doctor and slot by replying naturally — no app
                download required.
              </p>
            </CardContent>
          </Card>
        </div>

        <p className="mt-10 text-sm text-zinc-500">
          Phase 1 foundation complete. Portal features ship in Phase 4.
        </p>
      </main>
    </div>
  );
}
