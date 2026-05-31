import { Icon } from '@mata/ui';

/**
 * Page de bienvenue — entrée publique de l'app : logo + titre + bouton de
 * connexion. Le lien « Voir la maquette de référence » est MASQUÉ par défaut
 * (artefact de dev) ; réactivable avec NEXT_PUBLIC_SHOW_MOCKUP=true.
 */
export default function WelcomePage(): React.JSX.Element {
  const showMockup = process.env.NEXT_PUBLIC_SHOW_MOCKUP === 'true';
  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-6 py-12 bg-gradient-to-br from-stone-50 via-stone-100 to-mata-50">
      <div className="max-w-3xl w-full text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-mata-700 shadow-card">
          <span className="text-white font-extrabold text-lg tracking-tight">MA</span>
        </div>
        <h1 className="text-3xl sm:text-4xl font-extrabold text-stone-900 mt-5 tracking-tight">
          MATA · Du champ à l’assiette
        </h1>

        <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-3">
          {/* <a> simple (pas de <Link> Next) : /api/auth/login est un Route Handler
              qui redirige EN EXTERNE vers Keycloak. Un <Link> tenterait un fetch RSC
              de cette route → « TypeError: Failed to fetch » qui flashe avant la
              navigation complète. Un <a> fait une navigation full-page propre. */}
          <a
            href="/api/auth/login"
            className="inline-flex items-center gap-2 px-6 py-3.5 rounded-xl bg-mata-700 hover:bg-mata-800 text-white font-bold shadow-soft transition"
          >
            <Icon name="log-in" className="w-5 h-5" />
            Se connecter
          </a>
          {showMockup && (
            <a
              href="/mockup/index.html"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 px-6 py-3.5 rounded-xl bg-white border border-stone-200 text-stone-700 font-semibold hover:border-mata-300 transition"
            >
              <Icon name="grid-2x2" className="w-5 h-5" />
              Voir la maquette de référence
            </a>
          )}
        </div>
      </div>
    </main>
  );
}
