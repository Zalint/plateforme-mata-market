import { ConfirmProvider, ToastProvider } from '@mata/ui';
import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import { QueryProvider } from '../src/lib/api/query-provider';
import { AuthProvider } from '../src/lib/auth/auth-provider';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'MATA · Du champ à l’assiette',
  description: 'Plateforme MATA — producteurs, clients et back-office.',
  manifest: '/manifest.json',
  applicationName: 'MATA',
  appleWebApp: {
    capable: true,
    title: 'MATA',
    statusBarStyle: 'default',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#9b1c1c',
};

type RootLayoutProps = {
  children: React.ReactNode;
};

export default function RootLayout({ children }: RootLayoutProps): React.JSX.Element {
  // `suppressHydrationWarning` sur <html> et <body> : neutralise les faux
  // positifs d'hydratation Next causés par les extensions navigateur qui
  // injectent des attributs (Grammarly → data-gr-*, LanguageTool → data-lt-*,
  // certains traducteurs, etc.) AVANT que React n'hydrate. L'app ne génère
  // pas ces attributs côté serveur — c'est uniquement l'environnement client.
  // Réf : https://nextjs.org/docs/messages/react-hydration-error
  return (
    <html lang="fr" className={inter.variable} suppressHydrationWarning>
      <body className="font-sans antialiased" suppressHydrationWarning>
        <AuthProvider>
          <QueryProvider>
            <ToastProvider>
              <ConfirmProvider>{children}</ConfirmProvider>
            </ToastProvider>
          </QueryProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
