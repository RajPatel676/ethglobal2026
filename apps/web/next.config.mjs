/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // @receivable/shared ships TypeScript source, not a build step.
  transpilePackages: ['@receivable/shared'],
  eslint: { ignoreDuringBuilds: true }, // `pnpm lint` runs eslint directly
}
export default nextConfig
