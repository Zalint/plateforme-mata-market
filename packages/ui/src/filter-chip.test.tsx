import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { FilterChip } from './filter-chip.js';

describe('FilterChip', () => {
  it('rend le texte et applique le style "selected"', () => {
    render(<FilterChip selected>Toutes · 6</FilterChip>);
    const btn = screen.getByRole('button', { name: 'Toutes · 6' });
    expect(btn.className).toContain('bg-stone-900');
  });

  it('applique le style non-selected par défaut', () => {
    render(<FilterChip>Validées · 3</FilterChip>);
    const btn = screen.getByRole('button', { name: 'Validées · 3' });
    expect(btn.className).toContain('bg-white');
  });

  it('appelle onClick quand cliqué', () => {
    const onClick = vi.fn();
    render(<FilterChip onClick={onClick}>Filtre</FilterChip>);
    screen.getByRole('button', { name: 'Filtre' }).click();
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
