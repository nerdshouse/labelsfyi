import {
  IDENTITY_QUERY,
  identityRecords,
  intakeCandidate,
  SUBMISSIONS_DATA_SOURCE,
  suggestProducts,
} from './review';
import { newSubmissionId, objectKey, sha256Hex } from './keys';
import type { Doc, DocStore } from './store';
import type { ImageRole, LabelSubmission, SubmissionImage } from './types';
import { validateFields, validateImages, type IncomingImage } from './validate';

export interface ObjectPut {
  put(
    key: string,
    value: Uint8Array,
    opts: { httpMetadata: { contentType: string } },
  ): Promise<unknown>;
}

export type IntakeResult =
  { ok: true; id: string } | { ok: false; status: 400 | 413; errors: string[] };

/** Everything the public endpoint does, minus HTTP. Pure enough to test end to end. */
export async function receiveSubmission(
  form: FormData,
  deps: { store: DocStore; objects: ObjectPut; now?: Date },
): Promise<IntakeResult> {
  const now = deps.now ?? new Date();
  const fields = validateFields(
    Object.fromEntries([...form.entries()].filter(([, v]) => typeof v === 'string')),
  );
  const incoming: IncomingImage[] = [];
  for (const role of ['front', 'facts', 'additional'] as ImageRole[]) {
    for (const v of form.getAll(role)) {
      if (typeof v === 'string' || v.size === 0) continue;
      incoming.push({
        role,
        declaredName: v.name,
        declaredType: v.type,
        bytes: new Uint8Array(await v.arrayBuffer()),
      });
    }
  }
  const images = validateImages(incoming);
  const errors = [...(fields.ok ? [] : fields.errors), ...(images.ok ? [] : images.errors)];
  if (!fields.ok || !images.ok)
    return {
      ok: false,
      status: errors.some((e) => /larger than|too large/.test(e)) ? 413 : 400,
      errors,
    };

  const id = newSubmissionId();
  const stored: SubmissionImage[] = [];
  for (const [n, img] of images.images.entries()) {
    const storageKey = objectKey(id, n, img.contentType, now);
    await deps.objects.put(storageKey, img.bytes, {
      httpMetadata: { contentType: img.contentType },
    });
    stored.push({
      _key: `img${n}`,
      _type: 'submissionImage',
      storageKey,
      contentType: img.contentType,
      bytes: img.bytes.byteLength,
      sha256: await sha256Hex(img.bytes),
      role: img.role,
      imageKind: 'UNKNOWN',
      depictsExactProduct: 'UNCONFIRMED',
      depictsConfirmedBy: null,
      depictsConfirmedAt: null,
    });
  }
  const f = fields.fields;
  const submission: LabelSubmission = {
    _id: id,
    _type: 'labelSubmission',
    status: 'NEEDS_REVIEW',
    submittedAt: now.toISOString(),
    brand: f.brand,
    productName: f.productName,
    variant: f.variant,
    productUrl: f.productUrl,
    submitterName: f.submitterName,
    submitterContact: f.submitterContact,
    images: stored,
    ingestionCandidate: { _type: 'reference', _ref: `candidate.${id}` },
    product: null,
    updateOfProduct: f.updateOfProduct,
    rejectionReason: null,
    reviewedBy: null,
    reviewedAt: null,
    isDemo: false,
  };
  const matches = suggestProducts(
    submission,
    identityRecords(await deps.store.query(IDENTITY_QUERY)),
  );
  const ops: Array<{ create: Doc }> = [];
  if (!(await deps.store.get(SUBMISSIONS_DATA_SOURCE))) {
    ops.push({
      create: {
        _id: SUBMISSIONS_DATA_SOURCE,
        _type: 'dataSource',
        name: 'labels.fyi label submissions',
        domain: 'labels.fyi',
        sourceType: 'other',
        active: false,
        accessPolicy:
          'Photos submitted directly by people via labels.fyi/submit. Not fetched from any website.',
      },
    });
  }
  ops.push(
    { create: submission as unknown as Doc },
    { create: intakeCandidate(submission, matches) },
  );
  await deps.store.commit(ops);
  return { ok: true, id };
}
