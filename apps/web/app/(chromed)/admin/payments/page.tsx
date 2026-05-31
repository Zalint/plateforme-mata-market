'use client';

import { PAYMENT_STATUS_LABEL_FR, type PaymentStatus } from '@mata/shared/constants';
import { Icon, Money, StatusBadge, type StatusTone, useConfirm, useToast } from '@mata/ui';
import { useState } from 'react';
import {
  useAdminPayments,
  usePaymentKpis,
  usePayoutsPending,
  useTriggerPayout,
} from '../../../../src/lib/api';

/**
 * Admin / Paiements & reversements · KPIs + tabs + table.
 *
 * Reproduit la maquette `mockup/index.html` section ADMIN/PAYMENTS (§2774) :
 *  - 4 KpiCards (Encaissé mois / Commission MATA / Frais logistique / À reverser)
 *  - 3 tabs : Commandes (paiements clients) / Reversements N / Historique
 *  - Table responsive avec colonnes #CMD / Client / Montant / Paiement /
 *    Commission / Frais / Part producteur / Reversement / Action
 *
 * Lot 5 : KPI mois calculés à la volée côté front (approximation 10 %/5 %).
 * Lot 9 : agrégats EXACTS côté API via GET /v1/payments/kpis (sommes des
 * pricing_snapshots figés), consommés par `usePaymentKpis()`.
 */

const PAYMENT_TONE: Record<PaymentStatus, StatusTone> = {
  pending: 'warning',
  paid: 'success',
  refunded: 'neutral',
  disputed: 'danger',
};

const PAYMENT_LABEL_FR_UC: Record<PaymentStatus, string> = {
  pending: 'À CONFIRMER',
  paid: 'PAYÉ',
  refunded: 'REMBOURSÉ',
  disputed: 'CONTESTÉ',
};

type Tab = 'orders' | 'payouts' | 'history';

export default function AdminPaymentsPage(): React.JSX.Element {
  const [tab, setTab] = useState<Tab>('orders');
  const [statusFilter, setStatusFilter] = useState<PaymentStatus | undefined>(undefined);
  const { data: paymentsData, isLoading } = useAdminPayments(statusFilter);
  const { data: kpis } = usePaymentKpis();
  const { data: pending } = usePayoutsPending();
  const triggerPayout = useTriggerPayout();
  const confirm = useConfirm();
  const toast = useToast();
  const payments = paymentsData?.payments ?? [];

  // KPIs du mois : sommes EXACTES côté API (Lot 9, GET /v1/payments/kpis).
  const encaisseFcfa = kpis?.encaisseFcfa ?? 0;
  const commissionFcfa = kpis?.commissionFcfa ?? 0;
  const fraisLogistiqueFcfa = kpis?.fraisLogistiqueFcfa ?? 0;
  const aReverserFcfa = pending?.totalAmountFcfa ?? 0;
  const producerCount = pending?.producerCount ?? 0;

  async function handleTrigger(producerUserId: string, producerName: string): Promise<void> {
    const ok = await confirm({
      title: 'Déclencher le reversement ?',
      message: `Reversement pour ${producerName}.`,
      confirmLabel: 'Déclencher',
      tone: 'neutral',
    });
    if (!ok) return;
    try {
      await triggerPayout.mutateAsync({ producerUserId });
      toast.success('Reversement déclenché.');
    } catch (err) {
      toast.error(`Échec : ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  async function handleBulkTrigger(): Promise<void> {
    if (!pending || pending.summaries.length === 0) {
      toast.info('Aucun reversement en attente.');
      return;
    }
    const ok = await confirm({
      title: 'Déclencher les reversements ?',
      message: `${pending.summaries.length} reversement(s) pour un total de ${pending.totalAmountFcfa.toLocaleString('fr-FR')} F.`,
      confirmLabel: 'Tout déclencher',
      tone: 'neutral',
    });
    if (!ok) return;
    let success = 0;
    let failed = 0;
    for (const s of pending.summaries) {
      try {
        await triggerPayout.mutateAsync({ producerUserId: s.producerUserId });
        success++;
      } catch {
        failed++;
      }
    }
    if (failed === 0) toast.success(`Reversements : ${success} OK.`);
    else toast.error(`Reversements : ${success} OK, ${failed} échec.`);
  }

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-5 lg:py-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap mb-5">
        <div>
          <h1 className="text-xl lg:text-2xl font-bold text-stone-900">
            Paiements &amp; reversements
          </h1>
          <p className="text-sm text-stone-500 mt-0.5">
            Traçabilité commande · client · producteur
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            className="px-3 py-2 bg-white border border-stone-200 rounded-lg text-xs font-semibold text-stone-700 flex items-center gap-1.5 disabled:opacity-50"
            disabled
            title="Export CSV : Lot 9"
          >
            <Icon name="arrow-right" className="w-3.5 h-3.5" /> Export
          </button>
          <button
            type="button"
            onClick={handleBulkTrigger}
            disabled={triggerPayout.isPending || !pending || pending.summaries.length === 0}
            className="px-3 py-2 bg-mata-700 hover:bg-mata-800 disabled:bg-stone-300 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5"
          >
            <Icon name="send" className="w-3.5 h-3.5" /> Reverser ({producerCount})
          </button>
        </div>
      </div>

      {/* KPI summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <KpiTile label="Encaissé mois" valueFcfa={encaisseFcfa} />
        <KpiTile label="Commission MATA" valueFcfa={commissionFcfa} />
        <KpiTile label="Frais logistique" valueFcfa={fraisLogistiqueFcfa} />
        <div className="bg-mata-700 rounded-lg p-3 shadow-soft text-white">
          <div className="text-[11px] uppercase tracking-wider text-mata-200 font-semibold">
            À reverser
          </div>
          <div className="text-lg font-bold tabular mt-1">
            {aReverserFcfa.toLocaleString('fr-FR')} F
          </div>
          <div className="text-[11px] text-mata-200">
            {producerCount} producteur{producerCount > 1 ? 's' : ''}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 mb-3 border-b border-stone-200 overflow-x-auto hide-scrollbar">
        <TabButton selected={tab === 'orders'} onClick={() => setTab('orders')}>
          Commandes
        </TabButton>
        <TabButton selected={tab === 'payouts'} onClick={() => setTab('payouts')}>
          Reversements · {producerCount}
        </TabButton>
        <TabButton selected={tab === 'history'} onClick={() => setTab('history')}>
          Historique
        </TabButton>
      </div>

      {/* Filtres status (uniquement tab orders) */}
      {tab === 'orders' && (
        <div className="flex items-center gap-2 mb-3 overflow-x-auto hide-scrollbar">
          <FilterChip selected={!statusFilter} onClick={() => setStatusFilter(undefined)}>
            Tous
          </FilterChip>
          {(['pending', 'paid', 'refunded', 'disputed'] as PaymentStatus[]).map((s) => (
            <FilterChip key={s} selected={statusFilter === s} onClick={() => setStatusFilter(s)}>
              {PAYMENT_STATUS_LABEL_FR[s]}
            </FilterChip>
          ))}
        </div>
      )}

      {/* Tab content */}
      {tab === 'orders' && (
        <PaymentsTable
          payments={payments}
          pendingSummaries={pending?.summaries ?? []}
          isLoading={isLoading}
        />
      )}
      {tab === 'payouts' && (
        <PayoutsTable
          summaries={pending?.summaries ?? []}
          onTrigger={handleTrigger}
          triggerPending={triggerPayout.isPending}
        />
      )}
      {tab === 'history' && (
        <p className="text-sm text-stone-500 py-12 text-center">
          Historique des reversements — page complète au Lot 9.
        </p>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Sous-composants

function KpiTile({ label, valueFcfa }: { label: string; valueFcfa: number }): React.JSX.Element {
  return (
    <div className="bg-white rounded-lg border border-stone-200 p-3 shadow-soft">
      <div className="text-[11px] uppercase tracking-wider text-stone-500 font-semibold">
        {label}
      </div>
      <div className="text-lg font-bold text-stone-900 tabular mt-1">
        {valueFcfa.toLocaleString('fr-FR')} F
      </div>
    </div>
  );
}

function TabButton({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`shrink-0 px-4 py-2 text-sm font-semibold ${
        selected
          ? 'text-stone-900 border-b-2 border-mata-700'
          : 'text-stone-500 hover:text-stone-900'
      }`}
    >
      {children}
    </button>
  );
}

function FilterChip({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold ${
        selected
          ? 'bg-stone-900 text-white'
          : 'bg-white border border-stone-200 text-stone-600 hover:text-stone-900'
      }`}
    >
      {children}
    </button>
  );
}

type PaymentsTableProps = {
  payments: ReturnType<typeof useAdminPayments>['data'] extends infer T
    ? T extends { payments: infer P }
      ? P extends Array<infer Item>
        ? Item[]
        : never
      : never
    : never;
  pendingSummaries: { producerUserId: string; producerDisplayName: string; amountFcfa: number }[];
  isLoading: boolean;
};

function PaymentsTable({
  payments,
  pendingSummaries,
  isLoading,
}: PaymentsTableProps): React.JSX.Element {
  if (isLoading) {
    return <p className="text-sm text-stone-500 py-8 text-center">Chargement…</p>;
  }
  if (payments.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-stone-200 shadow-soft p-8 text-center">
        <p className="text-sm text-stone-500">Aucun paiement dans ce filtre.</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-stone-200 shadow-soft overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[900px]">
          <thead className="bg-stone-50 border-b border-stone-200">
            <tr className="text-left text-xs uppercase tracking-wider text-stone-500 font-semibold">
              <th className="px-4 py-3">N° / Commande</th>
              <th className="px-3 py-3 text-right">Montant</th>
              <th className="px-3 py-3 text-center">Paiement</th>
              <th className="px-3 py-3 text-center">Méthode</th>
              <th className="px-3 py-3 text-right">Payé le</th>
              <th className="px-3 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {payments.map((p) => (
              <tr key={p.id} className="hover:bg-stone-50">
                <td className="px-4 py-3">
                  <div className="font-mono text-xs text-stone-500 tabular">#{p.orderNumber}</div>
                  <div className="font-semibold text-stone-900">Commande</div>
                </td>
                <td className="px-3 py-3 text-right font-bold text-stone-900 tabular">
                  <Money amount={p.amountFcfa} bold={false} />
                </td>
                <td className="px-3 py-3 text-center">
                  <StatusBadge tone={PAYMENT_TONE[p.status]}>
                    {PAYMENT_LABEL_FR_UC[p.status]}
                  </StatusBadge>
                </td>
                <td className="px-3 py-3 text-center text-stone-700 text-xs">
                  {p.paymentMethod ?? '—'}
                </td>
                <td className="px-3 py-3 text-right text-stone-500 text-xs tabular">
                  {p.paidAt ? new Date(p.paidAt).toLocaleDateString('fr-FR') : '—'}
                </td>
                <td className="px-3 py-3" />
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {pendingSummaries.length > 0 && (
        <div className="px-4 py-3 border-t border-stone-100 bg-stone-50 text-xs text-stone-600">
          {pendingSummaries.length} producteur(s) à reverser — passe à l'onglet « Reversements »
          pour déclencher.
        </div>
      )}
    </div>
  );
}

type PayoutsTableProps = {
  summaries: { producerUserId: string; producerDisplayName: string; amountFcfa: number }[];
  onTrigger: (producerUserId: string, producerName: string) => void;
  triggerPending: boolean;
};

function PayoutsTable({
  summaries,
  onTrigger,
  triggerPending,
}: PayoutsTableProps): React.JSX.Element {
  if (summaries.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-stone-200 shadow-soft p-8 text-center">
        <p className="text-sm text-stone-500">
          Aucun reversement en attente. Tous les producteurs sont à jour.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-stone-200 shadow-soft overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[600px]">
          <thead className="bg-stone-50 border-b border-stone-200">
            <tr className="text-left text-xs uppercase tracking-wider text-stone-500 font-semibold">
              <th className="px-4 py-3">Producteur</th>
              <th className="px-3 py-3 text-right">Part producteur</th>
              <th className="px-3 py-3 text-center">Reversement</th>
              <th className="px-3 py-3 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {summaries.map((s) => (
              <tr key={s.producerUserId} className="hover:bg-stone-50">
                <td className="px-4 py-3">
                  <div className="font-semibold text-stone-900">{s.producerDisplayName}</div>
                </td>
                <td className="px-3 py-3 text-right font-bold text-stone-900 tabular">
                  <Money amount={s.amountFcfa} bold={false} />
                </td>
                <td className="px-3 py-3 text-center">
                  <StatusBadge tone="warning">À PAYER</StatusBadge>
                </td>
                <td className="px-3 py-3 text-right">
                  <button
                    type="button"
                    onClick={() => onTrigger(s.producerUserId, s.producerDisplayName)}
                    disabled={triggerPending}
                    className="text-mata-700 font-semibold text-xs hover:text-mata-800 disabled:opacity-50"
                  >
                    Déclencher
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
