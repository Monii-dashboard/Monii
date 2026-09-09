import type { Metadata } from "next";
import localFont from "next/font/local";
import { GraphqlProvider } from "@/graphql/client/provider";
import "./globals.css";

const geistSans = localFont({
  src: "./fonts/geist-latin.woff2",
  variable: "--font-geist-sans",
  weight: "100 900",
});

const geistMono = localFont({
  src: "./fonts/geist-mono-latin.woff2",
  variable: "--font-geist-mono",
  weight: "100 900",
});

export const metadata: Metadata = {
  title: "Monii — Wealth dashboard",
  description:
    "A current account-level view of wealth across connected institutions.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      data-theme="nebula-bloom"
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-canvas text-content selection:bg-accent selection:text-content-on-accent">
        <GraphqlProvider>{children}</GraphqlProvider>
      </body>
    </html>
  );
}
