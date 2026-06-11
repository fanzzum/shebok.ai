import { NextResponse } from "next/server";

const promptMap: Record<string, string> = {
  past_illness: `You are a professional medical scribe.
Your task is to take the transcribed audio text of a doctor and convert it into a clean, concise, list of past illnesses, chronic conditions, or surgeries (e.g., "Hypertension, Diabetes Mellitus, Asthma").
Do not add any conversational remarks, introductions, explanations, or assumptions. Output ONLY the clean medical terms separated by commas. If the text indicates none or nothing found, output "None".
Transcribed Doctor Dictation:`,

  disease: `You are a professional medical scribe.
Your task is to take the transcribed audio text of a doctor describing their clinical diagnosis or disease of the patient, and convert it into a standard medical diagnosis (e.g., "Acute Pharyngitis" or "Osteoarthritis of Right Knee").
Do not add any conversational remarks, introductions, explanations, or assumptions. Output ONLY the clean structured diagnosis.
Transcribed Doctor Dictation:`,

  investigation: `You are a professional medical scribe.
Your task is to take the transcribed audio text of a doctor ordering diagnostic investigations or lab tests, and convert it into a clean, comma-separated list of medical tests (e.g., "CBC, Serum Creatinine, Fasting Blood Sugar, X-Ray Chest P/A View").
Do not add any conversational remarks, introductions, explanations, or assumptions. Output ONLY the clean list of investigations.
Transcribed Doctor Dictation:`,

  referred_opd: `You are a professional medical scribe.
Your task is to take the transcribed audio text of a doctor recommending a department referral or outpatient department (OPD), and convert it into a standard hospital department name (e.g., "Orthopedics" or "Cardiology" or "Neurology").
Do not add any conversational remarks, introductions, explanations, or assumptions. Output ONLY the department name.
Transcribed Doctor Dictation:`,

  medicines: `You are a professional medical scribe.
Your task is to take the transcribed audio text of a doctor prescribing medications and convert it into a structured medical prescription list.
Format each medicine strictly on a new line using this template:
"<Type>. <Medicine Name> <Strength> (<Dosage/Timing>) - <Duration> (<Instructions>)"
Examples of desired formatting:
- Tab. Naproxen 500 mg (1+0+1) - 5 Days (After Meal)
- Cap. Amoxicillin 500 mg (1+1+1) - 7 Days (After Meal)
- Tab. Paracetamol 500 mg (1+1+1) - 3 Days (SOS / For Fever)
- Syp. Antacid (2 tsp 1+1+1) - 14 Days (After Meal)

Do not add any conversational remarks, introductions, explanations, or assumptions. Output ONLY the structured prescription list.
Transcribed Doctor Dictation:`
};

function cleanLLMResponse(text: string): string {
  // Remove deepseek reasoning tags if present
  let clean = text.replace(/<think>[\s\S]*?<\/think>/gi, "");
  // Remove markdown code block fences if the LLM wrapped it in ```
  clean = clean.replace(/```[a-z]*\n([\s\S]*?)\n```/gi, "$1");
  // Trim spaces
  return clean.trim();
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as Blob | null;
    const field = formData.get("field") as string | null;

    if (!file) {
      return NextResponse.json({ error: "No audio file provided" }, { status: 400 });
    }

    const groqApiKey = process.env.GROQ_API_KEY;
    if (!groqApiKey) {
      return NextResponse.json({ error: "GROQ_API_KEY is missing" }, { status: 500 });
    }

    // 1. Get raw transcript from Whisper
    const groqFormData = new FormData();
    groqFormData.append("file", file, "audio.webm");
    groqFormData.append("model", "whisper-large-v3-turbo");
    groqFormData.append("response_format", "json");

    const whisperResponse = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${groqApiKey}`,
      },
      body: groqFormData,
    });

    if (!whisperResponse.ok) {
      const errorData = await whisperResponse.json().catch(() => ({}));
      console.error("Groq Whisper error:", whisperResponse.status, errorData);
      return NextResponse.json({ error: "Transcription failed" }, { status: whisperResponse.status });
    }

    const whisperData = await whisperResponse.json();
    const rawText = whisperData.text || "";
    let finalOutput = rawText;

    // 2. Structuring with LLM if field is specified and we have a prompt mapped
    if (rawText && field && promptMap[field]) {
      const llmModel = process.env.GROQ_LLM_MODEL || "llama-3.3-70b-versatile";
      const prompt = `${promptMap[field]}\n"${rawText}"`;

      const llmResponse = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${groqApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: llmModel,
          messages: [
            { role: "system", content: "You are a professional clinical assistant. Follow instructions precisely. Do not include chat preamble or explanations." },
            { role: "user", content: prompt }
          ],
          temperature: 0.1,
        }),
      });

      if (llmResponse.ok) {
        const chatData = await llmResponse.json();
        const rawContent = chatData.choices?.[0]?.message?.content || "";
        finalOutput = cleanLLMResponse(rawContent);
      } else {
        console.error("LLM structuring failed, falling back to raw transcription");
      }
    }

    return NextResponse.json({ text: finalOutput });
  } catch (err: any) {
    console.error("Transcribe API Error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
