import { Icon } from '@mata/ui';
import Link from 'next/link';

type LoginPageProps = {
  searchParams: Promise<{ error?: string }>;
};

const ERROR_MESSAGES: Record<string, string> = {
  missing_code: 'La réponse Keycloak ne contenait pas de code d’autorisation.',
  invalid_pkce: 'Le cookie PKCE est invalide ou absent.',
  state_mismatch: 'Le paramètre `state` ne correspond pas — possible tentative CSRF.',
  exchange_failed: 'L’échange du code contre des tokens a échoué côté Keycloak.',
};

export default async function LoginPage({
  searchParams,
}: LoginPageProps): Promise<React.JSX.Element> {
  const params = await searchParams;
  const errorKey = params.error;
  const errorMessage = errorKey
    ? (ERROR_MESSAGES[errorKey] ?? `Erreur inconnue : ${errorKey}`)
    : null;

  return (
    <main className="min-h-screen grid lg:grid-cols-2">
      <div className="flex flex-col px-6 lg:px-12 py-8">
        <Link href="/welcome" className="flex items-center gap-2.5">
          <div className="w-10 h-10 rounded-xl bg-mata-700 flex items-center justify-center">
            <span className="text-white font-extrabold text-sm">MA</span>
          </div>
          <div>
            <div className="font-bold text-stone-900">MATA</div>
            <div className="text-[11px] text-stone-500 -mt-0.5">Du champ à l’assiette</div>
          </div>
        </Link>

        <div className="flex-1 flex items-center">
          <div className="w-full max-w-sm mx-auto py-12">
            <h1 className="text-2xl lg:text-3xl font-bold text-stone-900">Connexion</h1>
            <p className="text-sm text-stone-600 mt-2">
              Cliquez pour vous connecter via Keycloak (l’hôte d’identité MATA).
            </p>

            {errorMessage ? (
              <div className="mt-5 p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-900 flex items-start gap-2">
                <Icon name="alert-triangle" className="w-4 h-4 mt-0.5 shrink-0" />
                <span>{errorMessage}</span>
              </div>
            ) : null}

            <Link
              href="/api/auth/login"
              className="mt-8 w-full inline-flex items-center justify-center gap-2 py-3.5 rounded-xl bg-mata-700 hover:bg-mata-800 text-white font-bold shadow-soft transition"
            >
              <Icon name="log-in" className="w-5 h-5" />
              Continuer avec Keycloak
            </Link>

            <Link
              href="/welcome"
              className="mt-4 block text-center text-xs text-stone-500 hover:text-mata-700 font-medium"
            >
              ← Retour à l’accueil
            </Link>
          </div>
        </div>
      </div>

      <div className="hidden lg:flex bg-mata-700 text-white p-12 flex-col justify-between relative overflow-hidden">
        <div className="absolute -top-20 -right-20 w-80 h-80 rounded-full bg-mata-600 opacity-50" />
        <div className="absolute bottom-0 left-0 w-72 h-72 rounded-full bg-mata-800 opacity-40" />
        <div className="relative">
          <div className="text-[11px] uppercase tracking-wider text-mata-200 font-semibold">
            Plateforme MATA
          </div>
          <h2 className="text-3xl font-bold mt-2 leading-tight">
            Connecter le producteur sénégalais au marché.
          </h2>
        </div>
      </div>
    </main>
  );
}
