import type { ActiveInput, FactReviewInput, FactStatus, MatchDecision } from './review';
import type { SubmissionImage } from './types';

/** Parse review form posts into planner inputs. All values are treated as untrusted strings. */

const str = (fd: FormData, k: string) => {
  const v = fd.get(k);
  return typeof v === 'string' ? v.trim() : '';
};
const num = (fd: FormData, k: string): number | null => {
  const v = str(fd, k);
  if (v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
};
const status = (fd: FormData, k: string): FactStatus => {
  const v = str(fd, k);
  return v === 'VERIFIED' || v === 'MISSING' || v === 'UNCLEAR' ? v : 'UNCLEAR';
};
const orNull = (v: string) => (v === '' ? null : v);

export function parseDecision(fd: FormData): {
  decision: MatchDecision;
  gtin: { raw: string | null; notObserved: boolean };
  reviewer: string;
} {
  const action = str(fd, 'action');
  const gtin = { raw: orNull(str(fd, 'gtin')), notObserved: str(fd, 'gtinNotObserved') === 'on' };
  const reviewer = str(fd, 'reviewer');
  if (action === 'reject')
    return { decision: { action: 'reject', reason: str(fd, 'reason') }, gtin, reviewer };
  if (action === 'accept')
    return { decision: { action: 'accept', productId: str(fd, 'productId') }, gtin, reviewer };
  return {
    decision: {
      action: 'create',
      product: {
        name: str(fd, 'name'),
        variant: orNull(str(fd, 'variant')),
        brandId: orNull(str(fd, 'brandId')),
        newBrandName: orNull(str(fd, 'newBrandName')),
        categoryId: str(fd, 'categoryId'),
        format: str(fd, 'format'),
      },
    },
    gtin,
    reviewer,
  };
}

export function parseFactReview(fd: FormData, imageKeys: string[]): FactReviewInput {
  const kinds = ['PACK_PHOTO', 'PRINT_ARTWORK', 'MARKETING_GRAPHIC', 'RETYPESET_TABLE', 'UNKNOWN'];
  const depicts = ['CONFIRMED', 'UNCONFIRMED', 'NOT_THIS_PRODUCT'];
  const actives: ActiveInput[] = [];
  for (let n = 0; n < 8; n++) {
    const name = str(fd, `active_${n}_name`);
    if (!name) continue;
    actives.push({
      displayName: name,
      ingredientId: orNull(str(fd, `active_${n}_ingredient`)),
      form: orNull(str(fd, `active_${n}_form`)),
      compound: {
        status: status(fd, `active_${n}_compound_status`),
        amount: num(fd, `active_${n}_compound_amount`),
        unit: orNull(str(fd, `active_${n}_compound_unit`)),
      },
      elemental: {
        status: status(fd, `active_${n}_elemental_status`),
        amount: num(fd, `active_${n}_elemental_amount`),
        unit: orNull(str(fd, `active_${n}_elemental_unit`)),
        basis: str(fd, `active_${n}_elemental_status`) === 'VERIFIED' ? 'label_declared' : null,
      },
      locator: orNull(str(fd, `active_${n}_locator`)),
      notes: orNull(str(fd, `active_${n}_notes`)),
    });
  }
  const optional = (k: string) => {
    const v = str(fd, k);
    return v === 'VERIFIED' || v === 'MISSING' || v === 'UNCLEAR' ? v : 'NOT_REVIEWED';
  };
  const veg = str(fd, 'veg_value');
  return {
    reviewer: str(fd, 'reviewer'),
    images: imageKeys.map((key) => ({
      key,
      imageKind: (kinds.includes(str(fd, `img_${key}_kind`))
        ? str(fd, `img_${key}_kind`)
        : 'UNKNOWN') as SubmissionImage['imageKind'],
      depictsExactProduct: (depicts.includes(str(fd, `img_${key}_depicts`))
        ? str(fd, `img_${key}_depicts`)
        : 'UNCONFIRMED') as SubmissionImage['depictsExactProduct'],
    })),
    factsImageKey: str(fd, 'factsImageKey'),
    labelVersion: str(fd, 'labelVersion') === 'new' ? 'new' : 'unchanged',
    serving: {
      status: status(fd, 'serving_status'),
      count: num(fd, 'serving_count'),
      unit: orNull(str(fd, 'serving_unit')),
      mass: num(fd, 'serving_mass'),
      massUnit: orNull(str(fd, 'serving_massUnit')),
    },
    servingsPerContainer: {
      status: status(fd, 'servings_status'),
      value: num(fd, 'servings_value'),
    },
    frontOfPack: { status: optional('front_status'), text: orNull(str(fd, 'front_text')) },
    vegMark: {
      status: optional('veg_status'),
      value: veg === 'VEGETARIAN' || veg === 'NON_VEGETARIAN' || veg === 'VEGAN' ? veg : null,
    },
    actives,
  };
}
