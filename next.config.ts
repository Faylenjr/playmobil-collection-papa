import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: { tsconfigPath: "./tsconfig.next.json" },
  serverExternalPackages: ["@electric-sql/pglite", "pglite-prisma-adapter"],
};

export default nextConfig;
