import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    // pnpm's linked workspace dependencies resolve through the root virtual store.
    root: path.join(__dirname, "../.."),
  },
};

export default nextConfig;
