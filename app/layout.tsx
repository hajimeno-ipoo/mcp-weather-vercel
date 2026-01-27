export const metadata = {
  title: "MCP Weather",
  description: "MCP Weather server for ChatGPT (Vercel)",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body style={{ fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif", margin: 0 }}>
        <div style={{ maxWidth: 900, margin: "0 auto", padding: 16 }}>
          {children}
        </div>
      </body>
    </html>
  );
}
