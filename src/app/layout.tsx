import type { Metadata } from "next";
import "@fontsource/geist/400.css";
import "@fontsource/geist/500.css";
import "@fontsource/geist/600.css";
import "./globals.css";
export const metadata: Metadata = { title: "AudioText — Words from your audio", description: "A quiet workspace for turning recordings into editable transcripts with your own Gemini API key." };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
