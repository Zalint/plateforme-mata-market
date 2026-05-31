import { Icon } from '@mata/ui';
import Link from 'next/link';

/**
 * Page de bienvenue — entrée publique de l'app. Propose les 3 rôles de démo.
 * Le lien « Voir la maquette de référence » est MASQUÉ par défaut (artefact de
 * dev) ; réactivable avec NEXT_PUBLIC_SHOW_MOCKUP=true.
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
        <p className="text-stone-600 mt-3 max-w-xl mx-auto">
          Plateforme PMV qui connecte producteurs, clients et back-office MATA. Lot 1 ·
          authentification + design system.
        </p>

        <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link
            href="/api/auth/login"
            className="inline-flex items-center gap-2 px-6 py-3.5 rounded-xl bg-mata-700 hover:bg-mata-800 text-white font-bold shadow-soft transition"
          >
            <Icon name="log-in" className="w-5 h-5" />
            Se connecter via Keycloak
          </Link>
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

        <div className="mt-12 grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="p-4 rounded-xl bg-white border border-stone-200 text-left">
            <div className="w-9 h-9 rounded-lg bg-amber-100 flex items-center justify-center mb-3">
              <Icon name="sprout" className="w-4 h-4 text-amber-800" />
            </div>
            <div className="font-bold text-stone-900 text-sm">Producteur</div>
            <div className="text-xs text-stone-500 mt-1">
              Publier offres, gérer stock, recevoir commandes.
            </div>
          </div>
          <div className="p-4 rounded-xl bg-white border border-stone-200 text-left">
            <div className="w-9 h-9 rounded-lg bg-blue-100 flex items-center justify-center mb-3">
              <Icon name="shopping-basket" className="w-4 h-4 text-blue-800" />
            </div>
            <div className="font-bold text-stone-900 text-sm">Client</div>
            <div className="text-xs text-stone-500 mt-1">
              Catalogue validé MATA, commande, suivi, gros volume.
            </div>
          </div>
          <div className="p-4 rounded-xl bg-white border border-stone-200 text-left">
            <div className="w-9 h-9 rounded-lg bg-mata-100 flex items-center justify-center mb-3">
              <Icon name="shield" className="w-4 h-4 text-mata-800" />
            </div>
            <div className="font-bold text-stone-900 text-sm">Back-office MATA</div>
            <div className="text-xs text-stone-500 mt-1">
              Validation, calendrier, pricing, paiements, audit.
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
