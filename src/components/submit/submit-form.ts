/**
 * Label submission form. Validates locally (the server re-validates
 * everything, including the real file type from its bytes), then posts to
 * /api/submissions. Without JavaScript the form posts directly and the server
 * redirects to /submit/received.
 */
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const MAX_IMAGES = 6;
const TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const EXTENSIONS = /\.(jpe?g|png|webp)$/i;

export const SUCCESS_COPY =
  'Label received. It hasn’t been published yet. Our team will review the submitted label before anything appears on labels.fyi.';

export interface SubmissionInput {
  front: File | null;
  facts: File | null;
  additional: File[];
  productName: string;
  brand: string;
  productUrl: string;
  rights: boolean;
}

/** Pure validation, shared with tests. Returns human-readable problems. */
export function validateSubmission(s: SubmissionInput): string[] {
  const errors: string[] = [];
  if (!s.front) errors.push('Add a photo of the front of the pack.');
  if (!s.facts) errors.push('Add a photo of the facts/composition panel.');
  const files = [s.front, s.facts, ...s.additional].filter(Boolean) as File[];
  if (files.length > MAX_IMAGES) errors.push(`Add at most ${MAX_IMAGES} photos in total.`);
  for (const f of files) {
    if (!TYPES.includes(f.type) || !EXTENSIONS.test(f.name))
      errors.push(`${f.name} must be a JPEG, PNG or WebP photo.`);
    else if (f.size > MAX_IMAGE_BYTES) errors.push(`${f.name} is larger than 10 MB.`);
  }
  if (!s.productName.trim()) errors.push('Enter the product name.');
  if (!s.brand.trim()) errors.push('Enter the brand.');
  if (s.productUrl.trim()) {
    try {
      const u = new URL(s.productUrl.trim());
      if (!/^https?:$/.test(u.protocol))
        errors.push('Product URL must start with http:// or https://.');
    } catch {
      errors.push('Product URL is not a valid link.');
    }
  }
  if (!s.rights) errors.push('Confirm you can share these photos.');
  return errors;
}

const SERVER_ERRORS: Record<string, string> = {
  '400': 'Some details were missing or not accepted. Check the photos and fields and try again.',
  '403': 'The submission could not be verified. Reload the page and try again.',
  '413': 'The photos are too large. Each photo must be under 10 MB.',
  '415': 'The submission could not be read. Reload the page and try again.',
  '429': 'Too many submissions from this connection. Wait a minute and try again.',
  '503': 'Submissions are not open yet.',
};

export function initSubmitForm() {
  const form = document.querySelector<HTMLFormElement>('[data-submit-form]');
  if (!form) return;
  const errorsEl = document.querySelector<HTMLElement>('[data-submit-errors]')!;
  const done = document.querySelector<HTMLElement>('[data-submit-done]')!;
  const button = form.querySelector<HTMLButtonElement>('button[type="submit"]')!;
  const showErrors = (errors: string[]) => {
    errorsEl.replaceChildren(
      ...errors.map((m) => Object.assign(document.createElement('p'), { textContent: m })),
    );
    errorsEl.classList.toggle('hidden', errors.length === 0);
  };

  // Prefill for "Submit an updated label" links and show no-JS server errors.
  const params = new URL(location.href).searchParams;
  const setIf = (name: string, value: string | null, pattern?: RegExp) => {
    const el = form.elements.namedItem(name) as HTMLInputElement | null;
    if (el && value && value.length <= 200 && (!pattern || pattern.test(value))) el.value = value;
  };
  setIf('updateOfProduct', params.get('product'), /^[a-z0-9-]+$/);
  setIf('brand', params.get('brand'));
  setIf('productName', params.get('name'));
  setIf('variant', params.get('variant'));
  if (params.get('product'))
    document.querySelector('[data-update-note]')?.removeAttribute('hidden');
  const err = params.get('error');
  if (err) showErrors([SERVER_ERRORS[err] ?? SERVER_ERRORS['400']!]);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const file = (name: string) => {
      const f = fd.get(name);
      return f instanceof File && f.size > 0 ? f : null;
    };
    const additional = fd
      .getAll('additional')
      .filter((f): f is File => f instanceof File && f.size > 0);
    const errors = validateSubmission({
      front: file('front'),
      facts: file('facts'),
      additional,
      productName: String(fd.get('productName') ?? ''),
      brand: String(fd.get('brand') ?? ''),
      productUrl: String(fd.get('productUrl') ?? ''),
      rights: fd.get('rights') === 'on',
    });
    if (errors.length) return showErrors(errors);
    showErrors([]);
    // Empty file inputs still post an empty part; drop them.
    if (!additional.length) fd.delete('additional');

    button.disabled = true;
    button.textContent = 'Sending…';
    try {
      const res = await fetch(form.action, {
        method: 'POST',
        body: fd,
        headers: { Accept: 'application/json' },
        credentials: 'same-origin',
      });
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; errors?: string[] };
      if (res.ok && body.ok) {
        form.reset();
        form.hidden = true;
        done.hidden = false;
        done.focus();
        return;
      }
      showErrors(
        body.errors?.length
          ? body.errors
          : [SERVER_ERRORS[String(res.status)] ?? SERVER_ERRORS['400']!],
      );
    } catch {
      showErrors(['The submission could not be sent. Check your connection and try again.']);
    } finally {
      button.disabled = false;
      button.textContent = 'Submit label';
    }
  });
}
