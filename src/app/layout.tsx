import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "OpsMind AI",
  description: "Enterprise operations intelligence",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className}>
        <script
          dangerouslySetInnerHTML={{
            __html:
              'try{var p=JSON.parse(localStorage.getItem("opsmind.preferences")||"{}");var r=document.documentElement;' +
              'r.dataset.accent=p.accent||"indigo";r.dataset.density=p.density||"comfortable";r.dataset.motion=p.motion||"full";}catch(e){}',
          }}
        />
        {children}
      </body>
    </html>
  );
}
