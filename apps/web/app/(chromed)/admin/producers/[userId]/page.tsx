'use client';

import { PRODUCER_STATUS_LABEL_FR, PRODUCER_TYPE_LABEL_FR } from '@mata/shared/constants';
import { Icon, StatusBadge, useConfirm, usePrompt, useToast } from '@mata/ui';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import {
  useAdminProducer,
  useBlacklistProducer,
  useRevealBankDetails,
  useSuspendProducer,
  useValidateProducer,
} from '../../../../../src/lib/api';

/**
 * Admin / Producer Detail · header + actions + (Lot 4+) offres/sites/docs.
 *
 * Reproduit la maquette `mockup/index.html` section ADMIN/PRODUCER-DETAIL.
 */
export default function AdminProducerDetailPage(): React.JSX.Element {
  const params = useParams<{ userId: string }>();
  const userId = params.userId;
  const { data: producer, isLoading } = useAdminProducer(userId);

  const validate = useValidateProducer();
  const suspend = useSuspendProducer();
  const blacklist = useBlacklistProducer();
  const reveal = useRevealBankDetails();
  const confirm = useConfirm();
  const prompt = usePrompt();
  const toast = useToast();
  const [revealed, setRevealed] = useState<null | {
    holder: string;
    iban: string;
    bic?: string;
    bankName: string;
  }>(null);

  if (isLoading) return <p className="px-4 py-8 text-sm text-stone-500">Chargement…</p>;
  if (!producer)
    return (
      <p className="px-4 py-8 text-sm text-mata-700">Producteur introuvable ou accès refusé.</p>
    );

  async function handleSuspend(): Promise<void> {
    const reason = await prompt({
      title: 'Suspendre le producteur',
      message: 'Raison de la suspension ?',
      confirmLabel: 'Suspendre',
    });
    if (!reason) return;
    await suspend.mutateAsync({ userId, reason });
  }

  async function handleBlacklist(): Promise<void> {
    const reason = await prompt({
      title: 'Blacklist (action TERMINALE)',
      message: 'Raison du blacklist ?',
      confirmLabel: 'Continuer',
    });
    if (!reason) return;
    const ok = await confirm({
      title: 'Confirmer le blacklist ?',
      message: 'Cette action est terminale et auditée.',
      confirmLabel: 'Blacklister',
    });
    if (!ok) return;
    await blacklist.mutateAsync({ userId, reason });
  }

  async function handleReveal(): Promise<void> {
    if (!producer?.hasBankDetails) {
      toast.info('Aucune coordonnée bancaire enregistrée.');
      return;
    }
    const ok = await confirm({
      title: 'Reveal des coordonnées bancaires',
      message: 'Action auditée. Continuer ?',
      confirmLabel: 'Reveal',
      tone: 'neutral',
    });
    if (!ok) return;
    const bd = await reveal.mutateAsync(userId);
    setRevealed(bd);
  }

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-5 lg:py-6 max-w-5xl mx-auto">
      <Link
        href="/admin/producers"
        className="text-sm text-stone-500 hover:text-mata-700 font-medium flex items-center gap-1 mb-3"
      >
        <Icon name="arrow-left" className="w-4 h-4" /> Producteurs
      </Link>

      <div className="bg-white rounded-2xl border border-stone-200 shadow-soft p-5 lg:p-6">
        <div className="flex items-start gap-4 flex-wrap">
          <div className="w-16 h-16 lg:w-20 lg:h-20 rounded-2xl bg-stone-200 flex items-center justify-center text-2xl lg:text-3xl font-extrabold text-stone-700 shrink-0">
            {producer.displayName.slice(0, 1).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl lg:text-2xl font-bold text-stone-900">
                {producer.displayName}
              </h1>
              <StatusBadge
                tone={
                  producer.status === 'validated'
                    ? 'success'
                    : producer.status === 'pending'
                      ? 'warning'
                      : producer.status === 'blacklisted'
                        ? 'danger'
                        : 'neutral'
                }
              >
                {PRODUCER_STATUS_LABEL_FR[producer.status]}
              </StatusBadge>
            </div>
            <div className="text-sm text-stone-500 mt-0.5">
              {PRODUCER_TYPE_LABEL_FR[producer.type]} · Inscrit le{' '}
              {new Date(producer.createdAt).toLocaleDateString('fr-FR')}
              {producer.validatedAt && (
                <span>
                  {' '}
                  · Validé le {new Date(producer.validatedAt).toLocaleDateString('fr-FR')}
                </span>
              )}
            </div>
            <div className="flex items-center gap-3 mt-2 text-xs text-stone-600 flex-wrap">
              {producer.phone && <span className="tabular-nums">{producer.phone}</span>}
              {producer.email && <span>· {producer.email}</span>}
              {producer.whatsappPhone && producer.whatsappPhone !== producer.phone && (
                <span>· WhatsApp {producer.whatsappPhone}</span>
              )}
            </div>
            {producer.bio && <p className="mt-2 text-sm text-stone-700">{producer.bio}</p>}
          </div>

          <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
            {producer.status === 'pending' && (
              <button
                type="button"
                onClick={() => validate.mutate(userId)}
                disabled={validate.isPending}
                className="px-4 py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-bold flex items-center justify-center gap-1.5 disabled:opacity-50"
              >
                <Icon name="check" className="w-4 h-4" /> Valider
              </button>
            )}
            {producer.status === 'validated' && (
              <button
                type="button"
                onClick={handleSuspend}
                disabled={suspend.isPending}
                className="px-4 py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-sm font-semibold flex items-center justify-center gap-1.5 disabled:opacity-50"
              >
                <Icon name="pause" className="w-4 h-4" /> Suspendre
              </button>
            )}
            {producer.status !== 'blacklisted' && (
              <button
                type="button"
                onClick={handleBlacklist}
                disabled={blacklist.isPending}
                className="px-4 py-2.5 bg-white border border-stone-200 hover:bg-stone-50 text-mata-700 rounded-lg text-sm font-semibold flex items-center justify-center gap-1.5 disabled:opacity-50"
              >
                <Icon name="x" className="w-4 h-4" /> Blacklist
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="mt-4 bg-white rounded-2xl border border-stone-200 shadow-soft p-5">
        <h3 className="font-bold text-stone-900 mb-3">Coordonnées bancaires</h3>
        {!producer.hasBankDetails && (
          <p className="text-sm text-stone-500">Aucune coordonnée bancaire enregistrée.</p>
        )}
        {producer.hasBankDetails && !revealed && (
          <button
            type="button"
            onClick={handleReveal}
            disabled={reveal.isPending}
            className="px-4 py-2 rounded-lg bg-stone-900 text-white text-sm font-semibold disabled:opacity-50"
          >
            <Icon name="package" className="w-4 h-4 inline mr-1" />
            Reveal (audité)
          </button>
        )}
        {revealed && (
          <div className="text-sm font-mono bg-stone-50 p-3 rounded-md border border-stone-200">
            <div>
              <strong>Bénéficiaire :</strong> {revealed.holder}
            </div>
            <div>
              <strong>IBAN :</strong> {revealed.iban}
            </div>
            {revealed.bic && (
              <div>
                <strong>BIC :</strong> {revealed.bic}
              </div>
            )}
            <div>
              <strong>Banque :</strong> {revealed.bankName}
            </div>
          </div>
        )}
      </div>

      <div className="mt-4 bg-white rounded-2xl border border-stone-200 shadow-soft p-5">
        <h3 className="font-bold text-stone-900 mb-3">Documents ({producer.documents.length})</h3>
        {producer.documents.length === 0 ? (
          <p className="text-sm text-stone-500">Aucun document fourni.</p>
        ) : (
          <ul className="text-sm text-stone-700 space-y-1">
            {producer.documents.map((d) => (
              <li key={d.publicId}>
                {d.type} — {d.publicId}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
