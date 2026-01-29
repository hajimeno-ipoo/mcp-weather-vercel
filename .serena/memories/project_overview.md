# mcp-weather-vercel 概要

## 目的
- Vercel 上で動作する MCP（Model Context Protocol）サーバーを提供する。
- Open-Meteo の無料 API を使い、地名→座標（ジオコーディング）と天気予報を返す。

## 技術スタック
- Next.js（App Router）/ Node.js（Vercel Serverless）
- TypeScript（ESM）
- MCP: `mcp-handler`, `@modelcontextprotocol/sdk`
- 入力検証: Zod

## ざっくり構成
- `app/api/mcp/route.ts`: MCP の HTTP エンドポイント（`POST /api/mcp`）
- `app/api/mcp/cache.ts`: キャッシュ関連（未確認: 詳細ロジックは未読）
- `app/api/mcp/types.ts`: 型定義
- `scripts/`: 検証/テスト用のスクリプト類

## 主な機能（READMEより）
- `geocode_place`: 地名から候補地（緯度経度）を返す
- `get_forecast`: 緯度経度から天気予報を返す
