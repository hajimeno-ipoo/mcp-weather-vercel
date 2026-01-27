#!/bin/bash
# Config Validation Test Script
# 環境変数と設定が正しく読み込まれているかをテストします

echo "=== Configuration Validation Test ==="
echo ""

# Test .env.local existence
echo "✓ .env.local ファイル:"
if [ -f ".env.local" ]; then
  echo "  ✅ 存在します"
else
  echo "  ❌ 存在しません（作成してください: cp .env.example .env.local）"
fi
echo ""

# Test .env.example existence
echo "✓ .env.example ファイル:"
if [ -f ".env.example" ]; then
  echo "  ✅ 存在します"
  # Count variables
  var_count=$(grep -c "^[A-Z_]" .env.example)
  echo "  📋 定義されている環境変数: $var_count 個"
else
  echo "  ❌ 存在しません"
fi
echo ""

# Test configuration in route.ts
echo "✓ route.ts 内のコンフィグ:"
if grep -q "const CONFIG" app/api/mcp/route.ts; then
  echo "  ✅ CONFIG オブジェクトが定義されています"
  # Check for key variables
  if grep -q "GEOCODING_API_URL" app/api/mcp/route.ts; then
    echo "  ✅ GEOCODING_API_URL が設定されています"
  fi
  if grep -q "FORECAST_API_URL" app/api/mcp/route.ts; then
    echo "  ✅ FORECAST_API_URL が設定されています"
  fi
  if grep -q "REQUEST_TIMEOUT" app/api/mcp/route.ts; then
    echo "  ✅ REQUEST_TIMEOUT が設定されています"
  fi
  if grep -q "RETRY_ATTEMPTS" app/api/mcp/route.ts; then
    echo "  ✅ RETRY_ATTEMPTS が設定されています"
  fi
else
  echo "  ❌ CONFIG オブジェクトが見つかりません"
fi
echo ""

# Test error handling functions
echo "✓ エラーハンドリング関数:"
if grep -q "fetchWithTimeout" app/api/mcp/route.ts; then
  echo "  ✅ fetchWithTimeout 関数が定義されています"
fi
if grep -q "fetchWithRetry" app/api/mcp/route.ts; then
  echo "  ✅ fetchWithRetry 関数が定義されています"
fi
echo ""

# Test package.json versions
echo "✓ package.json パッケージバージョン:"
next_version=$(grep '"next"' package.json | grep -oE '[0-9]+\.[0-9]+\.[0-9]+')
echo "  Next.js: $next_version"
zod_version=$(grep '"zod"' package.json | grep -oE '[0-9]+\.[0-9]+\.[0-9]+')
echo "  Zod: $zod_version"
typescript_version=$(grep '"typescript"' package.json | grep -oE '[0-9]+\.[0-9]+\.[0-9]+')
echo "  TypeScript: $typescript_version"
echo ""

# Test next.config.mjs
echo "✓ next.config.mjs:"
if grep -q "turbopack" next.config.mjs; then
  echo "  ✅ turbopack 設定が存在します"
else
  echo "  ❌ turbopack 設定が見つかりません"
fi
echo ""

echo "=== テスト完了 ==="
