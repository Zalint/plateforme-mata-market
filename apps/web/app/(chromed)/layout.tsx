import { AppShell } from '../../src/components/app-shell';

type ChromedLayoutProps = {
  children: React.ReactNode;
};

export default function ChromedLayout({ children }: ChromedLayoutProps): React.JSX.Element {
  return <AppShell>{children}</AppShell>;
}
