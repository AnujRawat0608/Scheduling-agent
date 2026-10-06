import "./globals.css";
import { Providers } from "./providers";
import { Dock } from "./Dock";
import { Analytics } from "@vercel/analytics/next"

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>
          <main className="pb-28">{children}</main>
          <Dock />
        </Providers>
      </body>
    </html>
  );
}