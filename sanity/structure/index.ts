import type { StructureBuilder, StructureResolver } from 'sanity/structure';

/** Everything that belongs to one product, with "new" pre-filled for that product. */
const related = (S: StructureBuilder, productId: string) =>
  (
    [
      ['labelPanel', 'Label panels', 'capturedAt'],
      ['claim', 'Claims', 'order'],
      ['observation', 'Observations', 'observedAt'],
      ['priceSnapshot', 'Price snapshots', 'capturedAt'],
      ['affiliateOffer', 'Retailer links', '_updatedAt'],
      ['discrepancy', 'Discrepancies', 'detectedAt'],
      ['brandResponse', 'Brand responses', 'contactedAt'],
    ] as const
  )
    .map(([type, title, orderField]) =>
      S.listItem()
        .title(title)
        .schemaType(type)
        .child(
          S.documentList()
            .title(title)
            .schemaType(type)
            .filter('_type == $type && product._ref == $id')
            .params({ type, id: productId })
            .defaultOrdering([
              { field: orderField, direction: orderField === 'order' ? 'asc' : 'desc' },
            ])
            .initialValueTemplates([
              S.initialValueTemplateItem(`${type}-for-product`, { productId }),
            ]),
        ),
    )
    .concat(
      S.listItem()
        .title('Editorial reviews')
        .schemaType('editorialReview')
        .child(
          S.documentList()
            .title('Editorial reviews')
            .schemaType('editorialReview')
            .filter('_type == "editorialReview" && content._ref == $id')
            .params({ id: productId })
            .initialValueTemplates([
              S.initialValueTemplateItem('editorialReview-for-content', { contentId: productId }),
            ]),
        ),
    );

/**
 * Desk structure organised around the editorial job, not the schema list:
 * a workflow queue first, then the catalogue, label evidence, claims,
 * commerce and editorial content.
 */
const queue = [
  ['DRAFT', 'Drafts'],
  ['FACT_CHECK', 'Awaiting fact check'],
  ['DIETITIAN_REVIEW', 'Awaiting dietitian review'],
  ['APPROVED', 'Approved, ready to publish'],
  ['NEEDS_REVIEW', 'Needs review'],
] as const;

export const structure: StructureResolver = (S) =>
  S.list()
    .title('labels.fyi')
    .items([
      S.listItem()
        .title('Editorial queue')
        .child(
          S.list()
            .title('Editorial queue')
            .items(
              queue.map(([status, title]) =>
                S.listItem()
                  .title(title)
                  .child(
                    S.documentList()
                      .title(title)
                      .filter('_type in $types && workflowStatus == $status')
                      .params({
                        status,
                        types: [
                          'product',
                          'ingredient',
                          'claim',
                          'guide',
                          'comparison',
                          'brand',
                          'discrepancy',
                          'brandResponse',
                        ],
                      }),
                  ),
              ),
            ),
        ),
      S.divider(),
      S.listItem()
        .title('Products')
        .schemaType('product')
        .child(
          S.documentTypeList('product')
            .title('Products')
            .defaultOrdering([{ field: '_updatedAt', direction: 'desc' }])
            .child((productId) =>
              S.list()
                .title('Product')
                .items([
                  S.listItem()
                    .title('Product details')
                    .child(S.document().schemaType('product').documentId(productId)),
                  ...related(S, productId),
                ]),
            ),
        ),
      S.documentTypeListItem('brand').title('Brands'),
      S.documentTypeListItem('category').title('Categories'),
      S.documentTypeListItem('ingredient').title('Ingredients'),
      S.divider(),
      S.listItem()
        .title('Label evidence')
        .child(
          S.list()
            .title('Label evidence')
            .items([
              S.documentTypeListItem('labelPanel').title('Label panels'),
              S.listItem()
                .title('Current label panels')
                .child(
                  S.documentList()
                    .title('Current')
                    .filter('_type == "labelPanel" && status == "current"'),
                ),
              S.documentTypeListItem('observation').title('Observations'),
            ]),
        ),
      S.listItem()
        .title('Claims & sources')
        .child(
          S.list()
            .title('Claims & sources')
            .items([
              S.documentTypeListItem('claim').title('Claims'),
              S.documentTypeListItem('source').title('Sources'),
            ]),
        ),
      S.listItem()
        .title('Prices & retailers')
        .child(
          S.list()
            .title('Prices & retailers')
            .items([
              S.documentTypeListItem('priceSnapshot').title('Price snapshots'),
              S.documentTypeListItem('affiliateOffer').title('Affiliate offers'),
              S.documentTypeListItem('merchant').title('Merchants'),
            ]),
        ),
      S.divider(),
      S.documentTypeListItem('guide').title('Guides'),
      S.documentTypeListItem('comparison').title('Comparisons'),
      S.divider(),
      S.listItem()
        .title('Discrepancies & brand responses')
        .child(
          S.list()
            .title('Discrepancies & brand responses')
            .items([
              S.listItem()
                .title('Open discrepancies')
                .child(
                  S.documentList()
                    .title('Open')
                    .schemaType('discrepancy')
                    .filter(
                      '_type == "discrepancy" && status in ["OPEN", "AWAITING_BRAND", "BRAND_RESPONDED", "UNRESOLVED"]',
                    ),
                ),
              S.documentTypeListItem('discrepancy').title('All discrepancies'),
              S.documentTypeListItem('brandResponse').title('Brand responses'),
            ]),
        ),
      S.listItem()
        .title('Goals & commerce')
        .child(
          S.list()
            .title('Goals & commerce')
            .items([
              S.documentTypeListItem('goal').title('Goals'),
              S.listItem()
                .title('Goal assignments to review')
                .child(
                  S.documentList()
                    .title('Candidate product ↔ goal (review at /internal/goals)')
                    .schemaType('productGoal')
                    .filter('_type == "productGoal" && status == "CANDIDATE"'),
                ),
              S.documentTypeListItem('productGoal').title('All product ↔ goal'),
              S.divider(),
              S.documentTypeListItem('assetPermission').title('Asset permissions'),
              S.documentTypeListItem('merchant').title('Merchants'),
            ]),
        ),
      S.listItem()
        .title('Ingestion (not published)')
        .child(
          S.list()
            .title('Ingestion')
            .items([
              S.listItem()
                .title('Label submissions')
                .child(
                  S.documentList()
                    .title('Label submissions (review at /internal/review)')
                    .schemaType('labelSubmission')
                    .filter('_type == "labelSubmission"')
                    .defaultOrdering([{ field: 'submittedAt', direction: 'desc' }]),
                ),
              S.listItem()
                .title('Candidates needing verification')
                .child(
                  S.documentList()
                    .title('Needs verification')
                    .schemaType('ingestionCandidate')
                    .filter(
                      '_type == "ingestionCandidate" && status in ["needs_verification", "in_review"]',
                    )
                    .defaultOrdering([{ field: 'extractedAt', direction: 'desc' }]),
                ),
              S.listItem()
                .title('Possible product matches')
                .child(
                  S.documentList()
                    .title('Possible matches')
                    .schemaType('ingestionCandidate')
                    .filter('_type == "ingestionCandidate" && matchStatus == "possible_match"'),
                ),
              S.documentTypeListItem('ingestionCandidate').title('All candidates'),
              S.divider(),
              S.documentTypeListItem('sourceSnapshot').title('Source snapshots'),
              S.documentTypeListItem('productReference').title('External product references'),
              S.documentTypeListItem('ingestionRun').title('Ingestion runs'),
              S.documentTypeListItem('dataSource').title('Data sources'),
            ]),
        ),
      S.divider(),
      S.documentTypeListItem('reviewer').title('Reviewers'),
      S.documentTypeListItem('editorialReview').title('Editorial reviews'),
    ]);
