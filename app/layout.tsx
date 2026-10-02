import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Tally — Your weekly weight & calorie journal",
  description: "A clear weekly journal for daily weight, calories, and a more personal calorie target.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
