# Prices, merchants & buy links

**Commerce never outranks trust.** Links go out. Prices are dated observations. No merchant,
offer or availability is invented.

## Prices (`priceSnapshot`)

`merchant`, `currency`, `price`, `mrp`, `capturedAt` (observed at), `source` and/or `sourceUrl`,
`packSize`, `servings`. Snapshots are append-only.

- The UI always shows the observation date ("₹479 · Amazon.in, observed 27 Sept 2026"). A price
  is never presented as current.
- Price per serving uses the existing calculation (`referencePrice`, `productCosts`). With no
  observation the UI says "No price observed".

## Merchants (`merchant`)

`kind`: `OFFICIAL_STORE` (with the owning `brand`), `MARKETPLACE`, `QUICK_COMMERCE`, `PHARMACY`,
`RETAILER`.

## Buy links (`affiliateOffer`)

Existing type, extended: `product`, `merchant`, `destinationUrl` (the normal product URL),
`affiliateUrl`, `affiliateNetwork`, `trackingId`, `relationship` (`none` / `affiliate` /
`sponsored`), `active`, `lastCheckedAt`.

- Label: "Buy from brand ↗" only when the merchant is the brand's own official store; otherwise
  "Buy at {merchant} ↗". Never "our partner" unless a real partnership exists.
- The outbound href is the affiliate URL when one exists (`rel="sponsored nofollow noopener"`,
  marked "affiliate link", with the site's disclosure). Otherwise it is the destination URL
  (`rel="nofollow noopener"`).
- Offers not checked in 45 days are hidden (`usableOffers`).
- Affiliate parameters never reach a canonical or source URL: product identity and `sourceUrl`
  stay separate from outbound links (checked in `pnpm test:dist`).
- Only merchants with an actual offer record are shown.

## Consumer surfaces (Sprint 7)

- Cards show one buy link (official store first) with "(affiliate)" where applicable. The page
  shows "Some purchase links may be affiliate links." exactly when a rendered link is an
  affiliate link (checked in `pnpm test:dist`).
- The product page links "Where to buy" from the top. The full merchant list shows the price at
  each merchant and its observation date.
- Buy clicks are tracked as `buy_click` (product slug, merchant, affiliate flag; no personal data).
- Affiliate status never affects facts, verification, match level or sort order (no sort uses it).
