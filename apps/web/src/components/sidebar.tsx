'use client';

import type { UserRoleValue } from '@mata/shared/schemas';
import { Icon, type IconName } from '@mata/ui';
import clsx from 'clsx';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useMe } from '../lib/api';
import { useAuth } from '../lib/auth/auth-provider';

type SidebarProps = {
  open: boolean;
  onClose: () => void;
};

type NavItem = { href: string; label: string; icon: IconName };

const PRODUCER_NAV: NavItem[] = [
  { href: '/producer/home', label: 'Accueil', icon: 'home' },
  { href: '/producer/offers', label: 'Mes offres', icon: 'package' },
  { href: '/producer/received-orders', label: 'Commandes reçues', icon: 'inbox' },
  { href: '/producer/pickups', label: 'Mes collectes', icon: 'calendar' },
  { href: '/producer/sites', label: 'Mes sites', icon: 'map-pin' },
  { href: '/producer/setup', label: 'Mon profil', icon: 'user' },
  { href: '/producer/help', label: 'Me faire aider', icon: 'phone-call' },
];
const CLIENT_NAV: NavItem[] = [
  { href: '/client/home', label: 'Accueil', icon: 'home' },
  { href: '/client/catalog', label: 'Catalogue', icon: 'grid-2x2' },
  { href: '/client/cart', label: 'Mon panier', icon: 'shopping-cart' },
  { href: '/client/orders', label: 'Mes commandes', icon: 'package-check' },
];
const ADMIN_NAV: NavItem[] = [
  { href: '/admin/dashboard', label: 'Dashboard', icon: 'layout-dashboard' },
  { href: '/admin/users/new', label: 'Créer un utilisateur', icon: 'user-plus' },
  { href: '/admin/producers', label: 'Producteurs', icon: 'users' },
  { href: '/admin/offers', label: 'Validation offres', icon: 'badge-check' },
  { href: '/admin/orders', label: 'Commandes', icon: 'shopping-bag' },
  { href: '/admin/pickups', label: 'Tournées', icon: 'truck' },
  { href: '/admin/payments', label: 'Paiements', icon: 'wallet' },
  { href: '/admin/teleconseil', label: 'Téléconseil', icon: 'headphones' },
  { href: '/admin/pricing', label: 'Pricing', icon: 'calculator' },
  { href: '/admin/categories', label: 'Catégories', icon: 'tag' },
  { href: '/admin/architecture', label: 'App archi', icon: 'scroll-text' },
  { href: '/admin/guide', label: "Guide d'utilisation", icon: 'help-circle' },
];
// Téléconseiller : périmètre volontairement restreint (cf. décision produit).
// Il onboarde des producteurs (statut « à valider »), les assiste via session
// déléguée (code 6 chiffres, /admin/teleconseil), valide les offres et gère les
// commandes. La validation/suspension producteur, les paiements, le pricing,
// etc. restent admin only (vérifié aussi côté API §G8).
const TELECONSULTANT_NAV: NavItem[] = [
  { href: '/admin/producers/new', label: 'Créer un producteur', icon: 'user-plus' },
  { href: '/admin/teleconseil', label: 'Assister un producteur', icon: 'headphones' },
  { href: '/admin/offers', label: 'Validation offres', icon: 'badge-check' },
  { href: '/admin/orders', label: 'Commandes', icon: 'shopping-bag' },
];

type NavSectionDef = { key: string; title: string; items: NavItem[] };

const ALL_SECTIONS: NavSectionDef[] = [
  { key: 'producer', title: 'Producteur', items: PRODUCER_NAV },
  { key: 'client', title: 'Client', items: CLIENT_NAV },
  { key: 'admin', title: 'Admin MATA', items: ADMIN_NAV },
  { key: 'teleconsultant', title: 'Téléconseiller', items: TELECONSULTANT_NAV },
];

/**
 * Sections de nav visibles par rôle. La sidebar reflète l'espace propre de
 * l'utilisateur : les pages producteur/client sont liées à SON profil (un admin
 * n'a pas de profil producteur). Ceci ne fait que l'AFFICHAGE — l'autorisation
 * réelle reste vérifiée côté API à chaque endpoint (§G8). Le `teleconsultant`
 * a un périmètre restreint (créer un producteur, valider les offres, gérer les
 * commandes), distinct de l'espace Admin complet.
 */
const SECTIONS_BY_ROLE: Record<UserRoleValue, readonly string[]> = {
  producer: ['producer'],
  client_pro: ['client'],
  client_particulier: ['client'],
  admin: ['admin'],
  super_admin: ['admin'],
  teleconsultant: ['teleconsultant'],
};

/**
 * Sidebar dark (bg-stone-900) visible dès lg, drawer slide-in en dessous.
 * Le contenu des nav items dépend du rôle de l'utilisateur — Lot 1 ne montre
 * qu'un placeholder par rôle (le reste arrive aux Lots 2-7).
 *
 * Référence : ARCHITECTURE.md §8 + maquette mockup/index.html (#sidebar).
 */
export function Sidebar({ open, onClose }: SidebarProps): React.JSX.Element {
  const pathname = usePathname();
  const { logout } = useAuth();
  const { data: me } = useMe();

  // Filtre les sections selon le rôle de l'utilisateur connecté (/v1/auth/me).
  // Tant que le rôle n'est pas chargé, on n'affiche aucune section (évite de
  // montrer brièvement des espaces interdits).
  const visibleKeys = me ? SECTIONS_BY_ROLE[me.role] : [];
  const sections = ALL_SECTIONS.filter((s) => visibleKeys.includes(s.key));

  return (
    <aside
      className={clsx(
        'bg-stone-900 text-stone-300 flex flex-col shrink-0 w-64',
        'lg:flex',
        // mobile drawer
        'fixed lg:static inset-y-0 left-0 z-50 transition-transform duration-200',
        open ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
      )}
    >
      <div className="h-14 px-5 border-b border-stone-800 flex items-center gap-2.5 shrink-0">
        <div className="w-9 h-9 rounded-lg bg-mata-700 flex items-center justify-center">
          <span className="text-white font-extrabold text-sm">MA</span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-white font-bold text-sm">MATA</div>
          <div className="text-[10px] text-stone-500 uppercase tracking-wider">
            Du champ à l’assiette
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="lg:hidden text-stone-400 hover:text-white"
          aria-label="Fermer le menu"
        >
          <Icon name="x" className="w-5 h-5" />
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto py-3 text-sm">
        {sections.map((s) => (
          <NavSection
            key={s.key}
            title={s.title}
            items={s.items}
            pathname={pathname}
            onItemClick={onClose}
          />
        ))}
      </nav>

      <div className="px-3 py-3 border-t border-stone-800">
        <button
          type="button"
          onClick={() => void logout()}
          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-stone-300 hover:bg-stone-800 text-sm"
        >
          <Icon name="log-out" className="w-4 h-4" /> Se déconnecter
        </button>
      </div>
    </aside>
  );
}

type NavSectionProps = {
  title: string;
  items: readonly NavItem[];
  pathname: string;
  onItemClick: () => void;
};

function NavSection({ title, items, pathname, onItemClick }: NavSectionProps): React.JSX.Element {
  return (
    <div className="px-2 mb-3">
      <div className="px-3 pt-1 pb-1 text-[10px] uppercase tracking-wider text-stone-500 font-semibold">
        {title}
      </div>
      <div className="space-y-0.5">
        {items.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onItemClick}
              className={clsx(
                'w-full flex items-center gap-2.5 px-3 py-2 rounded-md transition',
                active
                  ? 'bg-mata-100 text-mata-800 font-semibold'
                  : 'text-stone-300 hover:bg-stone-800',
              )}
            >
              <Icon name={item.icon} className="w-4 h-4" /> {item.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
