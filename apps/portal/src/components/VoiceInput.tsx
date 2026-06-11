"use client";

import { useState, useRef } from "react";
import { Mic, Square, Loader2 } from "lucide-react";

interface VoiceInputProps {
  label: string;
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  rows?: number;
  field: string;
}

export function VoiceInput({ label, value, onChange, placeholder, rows = 3, field }: VoiceInputProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<BlobPart[]>([]);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        await handleTranscription(audioBlob);
        stream.getTracks().forEach((track) => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (err) {
      console.error("Error accessing microphone:", err);
      alert("Could not access microphone. Please check permissions.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const handleTranscription = async (audioBlob: Blob) => {
    setIsTranscribing(true);
    try {
      const formData = new FormData();
      formData.append("file", audioBlob, "audio.webm");
      formData.append("field", field);

      const response = await fetch("/api/transcribe-voice", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error("Failed to transcribe");
      }

      const data = await response.json();
      if (data.text) {
        onChange(value ? `${value} ${data.text}` : data.text);
      }
    } catch (err) {
      console.error(err);
      alert("Transcription failed. Please try again.");
    } finally {
      setIsTranscribing(false);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-sm font-semibold text-zinc-300">{label}</label>
        {isTranscribing ? (
          <Loader2 className="w-4 h-4 animate-spin text-emerald-500" />
        ) : isRecording ? (
          <button
            type="button"
            onClick={stopRecording}
            className="flex items-center gap-1 text-xs font-medium text-red-500 hover:text-red-400 bg-red-500/10 px-2 py-1 rounded-md transition-colors animate-pulse"
          >
            <Square className="w-3 h-3 fill-current" />
            Stop
          </button>
        ) : (
          <button
            type="button"
            onClick={startRecording}
            className="flex items-center gap-1 text-xs font-medium text-emerald-500 hover:text-emerald-400 bg-emerald-500/10 px-2 py-1 rounded-md transition-colors"
          >
            <Mic className="w-3 h-3" />
            Dictate
          </button>
        )}
      </div>
      <textarea
        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/50 transition-all text-white disabled:opacity-50"
        rows={rows}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={isRecording || isTranscribing}
      />
    </div>
  );
}
