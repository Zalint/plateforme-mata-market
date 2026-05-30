'use client';

import {
  PRODUCER_STATUS_LABEL_FR,
  PRODUCER_STATUSES,
  PRODUCER_TYPE_LABEL_FR,
  type ProducerStatus,
} from '@mata/shared/constants';
import { FilterChip, Icon, StatusBadge } from '@mata/ui';
import Link from 'next/link';
import { useState } from 'react';
import { useAdminProducers, useValidateProducer } from '../../../../src/lib/api';

/**
 * Admin / Producteurs · liste paginée avec queue de validation.
 *
 * Reproduit la maquette `mockup/index.html` section ADMIN/PRODUCERS.
 */

const TONE: Record<ProducerStatus, 'success' | 'warning' | 'neutral' | 'danger'> = {
  pending: 'warning',
  validated: 'success',
  suspended: 'neutral',
  blacklisted: 'danger',
};

export default function AdminProducersPage(): React.JSX.Element {
  const [status, setStatus] = useState<ProducerStatus>('pending');
  const { data, isLoading } = useAdminProducers({ page: 1, limit: 50, status });
  const validate = useValidateProducer();

  const producers = data?.producers ?? [];

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-5 lg:py-6">
      <div className="flex items-center justify-between gap-3 flex-wrap mb-5">
        <div>
          <h1 className="text-xl lg:text-2xl font-bold text-stone-900">Producteurs</h1>
          <p className="text-sm text-stone-500 mt-0.5">
            {data?.meta.total ?? 0} producteur{(data?.meta.total ?? 0) > 1 ? 's' : ''}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 mb-4 overflow-x-auto hide-scrollbar">
        {PRODUCER_STATUSES.map((s) => (
          <FilterChip key={s} selected={status === s} onClick={() => setStatus(s)}>
            {PRODUCER_STATUS_LABEL_FR[s]}
          </FilterChip>
        ))}
      </div>

      {isLoading && <p className="text-sm text-stone-500">Chargement…</p>}
      {!isLoading && producers.length === 0 && (
        <p className="text-sm text-stone-500 py-8 text-center">Aucun producteur dans ce filtre.</p>
      )}

      <div className="space-y-2">
        {producers.map((p) => (
          <div
            key={p.userId}
            className="bg-white rounded-xl border border-stone-200 p-3 shadow-soft"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-stone-200 flex items-center justify-center font-bold text-stone-700">
                {p.displayName.slice(0, 1).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <Link
                    href={`/admin/producers/${p.userId}`}
                    className="font-bold text-stone-900 hover:text-mata-700"
                  >
                    {p.displayName}
                  </Link>
                  <StatusBadge tone={TONE[p.status]}>
                    {PRODUCER_STATUS_LABEL_FR[p.status]}
                  </StatusBadge>
                </div>
                <div className="text-xs text-stone-500">
                  {PRODUCER_TYPE_LABEL_FR[p.type]} · Inscrit le{' '}
                  {new Date(p.createdAt).toLocaleDateString('fr-FR')}
                  {p.phone && ` · ${p.phone}`}
                </div>
              </div>
              {p.status === 'pending' && (
                <button
                  type="button"
                  onClick={() => validate.mutate(p.userId)}
                  disabled={validate.isPending}
                  className="px-3 py-2 rounded-lg bg-green-600 hover:bg-green-700 text-white text-xs font-bold flex items-center gap-1 disabled:opacity-50"
                >
                  <Icon name="check" className="w-3 h-3" /> Valider
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
