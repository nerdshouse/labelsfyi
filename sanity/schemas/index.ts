import { brand, category, product } from './documents/catalogue';
import { affiliateOffer, merchant, priceSnapshot } from './documents/commerce';
import { comparison, guide } from './documents/content';
import { claim, source } from './documents/evidence';
import { labelPanel, observation } from './documents/label';
import { ingestionTypes } from './documents/ingestion';
import { editorialReview, ingredient, reviewer } from './documents/reference';
import { objectTypes } from './objects';

export const schemaTypes = [
  ...objectTypes,
  brand,
  category,
  product,
  ingredient,
  labelPanel,
  observation,
  claim,
  source,
  reviewer,
  editorialReview,
  merchant,
  priceSnapshot,
  affiliateOffer,
  guide,
  comparison,
  ...ingestionTypes,
];
