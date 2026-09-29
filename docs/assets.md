# Images & asset permissions

**Every public product image needs an identifiable basis. Without one, the site renders a neutral
typographic product tile. That is intentional, not a broken image.**

## Image provenance (`imageWithAlt.provenance`)

| Status                                                                | Displayed?                                                                                                                         |
| --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `EDITORIAL_LABEL_PHOTO`: a photo labels.fyi took of a pack it holds   | Yes                                                                                                                                |
| `AUTHORIZED` + a linked `assetPermission`                             | Yes, while the permission is `AUTHORIZED`, covers this product (or is brand-wide), is for an image asset type, and has not expired |
| `USER_SUBMITTED`                                                      | **No.** Submitted photos stay private (Sprint 4 rule). The submission consent covers review, not publication.                      |
| `NOT_REQUESTED`, `UNKNOWN`, `RESTRICTED`, `REVOKED`, or no provenance | No                                                                                                                                 |

Enforced in `src/lib/editorial/assets.ts` (`isDisplayableProductImage`), applied during graph
assembly, so no page or JSON can ship a non-displayable image. `pnpm test:dist` fails if the demo
unauthorized image appears anywhere.

## Asset permissions (`assetPermission`)

`brand`, optional `product` (empty means brand-wide), `assetType` (`PRODUCT_IMAGE`, `PACK_IMAGE`,
`LABEL_IMAGE`, `BRAND_LOGO`, `PRODUCT_COPY`), `status` (`NOT_REQUESTED` → `REQUESTED` →
`AUTHORIZED` / `RESTRICTED` / `REVOKED`), `grantedAt`, `expiresAt`, and internal fields
(`evidence`: where the written permission is filed; `contact`; `notes`). Internal fields are never
queried by the site.

To authorize a brand (for example Briyo, which is just another brand entity):

1. File the written permission and create an `assetPermission` (AUTHORIZED, grantedAt, evidence).
2. Upload the brand-supplied image to the product's `labelImages` with provenance `AUTHORIZED`
   linked to that permission.
3. Revoking or expiring the permission removes the image on the next build.

## Rules

- Never download third-party images or logos to make cards prettier. Research imports keep image
  **URLs only**, as `UNCONFIRMED`, `NOT_REQUESTED` references.
- Never copy brand marketing graphics.
- Logos: none are shown. The permission model supports `BRAND_LOGO` for the future.
