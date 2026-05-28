type ChromelessLayoutProps = {
  children: React.ReactNode;
};

/**
 * Layout sans chrome (sidebar / topbar) — utilisé pour auth, welcome, guest.
 * Référence : ARCHITECTURE.md §8 « Chromeless ».
 */
export default function ChromelessLayout({ children }: ChromelessLayoutProps): React.JSX.Element {
  return <div className="min-h-screen bg-stone-25">{children}</div>;
}
