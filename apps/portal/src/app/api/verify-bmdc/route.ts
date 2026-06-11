import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const GROQ_API_KEY = process.env.GROQ_API_KEY!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const VERIFICATION_PROMPT = `You are the Lead Medical Compliance and Anti-Fraud Auditor for shebok.ai. Your sole task is to analyze extracted text profiles from the Bangladesh Medical & Dental Council (BMDC) registry to verify if a registering doctor is completely legitimate or potentially fraudulent.

### CRITICAL VERIFICATION RULES:
1. STATUS CHECK: The "Status" field MUST explicitly read "Valid", "Active", or "Registered". If it says "Suspended", "Cancelled", "Under Review", or is completely missing, flag as INVALID/FRAUD.
2. EXPIRY GATE: Compare the "Valid Up To" or "Expiry Date" against the current operational baseline date: June 2026. If the current date is past the expiration date, flag as EXPIRED (which treats them as temporarily invalid for active practice).
3. REGISTRATION NUMBER PATTERN: Valid BMDC registration numbers typically follow strict formatting rules (e.g., an alphabet prefix like 'A' followed by a series of numerical digits, such as A-12345). Flag any anomalies.
4. DEGREE ALIGNMENT: Ensure the qualifications listed match a recognized medical or dental standard (e.g., MBBS, BDS) aligned with their registration type (Medical vs. Dental).

### EXPECTED OUTPUT FORMAT:
You must respond strictly in valid JSON format. Do not include any conversational filler, markdown formatting outside of the code block, or explanations. The JSON structure must look exactly like this:

{
  "verification_status": "VALID" | "SUSPECTED_FRAUD" | "EXPIRED",
  "confidence_score": 0 to 100,
  "extracted_credentials": {
    "doctor_name": "String or null",
    "bmdc_registration_number": "String or null",
    "registration_type": "Medical" | "Dental" | "Unknown",
    "valid_up_to_date": "YYYY-MM-DD or null"
  },
  "audit_trail_reasons": [
    "List individual point-by-point reasons for the final status verdict."
  ],
  "action_required": "APPROVE" | "BLOCK_AND_FLAG" | "MANUAL_REVIEW_REQUIRED"
}

### INPUT DATA:
`;

export async function POST(req: Request) {
  try {
    const { url, doctor_id } = await req.json();

    if (!url || !doctor_id) {
      return NextResponse.json({ error: "Missing url or doctor_id" }, { status: 400 });
    }

    // Hard Gate: Check Domain
    const parsedUrl = new URL(url);
    if (!parsedUrl.hostname.endsWith("bmdc.org.bd")) {
      return NextResponse.json({ error: "Invalid URL domain. Must be a bmdc.org.bd domain." }, { status: 400 });
    }

    // Update doctor to PENDING
    await supabase.from("doctor_registry").update({
      bmdc_verification_status: "PENDING"
    }).eq("id", doctor_id);

    // Fetch the HTML content
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"
      }
    });

    if (!res.ok) {
      return NextResponse.json({ error: "Failed to fetch from BMDC URL" }, { status: 500 });
    }

    const htmlContent = await res.text();
    
    // Strip simple script and style tags to reduce token size
    let cleanText = htmlContent.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, " ");
    cleanText = cleanText.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, " ");
    // Remove all html tags
    cleanText = cleanText.replace(/<[^>]+>/g, ' ');
    // Remove excessive whitespace
    cleanText = cleanText.replace(/\s\s+/g, ' ');

    // Call Groq LLM
    const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${GROQ_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages: [
          { role: "system", content: VERIFICATION_PROMPT },
          { role: "user", content: `Here is the extracted text from the BMDC page:\n\n${cleanText.substring(0, 15000)}` }
        ],
        temperature: 0,
        response_format: { type: "json_object" }
      })
    });

    if (!groqRes.ok) {
      console.error("Groq Error", await groqRes.text());
      return NextResponse.json({ error: "Failed to run AI compliance check" }, { status: 500 });
    }

    const groqData = await groqRes.json();
    const resultText = groqData.choices[0].message.content;
    
    // Parse JSON
    let auditResult;
    try {
      auditResult = JSON.parse(resultText);
    } catch (err) {
      // Cleanup think tags if present
      const cleaned = resultText.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
      auditResult = JSON.parse(cleaned);
    }

    // Determine final status
    const finalStatus = auditResult.verification_status; // "VALID", "SUSPECTED_FRAUD", "EXPIRED"
    
    // Save to Database
    const { error: dbError } = await supabase.from("doctor_registry").update({
      bmdc_verification_status: finalStatus,
      bmdc_verification_response: auditResult,
      bmdc_reg: auditResult.extracted_credentials?.bmdc_registration_number || null
    }).eq("id", doctor_id);

    if (dbError) {
      console.error("Supabase Error", dbError);
      return NextResponse.json({ error: "Failed to update database" }, { status: 500 });
    }

    return NextResponse.json({ success: true, result: auditResult });
  } catch (error: any) {
    console.error("BMDC Verification Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
