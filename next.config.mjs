import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  turbopack: {
    root: resolve(__dirname),
  },
  // VercelのOutput File Tracingで同梱データを確実に含める
  outputFileTracingIncludes: {
    "/api/mcp": ["JP/JP.txt"],
  },
};
export default nextConfig;
