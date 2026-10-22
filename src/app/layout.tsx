import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MONO // Local LLM Multimodal & Agentic Dashboard",
  description:
    "Local LLM Multimodal & Agentic Dashboard with LM Studio, Ollama, Hermes Agent & Supabase",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
