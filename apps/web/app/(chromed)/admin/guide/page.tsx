import {
  OFFER_STATUS_LABEL_FR,
  type OfferStatus,
  ORDER_STATUS_LABEL_FR,
  ORDER_TRANSITIONS,
  type OrderStatus,
  PICKUP_STATUS_LABEL_FR,
  PICKUP_TRANSITIONS,
  type PickupStatus,
} from '@mata/shared/constants';
import { Icon, StatusBadge, type StatusTone } from '@mata/ui';

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
    desc: 'Le client a commandé. En attente : un téléconseiller la prend en charge.',
  },
  {
    status: 'confirmed',
    tone: 'success',
    desc: 'Le téléconseiller a validé avec le producteur (et le client si le prix a changé). Stock réservé.',
  },
  {
    status: 'delivering',
    tone: 'info',
    desc: 'En cours d’acheminement vers le client (collecte + livraison gérées par l’équipe).',
  },
  {
    status: 'delivered',
    tone: 'success',
    desc: 'Le client a confirmé la réception — déclenche le reversement au producteur.',
  },
  {
    status: 'cancelled',
    tone: 'danger',
    desc: 'Annulée par le client ou MATA, à tout moment avant la livraison.',
  },
];

// Cycle de vie d'une offre (pas de stepper : flux non linéaire). On distingue le
// workflow producteur de la modération MATA.
const OFFER_ROWS: StatusRow<OfferStatus>[] = [
  { status: 'draft', tone: 'neutral', desc: 'Brouillon du producteur, non soumis. Éditable.' },
  { status: 'pending', tone: 'warning', desc: 'Soumise à MATA, en attente de validation.' },
  {
    status: 'changes_requested',
    tone: 'warning',
    desc: 'MATA renvoie l’offre pour correction (feedback). Redevient éditable ; la re-soumission efface le feedback.',
  },
  { status: 'validated', tone: 'success', desc: 'Approuvée par MATA et publiée au catalogue.' },
  { status: 'rejected', tone: 'danger', desc: 'Refusée par MATA (définitif). Archivable.' },
  {
    status: 'expired',
    tone: 'neutral',
    desc: 'Date limite dépassée → retirée du catalogue. Le producteur peut la relancer (→ brouillon).',
  },
  {
    status: 'archived',
    tone: 'neutral',
    desc: 'Rangée par le producteur (depuis brouillon ou refusée). Restaurable en brouillon.',
  },
  {
    status: 'suspended',
    tone: 'warning',
    desc: 'Masquée temporairement (par le producteur en self-service OU par MATA). Réactivable.',
  },
  {
    status: 'withdrawn',
    tone: 'danger',
    desc: 'Retirée unilatéralement par MATA. Le producteur ne peut pas la remettre — seul MATA restaure (→ brouillon).',
  },
  {
    status: 'reserved',
    tone: 'info',
    desc: 'Entièrement réservée par des commandes. Revient « Validée » si une réservation est annulée.',
  },
  {
    status: 'sold',
    tone: 'neutral',
    desc: 'Toutes les commandes livrées → vendue définitivement (terminal).',
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
    tone: 'bg-mata-50 text-mata-700',
    items: [
      { label: 'Dashboard', desc: 'KPIs et vue d’ensemble de la plateforme.' },
      { label: 'Producteurs', desc: 'Valider, suspendre ou blacklister les producteurs.' },
      {
        label: 'Validation offres',
        desc: 'Valider / refuser / demander des corrections / retirer / suspendre les offres. Recherche par offre ou producteur + filtre par producteur.',
      },
      { label: 'Commandes', desc: 'Suivre et faire avancer le cycle des commandes.' },
      {
        label: 'Tournées',
        desc: 'Planifier les collectes — c’est ce qui pilote les statuts collecte des commandes.',
      },
      { label: 'Paiements', desc: 'Suivre les encaissements et reversements.' },
      { label: 'Téléconseil', desc: 'Sessions d’assistance des producteurs (audit complet).' },
      {
        label: 'Affectations',
        desc: 'Définir quels producteurs chaque téléconseiller peut modérer (ou « tous »). N’affecte PAS la délégation (assistance via code).',
      },
      { label: 'Pricing', desc: 'Règles de prix à 7 composantes et simulateur.' },
    ],
  },
  {
    role: 'Téléconseiller',
    tone: 'bg-stone-100 text-stone-700',
    items: [
      {
        label: 'Créer un producteur',
        desc: 'Onboarder un nouveau producteur (compte + profil « à valider »).',
      },
      {
        label: 'Assister un producteur',
        desc: 'Saisir le code fourni par un producteur pour agir EN SON NOM (session déléguée, journalisée : acteur réel + producteur assisté). Ouvert à n’importe quel producteur.',
      },
      {
        label: 'Validation offres',
        desc: 'Modère les offres — UNIQUEMENT celles de ses producteurs affectés (cf. Affectations). Sans affectation : aucune ; « tous » : comme un admin.',
      },
      { label: 'Commandes', desc: 'Suivre et faire avancer les commandes.' },
    ],
  },
];

// Pricing à 7 composantes (cf. écran Admin / Pricing). Le prix producteur est
// un INTRANT (fixé par le producteur, pas par la règle) ; les 6 autres sont la
// marge + les coûts MATA, configurés par l'admin.
type PriceComponent = { label: string; desc: string; sign: '=' | '+' | '−' };
const PRICE_COMPONENTS: PriceComponent[] = [
  {
    label: 'Prix producteur',
    sign: '=',
    desc: 'Prix demandé par le producteur sur son offre (champ « Prix demandé » de Nouvelle offre). Verrouillé côté admin : c’est un intrant, pas un paramètre de règle. C’est EXACTEMENT ce que le producteur reçoit.',
  },
  {
    label: 'Commission plateforme',
    sign: '+',
    desc: 'Marge MATA : un pourcentage d’une base (ex. prix producteur) ou un montant fixe.',
  },
  {
    label: 'Coût collecte',
    sign: '+',
    desc: 'Forfait par unité pour ramasser la marchandise chez le producteur.',
  },
  { label: 'Coût livraison', sign: '+', desc: 'Selon la grille de la zone du client.' },
  { label: 'Coût stockage', sign: '+', desc: 'Forfait court séjour en chambre froide.' },
  {
    label: 'Marge sécurité',
    sign: '+',
    desc: 'Pourcentage couvrant pertes, variations de poids et incidents.',
  },
  {
    label: 'Remise',
    sign: '−',
    desc: 'Réduction manuelle décidée par l’admin (soustraite du total).',
  },
];

const PRICE_NOTES: string[] = [
  'Qui fixe le prix producteur ? Le producteur lui-même, par offre. Un téléconseiller peut le faire en son nom via une session déléguée. L’admin ne le fixe pas — il calibre seulement la marge et les coûts MATA par-dessus.',
  'Répartition : le producteur reçoit son prix producteur ; MATA encaisse tout le reste (commission + coûts + marge − remise).',
  'Figé à la commande : un instantané (snapshot) du prix est enregistré à la création de chaque commande. Modifier une règle plus tard n’affecte QUE les nouvelles commandes — jamais les commandes passées.',
  'Cible de la règle : « Catégorie » (s’applique à toutes les offres de la catégorie) ou « Offre (override) », prioritaire sur la catégorie.',
];

// Flux nominal (sans `cancelled`, qui est une branche terminale) et extras
// (états atteints uniquement par branche) — alimentent le stepper.
const ORDER_FLOW = ORDER_ROWS.filter((r) => r.status !== 'cancelled');
const ORDER_EXTRA = ORDER_ROWS.filter((r) => r.status === 'cancelled');
const PICKUP_FLOW = PICKUP_ROWS.filter((r) => r.status !== 'cancelled');
const PICKUP_EXTRA = PICKUP_ROWS.filter((r) => r.status === 'cancelled');

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
          Comment marchent les statuts des offres, des commandes et des tournées, leur lien, le
          calcul du prix, et les menus de chaque profil.
        </p>
      </div>

      <Card title="Cycle de vie d'une offre">
        <p className="text-sm text-stone-500 mb-4">
          Une offre navigue entre le workflow du producteur (créer, soumettre, modifier) et la
          modération MATA (valider, refuser, demander des corrections, suspendre, retirer).
        </p>
        <div className="space-y-2.5">
          {OFFER_ROWS.map((r) => (
            <div key={r.status} className="flex items-start gap-3">
              <span className="shrink-0 w-40">
                <StatusBadge tone={r.tone}>{OFFER_STATUS_LABEL_FR[r.status]}</StatusBadge>
              </span>
              <span className="text-sm text-stone-600">{r.desc}</span>
            </div>
          ))}
        </div>
        <div className="mt-4 rounded-xl bg-stone-50 border border-stone-200 p-4 text-sm text-stone-600">
          <span className="font-semibold text-stone-900">Portée de modération.</span> Un
          téléconseiller ne modère que les producteurs qui lui sont affectés (écran « Affectations
          ») ; « tous » lui donne la portée d’un admin. La{' '}
          <span className="font-semibold">délégation</span> (assister un producteur via code) reste
          ouverte à tous et est indépendante de ce périmètre.
        </div>
      </Card>

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

      <Card title="Comment se calcule le prix (pricing à 7 composantes)">
        <p className="text-sm text-stone-500 mb-4">
          MATA ne fixe pas ce que gagne le producteur : elle ajoute sa marge et ses coûts par-dessus
          le prix demandé par le producteur. Le prix final client est la somme de ces composantes.
        </p>
        <ul className="space-y-3">
          {PRICE_COMPONENTS.map((c) => (
            <li key={c.label} className="flex items-start gap-3">
              <span
                className={`shrink-0 mt-0.5 w-6 h-6 rounded-md flex items-center justify-center text-sm font-bold tabular ${
                  c.sign === '−'
                    ? 'bg-stone-100 text-stone-500'
                    : c.sign === '='
                      ? 'bg-mata-50 text-mata-700'
                      : 'bg-mata-50 text-stone-700'
                }`}
              >
                {c.sign}
              </span>
              <span className="text-sm text-stone-600">
                <span className="font-semibold text-stone-900">{c.label}</span> — {c.desc}
              </span>
            </li>
          ))}
        </ul>

        <div className="mt-4 rounded-xl bg-stone-900 text-white p-4">
          <div className="text-[11px] uppercase tracking-wider text-stone-400 font-semibold mb-1">
            Prix final client
          </div>
          <code className="text-sm text-stone-100">
            Prix producteur + Commission + Collecte + Livraison + Stockage + Marge sécurité − Remise
          </code>
        </div>

        <ul className="mt-4 space-y-2">
          {PRICE_NOTES.map((n) => (
            <li key={n} className="flex items-start gap-2 text-sm text-stone-600">
              <Icon name="check" className="w-4 h-4 text-mata-700 mt-0.5 shrink-0" />
              <span>{n}</span>
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
