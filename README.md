MCP Weather (Vercel)

これは、ChatGPTのDeveloper modeから接続できるMCPサーバーです。
Vercelにデプロイすると、HTTPSで /api/mcp が使えるようになります。

できること
- geocode_place: 地名を入れると候補地（緯度経度）が複数出ます
- get_forecast: 候補地を選ぶと予報が出ます
- ChatGPT内に小さなUI（候補ボタン、予報一覧、更新ボタン）が表示されます

ローカルで動かす
1) Node.js を入れる
2) このフォルダで以下を実行
   npm install
   npm run dev
3) ブラウザで http://localhost:3000 を開く
   MCPエンドポイントは http://localhost:3000/api/mcp

Vercelにデプロイする
- GitHubにこのフォルダをアップロード
- Vercelで New Project → GitHubのリポジトリを選ぶ → Deploy
- デプロイ後のURLが https://xxxxx.vercel.app なら、
  MCP URLは https://xxxxx.vercel.app/api/mcp

ChatGPTに接続する
- ChatGPTでDeveloper modeを有効にする
- Settings → Apps または Settings → Connectors の中にある Create を押す
- MCP Server URL に上の https://xxxxx.vercel.app/api/mcp を入れる
