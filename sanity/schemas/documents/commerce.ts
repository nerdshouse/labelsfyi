import { defineField, defineType } from 'sanity';
import { lockedAfterWindow } from '../../lib/validation';

export const merchant = defineType({
  name: 'merchant',
  title: 'Merchant',
  type: 'document',
  fields: [
    defineField({ name: 'name', type: 'string', validation: (r) => r.required() }),
    defineField({
      name: 'slug',
      type: 'slug',
      options: { source: 'name' },
      validation: (r) => r.required(),
    }),
    defineField({ name: 'websiteUrl', type: 'url' }),
  ],
});

export const priceSnapshot = defineType({
  name: 'priceSnapshot',
  title: 'Price snapshot',
  type: 'document',
  description:
    'A dated price observation from one merchant. Append-only: never edit an old snapshot to "update" a price; add a new one. Needs a citation source or a listing URL.',
  fields: [
    defineField({
      readOnly: lockedAfterWindow,
      name: 'product',
      type: 'reference',
      to: [{ type: 'product' }],
      validation: (r) => r.required(),
    }),
    defineField({
      readOnly: lockedAfterWindow,
      name: 'merchant',
      type: 'reference',
      to: [{ type: 'merchant' }],
      validation: (r) => r.required(),
    }),
    defineField({
      readOnly: lockedAfterWindow,
      name: 'price',
      type: 'number',
      validation: (r) => r.required().positive(),
    }),
    defineField({
      readOnly: lockedAfterWindow,
      name: 'currency',
      type: 'string',
      options: { list: ['INR', 'USD'] },
      initialValue: 'INR',
      validation: (r) => r.required(),
    }),
    defineField({
      readOnly: lockedAfterWindow,
      name: 'packSize',
      type: 'quantity',
      validation: (r) => r.required(),
    }),
    defineField({
      readOnly: lockedAfterWindow,
      name: 'servings',
      type: 'number',
      description: 'Servings in this pack, if printed.',
    }),
    defineField({
      readOnly: lockedAfterWindow,
      name: 'availability',
      type: 'string',
      options: { list: ['in_stock', 'out_of_stock', 'unknown'], layout: 'radio' },
      initialValue: 'in_stock',
    }),
    defineField({
      readOnly: lockedAfterWindow,
      name: 'capturedAt',
      type: 'datetime',
      validation: (r) => r.required(),
    }),
    defineField({
      readOnly: lockedAfterWindow,
      name: 'mrp',
      title: 'MRP',
      type: 'number',
      description:
        'Maximum retail price shown on the listing/pack, if any. Separate from the selling price.',
      validation: (r) => r.positive(),
    }),
    defineField({
      readOnly: lockedAfterWindow,
      name: 'sourceUrl',
      title: 'Listing URL',
      type: 'url',
      description: 'The page the price was observed on.',
    }),
    defineField({
      readOnly: lockedAfterWindow,
      name: 'snapshot',
      type: 'reference',
      to: [{ type: 'sourceSnapshot' }],
    }),
    defineField({
      readOnly: lockedAfterWindow,
      name: 'listing',
      title: 'External product reference',
      type: 'reference',
      to: [{ type: 'productReference' }],
    }),
    defineField({ name: 'source', type: 'reference', to: [{ type: 'source' }] }),
    defineField({ name: 'notes', type: 'text', rows: 2 }),
    defineField({ name: 'isDemo', type: 'boolean', initialValue: false }),
  ],
  validation: (r) =>
    r.custom((doc) => {
      const d = doc as { source?: unknown; sourceUrl?: string } | undefined;
      return d && !d.source && !d.sourceUrl
        ? 'Record where this price was observed (source or listing URL).'
        : true;
    }),
  preview: {
    select: {
      product: 'product.name',
      merchant: 'merchant.name',
      price: 'price',
      date: 'capturedAt',
    },
    prepare: ({ product, merchant, price, date }) => ({
      title: `₹${price} · ${merchant ?? '—'}`,
      subtitle: `${product ?? '—'} · ${date?.slice(0, 10) ?? ''}`,
    }),
  },
});

export const affiliateOffer = defineType({
  name: 'affiliateOffer',
  title: 'Affiliate offer',
  type: 'document',
  description: 'Outbound retail links live only here, never inside editorial text.',
  fields: [
    defineField({
      name: 'product',
      type: 'reference',
      to: [{ type: 'product' }],
      validation: (r) => r.required(),
    }),
    defineField({
      name: 'merchant',
      type: 'reference',
      to: [{ type: 'merchant' }],
      validation: (r) => r.required(),
    }),
    defineField({ name: 'destinationUrl', type: 'url', validation: (r) => r.required() }),
    defineField({ name: 'affiliateUrl', type: 'url' }),
    defineField({
      name: 'relationship',
      type: 'string',
      options: { list: ['affiliate', 'sponsored', 'none'], layout: 'radio' },
      initialValue: 'affiliate',
      validation: (r) => r.required(),
    }),
    defineField({ name: 'active', type: 'boolean', initialValue: true }),
    defineField({ name: 'disclosureRequired', type: 'boolean', initialValue: true }),
    defineField({
      name: 'lastCheckedAt',
      type: 'datetime',
      description: 'Links not checked in 45 days are hidden on the site.',
      validation: (r) => r.required(),
    }),
    defineField({ name: 'isDemo', type: 'boolean', initialValue: false }),
  ],
  preview: {
    select: { product: 'product.name', merchant: 'merchant.name', active: 'active' },
    prepare: ({ product, merchant, active }) => ({
      title: `${merchant ?? '—'} → ${product ?? '—'}`,
      subtitle: active ? 'Active' : 'Inactive',
    }),
  },
});
