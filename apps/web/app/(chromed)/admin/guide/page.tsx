import {
  ORDER_STATUS_LABEL_FR,
  type OrderStatus,
  PICKUP_STATUS_LABEL_FR,
  type PickupStatus,
} from '@mata/shared/constants';
import { Icon, type IconName, StatusBadge, type StatusTone } from '@mata/ui';

/**
 * Admin / Guide d'utilisation · page de documentation (lecture seule).
 *
 * Explique aux opérateurs MATA : le cycle de vie des commandes, celui des
 * tournées de collecte, leur couplage automatique, et les menus de chaque rôle.
 * Source de vérité des libellés : constantes partagées (pas de texte dupliqué).
 */

type StatusRow<S extends string> = { status: S; tone: StatusTone; desc: string };

const ORDER_ROWS: StatusRow<OrderStatus>[] = [
  {
    status: 'created',
    tone: 'neutral',
    desc: 'Panier validé par le client, en attente de confirmation MATA.',
  },
  {
    status: 'confirmed',
    tone: 'success',
    desc: 'MATA accepte : producteurs notifiés, stock réservé. Devient rattachable à une tournée.',
  },
  {
    status: 'collecting',
    tone: 'warning',
    desc: 'Une tournée de collecte ramasse les produits chez les producteurs. Statut piloté par la tournée.',
  },
  {
    status: 'collected',
    tone: 'info',
    desc: 'Tous les items ont été récupérés, en route vers le dépôt. Statut piloté par la tournée.',
  },
  {
    status: 'stored',
    tone: 'neutral',
    desc: 'Entrée en chambre froide, en attente de la tournée de livraison.',
  },
  { status: 'delivering', tone: 'info', desc: 'Le livreur est en route vers le client.' },
  {
    status: 'delivered',
    tone: 'success',
    desc: 'Le client a confirmé la réception — déclenche le reversement au producteur.',
  },
  {
    status: 'cancelled',
    tone: 'danger',
    desc: 'Annulée par le client (avant collecte) ou par MATA (rupture, problème).',
  },
];

const PICKUP_ROWS: StatusRow<PickupStatus>[] = [
  {
    status: 'scheduled',
    tone: 'neutral',
    desc: 'Tournée créée, items de commandes rattachés. Visible chez les producteurs concernés.',
  },
  {
    status: 'to_confirm',
    tone: 'warning',
    desc: 'En attente de confirmation logistique (créneau, véhicule, collecteur).',
  },
  { status: 'confirmed', tone: 'success', desc: 'Prête à démarrer.' },
  {
    status: 'collecting',
    tone: 'warning',
    desc: 'Le collecteur est sur le terrain : il coche les items récupérés.',
  },
  {
    status: 'collected',
    tone: 'success',
    desc: 'Tous les items ramassés. La tournée est terminée.',
  },
  {
    status: 'cancelled',
    tone: 'danger',
    desc: 'Tournée annulée : les items sont libérés et redeviennent rattachables.',
  },
];

type MenuDef = { role: string; tone: string; items: { label: string; desc: string }[] };

const MENUS: MenuDef[] = [
  {
    role: 'Producteur',
    tone: 'bg-mata-50 text-mata-700',
    items: [
      { label: 'Accueil', desc: 'Vue d’ensemble (offres actives, à recevoir, commandes du mois).' },
      {
        label: 'Mes offres',
        desc: 'Créer / soumettre ses offres ; suivre leur validation par MATA.',
      },
      { label: 'Commandes reçues', desc: 'Les commandes clients portant sur ses produits.' },
      {
        label: 'Mes collectes',
        desc: 'Les tournées où MATA vient ramasser sa marchandise (lecture seule).',
      },
      { label: 'Mes sites', desc: 'Ses lieux de production / points de retrait géolocalisés.' },
      { label: 'Mon profil', desc: 'Informations producteur, coordonnées bancaires, documents.' },
      {
        label: 'Me faire aider',
        desc: 'Génère un code pour qu’un téléconseiller agisse à sa place.',
      },
    ],
  },
  {
    role: 'Client',
    tone: 'bg-stone-100 text-stone-700',
    items: [
      { label: 'Catalogue', desc: 'Parcourir les offres validées et ajouter au panier.' },
      {
        label: 'Mon panier',
        desc: 'Vérifier les articles puis passer commande (paiement Bictorys).',
      },
      { label: 'Mes commandes', desc: 'Suivre le statut de ses commandes (de Créée à Livrée).' },
    ],
  },
  {
    role: 'Admin MATA',
    tone: 'bg-amber-50 text-amber-700',
    items: [
      { label: 'Dashboard', desc: 'KPIs et vue d’ensemble de la plateforme.' },
      { label: 'Producteurs', desc: 'Valider, suspendre ou blacklister les producteurs.' },
      {
        label: 'Validation offres',
        desc: 'Approuver / rejeter les offres avant publication au catalogue.',
      },
      { label: 'Commandes', desc: 'Suivre et faire avancer le cycle des commandes.' },
      {
        label: 'Tournées',
        desc: 'Planifier les collectes — c’est ce qui pilote les statuts collecte des commandes.',
      },
      { label: 'Paiements', desc: 'Suivre les encaissements et reversements.' },
      { label: 'Téléconseil', desc: 'Sessions d’assistance des producteurs (audit complet).' },
      { label: 'Pricing', desc: 'Règles de prix à 7 composantes et simulateur.' },
    ],
  },
  {
    role: 'Téléconseiller',
    tone: 'bg-stone-100 text-stone-700',
    items: [
      {
        label: 'Téléconseil (espace Admin)',
        desc: 'Saisit le code fourni par un producteur pour agir en son nom. Toutes les actions sont journalisées (acteur réel + producteur assisté).',
      },
    ],
  },
];

const LINK_STEPS: { icon: IconName; title: string; desc: string }[] = [
  {
    icon: 'plus',
    title: 'Créer une tournée → commande « En collecte »',
    desc: 'Quand l’admin crée une tournée incluant les items d’une commande, cette commande passe automatiquement de Confirmée à En collecte, et apparaît dans « Mes collectes » des producteurs concernés.',
  },
  {
    icon: 'check-circle',
    title: 'Tournée « Effectuée » → commande « Collectée »',
    desc: 'Lorsque la tournée passe à Effectuée, chaque commande dont TOUS les items sont collectés passe de En collecte à Collectée (une commande peut être répartie sur plusieurs tournées).',
  },
  {
    icon: 'x',
    title: 'Annuler une tournée → retour « Confirmée »',
    desc: 'Si une tournée est annulée, ses items sont libérés. Les commandes qui n’ont plus aucune tournée active reviennent de En collecte à Confirmée, et redeviennent planifiables.',
  },
];

function Card({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <section className="bg-white rounded-2xl border border-stone-200 shadow-soft p-5 lg:p-6">
      <h2 className="text-lg font-bold text-stone-900 mb-4">{title}</h2>
      {children}
    </section>
  );
}

function StatusList<S extends string>({
  rows,
  label,
}: {
  rows: StatusRow<S>[];
  label: Record<S, string>;
}): React.JSX.Element {
  return (
    <ul className="space-y-2.5">
      {rows.map((r) => (
        <li key={r.status} className="flex items-start gap-3">
          <span className="shrink-0 mt-0.5 w-28">
            <StatusBadge tone={r.tone}>{label[r.status]}</StatusBadge>
          </span>
          <span className="text-sm text-stone-600">{r.desc}</span>
        </li>
      ))}
    </ul>
  );
}

export default function AdminGuidePage(): React.JSX.Element {
  return (
    <div className="px-4 sm:px-6 lg:px-8 py-5 lg:py-8 max-w-4xl mx-auto space-y-6">
      <div>
        <div className="text-sm text-stone-500 flex items-center gap-2">
          <Icon name="help-circle" className="w-4 h-4 text-mata-700" />
          <span>Aide</span>
        </div>
        <h1 className="text-2xl lg:text-3xl font-bold text-stone-900 mt-1">Guide d'utilisation</h1>
        <p className="text-sm text-stone-500 mt-1">
          Comment marchent les statuts des commandes, des tournées, leur lien, et les menus de
          chaque profil.
        </p>
      </div>

      <Card title="Cycle de vie d'une commande">
        <p className="text-sm text-stone-500 mb-4">
          Une commande suit ces étapes, dans l'ordre. Les étapes « En collecte » et « Collectée »
          sont pilotées par les tournées (voir plus bas) ; les autres sont pilotées par l'admin.
        </p>
        <StatusList rows={ORDER_ROWS} label={ORDER_STATUS_LABEL_FR} />
      </Card>

      <Card title="Cycle de vie d'une tournée de collecte">
        <p className="text-sm text-stone-500 mb-4">
          Une tournée regroupe les produits de plusieurs commandes / producteurs d'une même zone,
          pour un même passage du collecteur.
        </p>
        <StatusList rows={PICKUP_ROWS} label={PICKUP_STATUS_LABEL_FR} />
      </Card>

      <Card title="Le lien commande ↔ tournée (automatique)">
        <p className="text-sm text-stone-500 mb-4">
          Les statuts de collecte d'une commande ne se changent pas à la main : ils suivent la
          tournée. Trois règles :
        </p>
        <ul className="space-y-4">
          {LINK_STEPS.map((s) => (
            <li key={s.title} className="flex items-start gap-3">
              <div className="shrink-0 w-9 h-9 rounded-lg bg-mata-50 flex items-center justify-center">
                <Icon name={s.icon} className="w-5 h-5 text-mata-700" />
              </div>
              <div>
                <div className="font-semibold text-stone-900 text-sm">{s.title}</div>
                <div className="text-sm text-stone-600 mt-0.5">{s.desc}</div>
              </div>
            </li>
          ))}
        </ul>
      </Card>

      <Card title="Les menus selon le profil">
        <p className="text-sm text-stone-500 mb-4">
          Chaque utilisateur ne voit que l'espace correspondant à son rôle.
        </p>
        <div className="space-y-5">
          {MENUS.map((m) => (
            <div key={m.role}>
              <span
                className={`inline-block px-2.5 py-1 rounded-md text-xs font-bold uppercase tracking-wider ${m.tone}`}
              >
                {m.role}
              </span>
              <ul className="mt-2 space-y-1.5">
                {m.items.map((it) => (
                  <li key={it.label} className="text-sm text-stone-600">
                    <span className="font-semibold text-stone-900">{it.label}</span> — {it.desc}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
