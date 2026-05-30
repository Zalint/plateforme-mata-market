import withSerwistInit from '@serwist/next';

/**
 * Service worker généré par serwist (CLAUDE.md §G1 : « SW généré par
 * serwist/next-pwa, jamais à la main »). La source vit dans `app/sw.ts`
 * (précache Next + runtime cache + handlers push/notificationclick Lot 7),
 * compilée vers `public/sw.js`.
 *
 * Désactivé en dev pour éviter le cache agressif pendant le hot-reload.
 */
const withSerwist = withSerwistInit({
  swSrc: 'app/sw.ts',
  swDest: 'public/sw.js',
  disable: process.env.NODE_ENV === 'development',
  reloadOnOnline: true,
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  output: 'standalone',
  experimental: {
    typedRoutes: false,
  },
  // Désactive les images Next pour le Lot 0 (pas encore Cloudinary)
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'res.cloudinary.com',
      },
    ],
  },
};

export default withSerwist(nextConfig);
