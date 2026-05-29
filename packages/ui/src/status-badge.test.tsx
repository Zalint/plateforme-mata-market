import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StatusBadge } from './status-badge.js';

describe('<StatusBadge />', () => {
  it('rend le label et applique les classes du tone', () => {
    render(<StatusBadge tone="success">Validée</StatusBadge>);
    const el = screen.getByText('Validée');
    expect(el.className).toContain('bg-green-100');
    expect(el.className).toContain('text-green-800');
  });

  it('expose un tone neutre par défaut visuel', () => {
    render(<StatusBadge tone="neutral">Brouillon</StatusBadge>);
    const el = screen.getByText('Brouillon');
    expect(el.className).toContain('bg-stone-200');
  });
});
