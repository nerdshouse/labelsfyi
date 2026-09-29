/**
 * GROQ queries. Kept as plain strings so they run unchanged against Sanity
 * and against the local demo dataset (groq-js).
 *
 * Relationship-heavy joins (ingredient → products, guide ↔ product…) are
 * resolved in TypeScript by the repository from a few bulk queries, rather
 * than with deeply nested GROQ. See docs/architecture.md → "Content graph".
 */

/** Only content that has passed the editorial workflow is ever rendered. */
export const IS_LIVE = `workflowStatus in ["PUBLISHED", "NEEDS_REVIEW"]`;

/**
 * Provenance gates. Factual records without provenance fail safe: they are
 * not rendered. Observations that came from ingested (external, possibly
 * machine-extracted) data also need a named human verifier.
 */
export const IS_VERIFIED_OBSERVATION = `defined(source) && verificationStatus == "verified" && (!defined(extractedFrom) || (defined(verifiedBy) && defined(verifiedAt)))`;
/** Claims render only when reviewed, sourced and their evidence research is complete. */
export const IS_PUBLISHABLE_CLAIM = `defined(reviewer) && defined(reviewedAt) && count(coalesce(sources, [])) > 0
  && researchStatus in ["EVIDENCE_IDENTIFIED", "INSUFFICIENT_EVIDENCE_IDENTIFIED"]`;
/** Discrepancies and brand responses are editorial statements: same gate as claims. */
export const IS_REVIEWED_STATEMENT = `defined(reviewer) && defined(reviewedAt)`;
export const HAS_PRICE_PROVENANCE = `(defined(source) || defined(sourceUrl))`;

const IMAGE = `{
  "url": asset->url,
  "alt": coalesce(alt, ""),
  "width": asset->metadata.dimensions.width,
  "height": asset->metadata.dimensions.height,
  "lqip": asset->metadata.lqip,
  "caption": caption,
  // Display basis (product images are gated on it in repository.ts).
  "provenance": coalesce(provenance.status, "UNKNOWN"),
  "permission": provenance.permission->{
    status, assetType, grantedAt, expiresAt, "scope": coalesce(scope, []), verifiedAt, "brand": brand._ref, "product": product._ref
  }
}`;

export const SOURCE = `{
  _id, title, publisher, url, doi, pmid, sourceType, publicationDate, accessedAt, authors, notes
}`;

const REVIEWER = `{
  _id, name, credentials, organization,
  "slug": profileSlug.current,
  "photo": photo${IMAGE},
  "isPlaceholder": coalesce(isPlaceholder, false)
}`;

const REVIEWS = `"reviews": *[_type == "editorialReview" && content._ref == ^._id && status == "approved"]
  | order(reviewedAt desc) {
    _id, "reviewer": reviewer->${REVIEWER}, reviewedAt, nextReviewAt, status, scope, notes
  }`;

const EDITORIAL_META = `
  workflowStatus,
  "isDemo": coalesce(isDemo, false),
  "noindex": coalesce(noindex, false),
  "seoTitle": seo.title,
  "seoDescription": seo.description,
  _createdAt, _updatedAt,
  ${REVIEWS}`;

const QUANTITY = `{ amount, unit }`;
const REF = `{ _id, name, "slug": slug.current }`;

const LABEL_INGREDIENT = `{
  _key,
  "ingredient": ingredient->${REF},
  displayName, amount, unit, amountPerServing, dailyValue, dailyValuePercent,
  "proprietaryBlend": coalesce(proprietaryBlend, false),
  blendName, orderOnLabel,
  "isKeyActive": coalesce(isKeyActive, false),
  observation,
  editorialNote,
  form, compoundAmount, compoundUnit, elementalAmount, elementalUnit, elementalBasis, sourceLocator
}`;

const LABEL_NUTRIENT = `{
  _key, name, nutrientKey, unit, perServing, per100, dailyValuePercent,
  "indent": coalesce(indent, 0)
}`;

const SERVING = `{ count, unit, mass, massUnit }`;

const PANEL = `{
  _id, panelType, title, sourceType,
  "serving": serving${SERVING},
  // Classification of the image this panel was transcribed from, if any.
  "imageEvidence": select(
    defined(sourceImage.imageKey) && defined(sourceImage.snapshot) => sourceImage.snapshot->images[_key == ^.sourceImage.imageKey][0]{
      "url": sourceUrl, imageKind, depictsExactProduct
    },
    // Submitted photos are private: only the classification is projected,
    // never the storage key or any submitter field.
    defined(sourceImage.imageKey) && defined(sourceImage.submission) => sourceImage.submission->images[_key == ^.sourceImage.imageKey][0]{
      "url": null, imageKind, depictsExactProduct
    },
    null
  ),
  servingSize${QUANTITY}, servingSizeText, servingsPerContainer, per100Basis,
  "nutrients": coalesce(nutrients[]${LABEL_NUTRIENT}, []),
  "ingredients": coalesce(ingredients[]${LABEL_INGREDIENT}, []),
  ingredientsText, text, capturedAt, capturedBy,
  "source": source->${SOURCE},
  "image": image${IMAGE},
  notes,
  "isCurrent": status == "current",
  // For the submission approval gate (repository.ts → gateSubmissionRecords).
  verifiedAt,
  "supersedes": coalesce(supersedes[]._ref, []),
  "fromSubmission": defined(sourceImage.submission)
}`;

const MERCHANT = `{ _id, name, "slug": slug.current, websiteUrl, "kind": coalesce(kind, "RETAILER"), "brand": brand._ref }`;

const PRICE = `{
  _id, "merchant": merchant->${MERCHANT}, price, mrp, currency, packSize${QUANTITY}, servings,
  capturedAt, "availability": coalesce(availability, "unknown"), notes, sourceUrl
}`;

const CATEGORY = `{ _id, name, "slug": slug.current, description }`;

const PRODUCT_CORE = `
  _id, name, "slug": slug.current, variant,
  "serving": serving${SERVING},
  "brand": brand->${REF},
  "category": category->${CATEGORY},
  format, vegStatus,
  servingSize${QUANTITY}, servingSizeText, servingsPerContainer,
  "image": labelImages[0]${IMAGE},
  lastVerifiedAt,
  "featured": coalesce(featured, false),
  "isDemo": coalesce(isDemo, false),
  "prices": *[_type == "priceSnapshot" && product._ref == ^._id && ${HAS_PRICE_PROVENANCE}]
    | order(capturedAt desc) ${PRICE}`;

export const PRODUCTS_QUERY = `*[_type == "product" && ${IS_LIVE} && defined(slug.current)] | order(name asc) {
  ${PRODUCT_CORE},
  subcategory, vegStatusReason, countryOfOrigin, manufacturer, description,
  "aliases": coalesce(aliases, []),
  "marketStatus": coalesce(marketStatus, "available"),
  discontinuedAt,
  "labelImages": coalesce(labelImages[]${IMAGE}, []),
  firstPublishedAt,
  ${EDITORIAL_META},
  // Label data renders only with a citation source (provenance).
  "panels": *[_type == "labelPanel" && product._ref == ^._id && defined(source)]
    | order(capturedAt desc) ${PANEL},
  // A claim renders only once it has a named reviewer and review date.
  "claims": *[_type == "claim" && product._ref == ^._id && ${IS_LIVE} && ${IS_PUBLISHABLE_CLAIM}]
      | order(order asc) {
    _id, exactClaim, claimType, locationOnProduct, assessment, assessmentStatus, explanation,
    "evidence": coalesce(evidence[]{
      _key, summary, "relevance": coalesce(relevance, "direct"), population, "source": source->${SOURCE}
    }, []),
    "sources": coalesce(sources[]->${SOURCE}, []),
    "reviewer": reviewer->${REVIEWER},
    reviewedAt, order, observedAt, researchStatus,
    "claimSource": { "sourceType": claimSourceType, "locator": claimSourceLocator },
    "status": coalesce(status, "current"),
    supersededAt
  },
  "observations": *[_type == "observation" && product._ref == ^._id && ${IS_VERIFIED_OBSERVATION}]
    | order(observedAt desc) {
    _id, type, value, observedAt, observedBy, "source": source->${SOURCE},
    "sourceImage": sourceImage${IMAGE}, notes, supersededAt, verifiedBy, verifiedAt,
    sourceType, sourceLocator, extractionMethod, verificationStatus,
    "fromSubmission": defined(submission),
    "snapshot": snapshot->{ url, fetchedAt }
  },
  "discrepancies": *[_type == "discrepancy" && product._ref == ^._id && ${IS_LIVE}
      && ${IS_REVIEWED_STATEMENT} && count(coalesce(values, [])) >= 2] | order(detectedAt desc) {
    _id, field, status, severity, detectedAt, notes, resolvedAt, resolutionNote,
    "values": values[]{
      _key, sourceType, value, locator, observedAt,
      "source": source->${SOURCE}, "snapshotUrl": snapshot->url
    },
    "brandResponses": *[_type == "brandResponse" && discrepancy._ref == ^._id && ${IS_LIVE}
        && ${IS_REVIEWED_STATEMENT}] | order(respondedAt desc) {
      _id, contactedAt, contactMethod, respondedAt, respondentRole, response, resolution,
      "supportingSources": coalesce(supportingSources[]->${SOURCE}, [])
    }
  },
  "offers": *[_type == "affiliateOffer" && product._ref == ^._id] {
    _id, "merchant": merchant->${MERCHANT}, destinationUrl, affiliateUrl,
    "active": coalesce(active, false),
    "disclosureRequired": coalesce(disclosureRequired, true),
    lastCheckedAt,
    "relationship": coalesce(relationship, "affiliate"),
    affiliateNetwork, trackingId
  }
}`;

export const INGREDIENTS_QUERY = `*[_type == "ingredient" && ${IS_LIVE} && defined(slug.current)] | order(name asc) {
  _id, name, "slug": slug.current, summary,
  "commonLabelNames": coalesce(commonLabelNames, []),
  "featured": coalesce(featured, false),
  overview, whyInSupplements, safety, buyingNotes,
  "forms": coalesce(forms[]{ _key, name, description }, []),
  "studiedDoses": coalesce(studiedDoses[]{
    _key, context, min, max, unit, frequency, duration, population, "source": source->${SOURCE}
  }, []),
  "findings": coalesce(findings[]{ _key, outcome, status, summary, "sources": coalesce(sources[]->${SOURCE}, []) }, []),
  "sources": coalesce(sources[]->${SOURCE}, []),
  ${EDITORIAL_META}
}`;

export const GUIDES_QUERY = `*[_type == "guide" && ${IS_LIVE} && defined(slug.current)] | order(publishedAt desc) {
  _id, title, "slug": slug.current, dek, publishedAt, body,
  "sources": coalesce(sources[]->${SOURCE}, []),
  "ingredientIds": coalesce(relatedIngredients[]._ref, []),
  "productIds": coalesce(relatedProducts[]._ref, []),
  ${EDITORIAL_META}
}`;

export const COMPARISONS_QUERY = `*[_type == "comparison" && ${IS_LIVE} && defined(slug.current)] | order(title asc) {
  _id, title, "slug": slug.current, dek, intro, methodology,
  "category": category->${CATEGORY},
  "productIds": coalesce(products[]._ref, []),
  "doseBasis": doseBasis{
    kind, "ingredient": ingredient->${REF}, nutrientKey, amount, unit, label
  },
  ${EDITORIAL_META}
}`;

export const BRANDS_QUERY = `*[_type == "brand" && ${IS_LIVE} && defined(slug.current)] | order(name asc) {
  _id, name, "slug": slug.current, description, websiteUrl, countryOfOrigin,
  "isDemo": coalesce(isDemo, false),
  "noindex": coalesce(noindex, false)
}`;

export const CATEGORIES_QUERY = `*[_type == "category" && defined(slug.current)] | order(name asc) {
  ${CATEGORY.slice(1, -1)},
  "isDemo": coalesce(isDemo, false)
}`;

export const REVIEWERS_QUERY = `*[_type == "reviewer" && defined(profileSlug.current)] | order(name asc) {
  ${REVIEWER.slice(1, -1)},
  bio,
  "isDemo": coalesce(isDemo, false)
}`;

// ─── Goals (Sprint 6) ─────────────────────────────────────────────────────

/**
 * Published goals. An ingredient counts as EDITORIALLY_REVIEWED only while its
 * linked evidence record (claim) is itself live and publishable; otherwise it
 * is shown as COMMONLY_FOUND (never implies efficacy).
 */
export const GOALS_QUERY = `*[_type == "goal" && ${IS_LIVE} && defined(slug.current)] | order(order asc, name asc) {
  _id, _updatedAt, name, "slug": slug.current, shortDescription, discoveryDescription,
  "order": coalesce(order, 100),
  "ingredients": coalesce(ingredients[]{
    name,
    "ingredient": ingredient->{ _id, name, "slug": slug.current },
    "matchNames": coalesce(matchNames, []),
    "relation": select(
      relation == "EDITORIALLY_REVIEWED"
        && count(*[_type == "claim" && _id == ^.evidence._ref && ${IS_LIVE} && ${IS_PUBLISHABLE_CLAIM}]) > 0
        => "EDITORIALLY_REVIEWED",
      "COMMONLY_FOUND"
    ),
    "evidence": evidence._ref
  }, []),
  "noindex": coalesce(noindex, false),
  "isDemo": coalesce(isDemo, false),
  ${REVIEWS}
}`;

/** Only approved, sourced relationships with a named reviewer. */
export const PRODUCT_GOALS_QUERY = `*[_type == "productGoal" && status == "APPROVED"
  && defined(reviewedBy) && defined(reviewedAt) && (defined(source) || defined(sourceUrl))] {
  _id, "product": product._ref, "goal": goal._ref, basis, statement, sourceUrl, sourceLocator,
  observedAt, "source": source->${SOURCE}, reviewedBy, reviewedAt
}`;
