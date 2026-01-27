export default function Page() {
  return (
    <main>
      <h1 style={{ fontSize: 24, margin: "16px 0" }}>MCP Weather (Vercel)</h1>
      <p style={{ lineHeight: 1.7 }}>
        これはChatGPTのDeveloper modeから接続するためのMCPサーバーです。
        エンドポイントは <code>/api/mcp</code> です。
      </p>
      <ol style={{ lineHeight: 1.7 }}>
        <li>VercelにデプロイしたURLを用意します。</li>
        <li>ChatGPTの設定でDeveloper modeを有効にします。</li>
        <li>Apps/Connectorsの作成画面で、MCP Server URLに <code>https://あなたのドメイン/api/mcp</code> を入れます。</li>
        <li>会話でツール <code>geocode_place</code> を呼ぶと、候補地選択UIが表示されます。</li>
      </ol>
    </main>
  );
}
