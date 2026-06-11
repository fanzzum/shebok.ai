import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const { userId, email, name, specialty, bmdc_reg } = await request.json();

    if (!userId || !email || !name || !bmdc_reg) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // Initialize Supabase client with Service Role Key to bypass RLS
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // 1. Try to find a dummy doctor with matching name to link to
    const { data: existingDoctor, error: findError } = await supabaseAdmin
      .from("doctor_registry")
      .select("id")
      .eq("name", name)
      .limit(1)
      .single();

    if (existingDoctor) {
      // 2. Link existing dummy doctor
      const { error: updateError } = await supabaseAdmin
        .from("doctor_registry")
        .update({ auth_id: userId, email, bmdc_reg })
        .eq("id", existingDoctor.id);

      if (updateError) throw updateError;
      return NextResponse.json({ success: true, linked: true });
    } else {
      // 3. Create a new doctor record if no dummy matched
      // Note: we set a fake embedding here just so the vector queries don't break
      const { error: insertError } = await supabaseAdmin
        .from("doctor_registry")
        .insert({
          name,
          specialty: specialty || "Medicine",
          email,
          auth_id: userId,
          bmdc_reg,
          clinic_lat: 23.75, // default Dhaka
          clinic_lng: 90.39,
        });

      if (insertError) throw insertError;
      return NextResponse.json({ success: true, linked: false });
    }
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
