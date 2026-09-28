import type { AffiliateOfferData } from '@/lib/content/types';

export const AFFILIATE_DISCLOSURE =
  'Some links on this page are affiliate links. We may earn a commission if you purchase through them. This never affects how we assess a product.';

/** Offer links older than this are treated as unchecked and hidden. */
export const OFFER_STALE_AFTER_DAYS = 45;

export function isCommercial(offer: AffiliateOfferData): boolean {
  return offer.relationship !== 'none' || Boolean(offer.affiliateUrl);
}

/** The outbound href for an offer: the affiliate link when one exists. */
export function offerHref(offer: AffiliateOfferData): string {
  return offer.affiliateUrl ?? offer.destinationUrl;
}

/** rel attribute per Google's guidance for paid/affiliate links. */
export function offerRel(offer: AffiliateOfferData): string {
  return isCommercial(offer) ? 'sponsored nofollow noopener' : 'nofollow noopener';
}

export function usableOffers(
  offers: AffiliateOfferData[],
  now: Date = new Date(),
): AffiliateOfferData[] {
  return offers.filter((o) => {
    if (!o.active) return false;
    if (!o.lastCheckedAt) return false;
    const age = (now.getTime() - new Date(o.lastCheckedAt).getTime()) / 86_400_000;
    return age <= OFFER_STALE_AFTER_DAYS;
  });
}

export function needsDisclosure(offers: AffiliateOfferData[]): boolean {
  return offers.some((o) => o.disclosureRequired || isCommercial(o));
}
