import { visionTool } from '@sanity/vision';
import { defineConfig } from 'sanity';
import { structureTool } from 'sanity/structure';
import { resolveDocumentActions } from './actions/workflow';
import { schemaTypes } from './schemas';
import { structure } from './structure';
import { templates } from './structure/templates';

const projectId = process.env.SANITY_STUDIO_PROJECT_ID;
const dataset = process.env.SANITY_STUDIO_DATASET ?? 'production';

if (!projectId) {
  throw new Error('Set SANITY_STUDIO_PROJECT_ID in sanity/.env (see sanity/.env.example).');
}

export default defineConfig({
  name: 'labels-fyi',
  title: 'labels.fyi',
  projectId,
  dataset,
  plugins: [structureTool({ structure }), visionTool({ defaultApiVersion: '2025-02-19' })],
  schema: { types: schemaTypes, templates },
  document: { actions: resolveDocumentActions },
});
