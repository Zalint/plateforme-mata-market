import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { OfferCard } from './offer-card.js';

describe('OfferCard', () => {
  it('rend titre, badge statut, qté + unité plurielle et site', () => {
    render(
      <OfferCard
        category="poultry"
        status="validated"
        title="Poulet entier"
        unit="unit"
        quantity={500}
        priceFcfa={3000}
        siteName="Poulailler Pout 1"
      />,
    );
    expect(screen.getByText('Poulet entier')).toBeTruthy();
    expect(screen.getByText('Validée')).toBeTruthy();
    expect(screen.getByText('500')).toBeTruthy();
    expect(screen.getByText('unités')).toBeTruthy();
    expect(screen.getByText('Poulailler Pout 1')).toBeTruthy();
  });

  it('affiche le bandeau "en attente de validation MATA" si pending=true', () => {
    render(
      <OfferCard
        category="eggs"
        status="pending"
        title="Œufs frais"
        unit="tray"
        quantity={40}
        priceFcfa={2500}
        siteName="Pout 1"
        pending
      />,
    );
    expect(screen.getByText(/En attente de validation MATA/)).toBeTruthy();
  });

  it('affiche la raison de refus si rejectionReason', () => {
    render(
      <OfferCard
        category="cattle"
        status="rejected"
        title="Bovin"
        unit="head"
        quantity={2}
        priceFcfa={420_000}
        siteName="Dahra"
        rejectionReason="Prix trop élevé pour le marché"
      />,
    );
    expect(screen.getByText(/Prix trop élevé pour le marché/)).toBeTruthy();
  });
});
