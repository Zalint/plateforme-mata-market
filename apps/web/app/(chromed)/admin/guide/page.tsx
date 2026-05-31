import {
  ORDER_STATUS_LABEL_FR,
  ORDER_TRANSITIONS,
  type OrderStatus,
  PICKUP_STATUS_LABEL_FR,
  PICKUP_TRANSITIONS,
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

// Flux nominal (sans `cancelled`, qui est une branche terminale) et extras
// (états atteints uniquement par branche) — alimentent le stepper.
const ORDER_FLOW = ORDER_ROWS.filter((r) => r.status !== 'cancelled');
const ORDER_EXTRA = ORDER_ROWS.filter((r) => r.status === 'cancelled');
const PICKUP_FLOW = PICKUP_ROWS.filter((r) => r.status !== 'cancelled');
const PICKUP_EXTRA = PICKUP_ROWS.filter((r) => r.status === 'cancelled');

type LinkStep = {
  icon: IconName;
  action: string;
  from: { status: OrderStatus; tone: StatusTone };
  to: { status: OrderStatus; tone: StatusTone };
  desc: string;
};

const LINK_STEPS: LinkStep[] = [
  {
    icon: 'plus',
    action: 'Créer la tournée',
    from: { status: 'confirmed', tone: 'success' },
    to: { status: 'collecting', tone: 'warning' },
    desc: 'La commande apparaît dans « Mes collectes » des producteurs concernés.',
  },
  {
    icon: 'check-circle',
    action: 'Tournée « Effectuée »',
    from: { status: 'collecting', tone: 'warning' },
    to: { status: 'collected', tone: 'info' },
    desc: 'Dès que TOUS les items de la commande sont collectés (multi-tournées possible).',
  },
  {
    icon: 'x',
    action: 'Annuler la tournée',
    from: { status: 'collecting', tone: 'warning' },
    to: { status: 'confirmed', tone: 'success' },
    desc: 'Si la commande n’a plus aucune tournée active → elle redevient planifiable.',
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

/**
 * Diagramme d'état vertical (stepper) data-driven : le flux nominal relié par
 * un rail, et pour chaque état ses transitions secondaires (arêtes de la matrice
 * autres que l'étape suivante) en annotation. `extra` = états atteints seulement
 * par branche (ex. Annulée), affichés sous un séparateur.
 */
function StateStepper<S extends string>({
  flow,
  extra,
  transitions,
  label,
}: {
  flow: StatusRow<S>[];
  extra: StatusRow<S>[];
  transitions: Record<S, readonly S[]>;
  label: Record<S, string>;
}): React.JSX.Element {
  const order = flow.map((f) => f.status);
  return (
    <div>
      <ol>
        {flow.map((r, i) => {
          const next: S | undefined = order[i + 1];
          const branches = transitions[r.status].filter((t) => t !== next);
          const isLast = i === flow.length - 1;
          return (
            <li key={r.status} className="flex gap-3">
              <div className="flex flex-col items-center pt-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-mata-700 shrink-0" />
                {!isLast && <span className="w-px grow bg-stone-200 my-1" />}
              </div>
              <div className={`flex-1 ${isLast ? '' : 'pb-5'}`}>
                <StatusBadge tone={r.tone}>{label[r.status]}</StatusBadge>
                <p className="text-sm text-stone-600 mt-1">{r.desc}</p>
                {branches.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                    {branches.map((t) => (
                      <span
                        key={t}
                        className="inline-flex items-center gap-1 text-xs text-stone-500"
                      >
                        <Icon name="arrow-right" className="w-3 h-3 text-stone-400" />
                        {label[t]}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ol>
      {extra.length > 0 && (
        <div className="mt-3 pt-3 border-t border-dashed border-stone-200 space-y-2.5">
          {extra.map((r) => (
            <div key={r.status} className="flex items-start gap-3">
              <span className="shrink-0 mt-0.5 w-28">
                <StatusBadge tone={r.tone}>{label[r.status]}</StatusBadge>
              </span>
              <span className="text-sm text-stone-600">{r.desc}</span>
            </div>
          ))}
        </div>
      )}
    </div>
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
        <StateStepper
          flow={ORDER_FLOW}
          extra={ORDER_EXTRA}
          transitions={ORDER_TRANSITIONS}
          label={ORDER_STATUS_LABEL_FR}
        />
      </Card>

      <Card title="Cycle de vie d'une tournée de collecte">
        <p className="text-sm text-stone-500 mb-4">
          Une tournée regroupe les produits de plusieurs commandes / producteurs d'une même zone,
          pour un même passage du collecteur.
        </p>
        <StateStepper
          flow={PICKUP_FLOW}
          extra={PICKUP_EXTRA}
          transitions={PICKUP_TRANSITIONS}
          label={PICKUP_STATUS_LABEL_FR}
        />
      </Card>

      <Card title="Le lien commande ↔ tournée (automatique)">
        <p className="text-sm text-stone-500 mb-4">
          Les statuts de collecte d'une commande ne se changent pas à la main : ils suivent la
          tournée. Trois règles :
        </p>
        <ul className="space-y-4">
          {LINK_STEPS.map((s) => (
            <li key={s.action} className="flex items-start gap-3">
              <div className="shrink-0 w-9 h-9 rounded-lg bg-mata-50 flex items-center justify-center">
                <Icon name={s.icon} className="w-5 h-5 text-mata-700" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-stone-900 text-sm">{s.action}</span>
                  <span className="text-stone-300">·</span>
                  <StatusBadge tone={s.from.tone}>
                    {ORDER_STATUS_LABEL_FR[s.from.status]}
                  </StatusBadge>
                  <Icon name="arrow-right" className="w-3.5 h-3.5 text-stone-400" />
                  <StatusBadge tone={s.to.tone}>{ORDER_STATUS_LABEL_FR[s.to.status]}</StatusBadge>
                </div>
                <div className="text-sm text-stone-600 mt-1">{s.desc}</div>
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
