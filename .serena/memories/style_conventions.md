# コード/運用の約束（現時点で分かった範囲）

## 言語/ランタイム
- TypeScript（ESM / `type: module`）
- Next.js App Router 構成

## 実装方針
- 入力は Zod でバリデーションする（README/依存関係より）
- Vercel Serverless 前提でステートレスにする（メモリ常駐の状態共有は避ける）

## 命名/配置
- API は `app/api/.../route.ts` に置く（Next.js 規約）

未確認:
- フォーマッタ/リンタ（package.json に scripts が無いため、現状は未設定の可能性が高い）
