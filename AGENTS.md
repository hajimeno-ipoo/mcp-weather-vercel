# AGENTS.md

このファイルは、本プロジェクト（mcp-weather-vercel）を作業するAIエージェント向けのガイドラインです。
このファイルに記載されたルールと制約を常に遵守してください。

## 1. プロジェクト概要

- **目的**: Vercel 上で動作する MCP (Model Context Protocol) サーバーの実装。
- **機能**: Open-Meteo API を利用した天気予報およびジオコーディング機能の提供。
- **技術スタック**:
  - Runtime: Node.js (Vercel Serverless Functions)
  - Framework: Next.js (App Router)
  - Language: TypeScript
  - MCP Library: `mcp-handler`, `@modelcontextprotocol/sdk`
  - Validation: Zod

## 2. 制約事項 (MCP Apps on Vercel)

Vercel の Serverless 環境で動作するため、以下の制約を厳守すること。

### 2.1. ステートレス性
- サーバーインスタンスはリクエストごとに起動・破棄される可能性がある。
- **メモリ内変数は永続化されない**。グローバル変数に状態を保存してツール間で共有することは不可。
- データの永続化が必要な場合は、外部データベースやKVストアを使用すること（現時点では実装されていないため、ステートレスな実装のみ行う）。

### 2.2. ファイルシステム
- **Read-Only**: 基本的にファイルシステムへの書き込みはできない。
- `/tmp` ディレクトリへの書き込みは可能だが、インスタンス間で共有されず、実行終了後に消えるため、永続ストレージとしては使用しない。

### 2.3. 通信プロトコル
- 従来の `stdio` (標準入出力) ではなく、**HTTP (POST /api/mcp)** で通信を行う。
- `mcp-handler` ライブラリを使用してエンドポイントを実装する。

### 2.4. 実行時間
- Vercel の Serverless Function タイムアウト（デフォルト10〜60秒）に注意する。
- API リクエスト (`geocode_place`, `get_forecast`) は高速に応答する必要がある。

## 3. 開発ガイドライン

### 3.1. コード実装
- **TypeScript**: 厳密な型定義を行う。`any` の使用は極力避ける。
- **Zod**: すべてのツール入力引数は `zod` スキーマで定義し、バリデーションを行う。
- **エラーハンドリング**: 外部 API (Open-Meteo) 呼び出し失敗時の適切なエラー処理を実装し、ユーザーに分かりやすいメッセージを返す。

### 3.2. スタイル
- Next.js App Router の規約に従う (`app/api/mcp/route.ts` 等)。
- 環境変数は `.env.local` で管理し、コードにハードコードしない。


このガイドラインに従い、安全かつ効率的に開発を進めること。
