'use client';

import { Icon, useToast } from '@mata/ui';
import { useRouter } from 'next/navigation';
import { useGenerateTeleconsultCode, useMyAssistanceSession } from '../../../../src/lib/api';

/**
 * Producer / Aide · WF3-1 du mockup (workflows/teleconseil/1).
 *
 * Le producteur a un probleme (modif stock, etc.). Il appelle MATA au
 * +221 33 800 00 00, puis clique "Me faire aider" → genere un code 6 chiffres
 * → redirect /producer/help/code qui affiche le code a lire au telephone.
 */

const SUPPORT_PHONE = '+221 33 800 00 00';

export default function ProducerHelpPage(): React.JSX.Element {
  const router = useRouter();
  const generate = useGenerateTeleconsultCode();
  const { data: activeAssist } = useMyAssistanceSession();
  const toast = useToast();

  async function handleGenerate(): Promise<void> {
    try {
      const result = await generate.mutateAsync();
      // Passe le code en query string. Affiche UNE FOIS sur la page suivante.
      // Note : le code reste dans l'URL — acceptable car le code expire
      // 15 min + usage unique + jamais loggue serveur.
      router.push(
        `/producer/help/code?code=${encodeURIComponent(result.code)}&expiresAt=${encodeURIComponent(result.expiresAt)}`,
      );
    } catch (err) {
      toast.error(`Erreur generation code : ${err instanceof Error ? err.message : 'inconnue'}`);
    }
  }

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-5 lg:py-8 max-w-md mx-auto">
      <div className="bg-white rounded-2xl border border-stone-200 shadow-card overflow-hidden">
        <div className="px-5 py-3 bg-mata-50 border-b border-mata-200 flex items-center gap-2">
          <Icon name="smartphone" className="w-4 h-4 text-mata-700" />
          <span className="text-xs font-bold text-stone-900 uppercase tracking-wider">
            Cote producteur
          </span>
        </div>

        <div className="p-6">
          <div className="rounded-2xl border-2 border-dashed border-mata-300 bg-mata-50 p-5">
            <div className="flex items-start gap-3">
              <div className="w-12 h-12 rounded-full bg-mata-700 flex items-center justify-center shrink-0">
                <Icon name="headphones" className="w-5 h-5 text-white" />
              </div>
              <div className="flex-1">
                <div className="font-bold text-stone-900">Besoin d&apos;aide ?</div>
                <div className="text-xs text-stone-600 mt-1">
                  Appelez MATA au{' '}
                  <span className="font-bold text-stone-900 tabular">{SUPPORT_PHONE}</span> puis
                  generez un code a lire au conseiller.
                </div>
              </div>
            </div>
            {activeAssist ? (
              <div className="mt-4 rounded-xl border-2 border-mata-200 bg-mata-50 p-3 text-sm text-stone-900 flex items-start gap-2">
                <Icon name="shield-check" className="w-4 h-4 mt-0.5 shrink-0 text-mata-700" />
                <span>
                  Un conseiller MATA vous assiste déjà (session{' '}
                  <strong>{activeAssist.sessionNumber}</strong>). Pas besoin d&apos;un nouveau code
                  — vous gardez le contrôle et pouvez l&apos;interrompre à tout moment.
                </span>
              </div>
            ) : (
              <button
                type="button"
                onClick={handleGenerate}
                disabled={generate.isPending}
                className="mt-4 w-full py-3 rounded-xl bg-mata-700 hover:bg-mata-800 disabled:bg-stone-300 text-white font-bold flex items-center justify-center gap-2 shadow-soft"
              >
                <Icon name="key-round" className="w-4 h-4" />
                {generate.isPending ? 'Generation…' : 'Me faire aider par MATA'}
              </button>
            )}
            {generate.isError && (
              <div className="mt-3 text-xs text-red-700 p-2 bg-red-50 rounded-lg border border-red-200">
                {generate.error.message}
              </div>
            )}
          </div>

          <div className="mt-5 grid grid-cols-2 gap-3 text-xs text-stone-600">
            <div className="p-3 rounded-xl bg-stone-50 border border-stone-100 flex items-start gap-2">
              <Icon name="shield-check" className="w-3.5 h-3.5 text-mata-700 mt-0.5 shrink-0" />
              <span>
                Le conseiller n&apos;aura acces a votre compte que si vous lui donnez un code
              </span>
            </div>
            <div className="p-3 rounded-xl bg-stone-50 border border-stone-100 flex items-start gap-2">
              <Icon name="clock" className="w-3.5 h-3.5 text-mata-700 mt-0.5 shrink-0" />
              <span>Session limitee a 15 minutes, vous gardez le controle</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
