import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { formatFcfa, Money } from './money.js';

describe('formatFcfa', () => {
  it('formate un montant entier avec espaces fines', () => {
    expect(formatFcfa(22500)).toBe('22 500 F');
    expect(formatFcfa(0)).toBe('0 F');
    expect(formatFcfa(1)).toBe('1 F');
  });

  it('tronque les décimales (jamais de centimes)', () => {
    expect(formatFcfa(22500.99)).toBe('22 500 F');
    expect(formatFcfa(22500.49)).toBe('22 500 F');
  });

  it('gère les grands nombres', () => {
    expect(formatFcfa(3_100_000)).toBe('3 100 000 F');
  });

  it('renvoie un placeholder pour les valeurs invalides', () => {
    expect(formatFcfa(Number.NaN)).toBe('— F');
    expect(formatFcfa(Number.POSITIVE_INFINITY)).toBe('— F');
  });
});

describe('<Money />', () => {
  it('rend le montant formaté en FCFA', () => {
    render(<Money amount={22500} />);
    expect(screen.getByText('22 500 F')).toBeDefined();
  });
});
