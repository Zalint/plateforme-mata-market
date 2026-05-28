import { CATEGORY_EMOJI } from '@mata/shared/constants';

export default function HomePage(): React.JSX.Element {
  const categories = Object.entries(CATEGORY_EMOJI);

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-6 py-12">
      <div className="max-w-2xl w-full text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-mata-700 shadow-card">
          <span className="text-white font-extrabold text-xl tracking-tight">MA</span>
        </div>
        <h1 className="text-3xl sm:text-4xl font-extrabold text-stone-900 mt-5 tracking-tight">
          MATA · Du champ à l’assiette
        </h1>
        <p className="text-stone-600 mt-3">Plateforme PMV · Lot 0 OK</p>

        <div className="mt-8 inline-flex items-center gap-2 px-4 py-2 rounded-full bg-mata-50 border border-mata-200">
          <span className="w-2 h-2 rounded-full bg-mata-700" />
          <span className="text-sm font-semibold text-mata-800">
            Monorepo · Next 15 · Fastify · Prisma · Tailwind · Biome
          </span>
        </div>

        <div className="mt-10 grid grid-cols-3 sm:grid-cols-6 gap-2">
          {categories.map(([slug, emoji]) => (
            <div
              key={slug}
              className="aspect-square rounded-xl border border-stone-200 bg-white flex flex-col items-center justify-center gap-1 shadow-soft"
            >
              <span className="text-3xl" aria-hidden>
                {emoji}
              </span>
              <span className="text-[10px] font-semibold text-stone-600 uppercase tracking-wider">
                {slug}
              </span>
            </div>
          ))}
        </div>

        <p className="text-xs text-stone-500 mt-10">
          Maquette de référence dans <code className="font-mono">mockup/index.html</code>
        </p>
      </div>
    </main>
  );
}
