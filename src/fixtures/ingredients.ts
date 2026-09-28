import type { RawDoc } from './helpers.ts';
import { key, keyedRef, published, pt, ref, slug } from './helpers.ts';

/**
 * Ingredient reference pages (demo).
 *
 * The copy here is deliberately conservative and restricted to what the cited
 * sources summarise. It is marked as demo content and must go through fact
 * check and dietitian review before launch.
 */

const finding = (outcome: string, status: string, summary: string, sourceIds: string[]) => ({
  _key: key(),
  _type: 'evidenceFinding',
  outcome,
  status,
  summary,
  sources: sourceIds.map(keyedRef),
});

const dose = (d: {
  context: string;
  min: number | null;
  max: number | null;
  unit: string;
  frequency?: string;
  duration?: string;
  population?: string;
  source: string;
}) => ({
  _key: key(),
  _type: 'studiedDose',
  context: d.context,
  min: d.min,
  max: d.max,
  unit: d.unit,
  frequency: d.frequency ?? null,
  duration: d.duration ?? null,
  population: d.population ?? null,
  source: ref(d.source),
});

const form = (name: string, description: string) => ({
  _key: key(),
  _type: 'ingredientForm',
  name,
  description,
});

export const ingredients: RawDoc[] = [
  {
    _id: 'ingredient.creatine-monohydrate',
    _type: 'ingredient',
    name: 'Creatine monohydrate',
    slug: slug('creatine-monohydrate'),
    featured: true,
    summary:
      'A compound stored in muscle that helps regenerate energy during short, intense efforts. The most-studied form of creatine.',
    commonLabelNames: ['Creatine monohydrate', 'Micronised creatine', 'Creatine (as monohydrate)'],
    overview: pt(
      'Creatine is made in the body and is also obtained from meat and fish. In muscle it is stored mostly as phosphocreatine, which helps regenerate ATP, the immediate energy source for short, high-intensity efforts.',
      'People who eat little or no meat tend to have lower muscle creatine stores, which is relevant for many Indian consumers who follow vegetarian diets.',
    ),
    whyInSupplements: pt(
      'Creatine monohydrate is used to increase muscle creatine stores. It is one of the most researched sports supplements, mainly for repeated high-intensity exercise and resistance training.',
    ),
    forms: [
      form(
        'Creatine monohydrate',
        'The form used in most research. Typically about 88% creatine by weight.',
      ),
      form(
        'Micronised creatine monohydrate',
        'Creatine monohydrate milled to a smaller particle size so it mixes more easily. Chemically the same compound.',
      ),
      form(
        'Other salts and "advanced" forms',
        'Hydrochloride, ethyl ester, buffered and other forms are marketed as superior. The cited position stand does not find consistent evidence that they outperform monohydrate.',
      ),
    ],
    studiedDoses: [
      dose({
        context: 'Loading phase',
        min: 20,
        max: 20,
        unit: 'g',
        frequency: 'per day, split into ~4 doses',
        duration: '5–7 days',
        population: 'Adults (≈0.3 g/kg/day)',
        source: 'source.issn-creatine-2017',
      }),
      dose({
        context: 'Maintenance / daily use',
        min: 3,
        max: 5,
        unit: 'g',
        frequency: 'per day',
        duration: 'Ongoing',
        population: 'Adults',
        source: 'source.issn-creatine-2017',
      }),
    ],
    findings: [
      finding(
        'Muscle creatine stores',
        'supported',
        'Supplementation increases muscle creatine and phosphocreatine content.',
        ['source.issn-creatine-2017'],
      ),
      finding(
        'Repeated high-intensity exercise performance',
        'supported',
        'Consistent improvements in high-intensity, intermittent exercise capacity and training adaptations when combined with training.',
        ['source.issn-creatine-2017'],
      ),
      finding(
        'Superiority of non-monohydrate forms',
        'insufficient_evidence',
        'Claims that newer forms work better than monohydrate are not consistently supported.',
        ['source.issn-creatine-2017'],
      ),
    ],
    safety: pt(
      'The cited position stand reports that creatine monohydrate, at the doses studied, has been well tolerated by healthy people in short- and long-term research. Some people gain water weight in the first weeks.',
      'People with kidney disease, and anyone who is pregnant, breastfeeding or taking regular medication, should speak to a doctor before starting any supplement.',
    ),
    buyingNotes: pt(
      '- Check the **amount of creatine per serving**, not the scoop weight. Flavoured products often contain less creatine per scoop.',
      '- Compare products on **cost per 5 g of creatine**, not price per tub.',
      '- Capsules usually need several capsules to reach 3–5 g, and the shell may be gelatin (non-vegetarian).',
      '- "Micronised" affects mixability, not effectiveness.',
    ),
    sources: [keyedRef('source.issn-creatine-2017')],
    ...published('2026-03-01', '2026-09-10'),
  },
  {
    _id: 'ingredient.whey-protein',
    _type: 'ingredient',
    name: 'Whey protein',
    slug: slug('whey-protein'),
    featured: true,
    summary:
      'A milk-derived protein, sold as concentrate, isolate or hydrolysate, and the base of most protein powders.',
    commonLabelNames: [
      'Whey protein concentrate',
      'Whey protein isolate',
      'Hydrolysed whey protein',
      'WPC',
      'WPI',
    ],
    overview: pt(
      'Whey is the liquid portion of milk separated during cheese and paneer making. Filtered and dried, it becomes whey protein powder. Because it is milk-derived it is vegetarian but not vegan.',
    ),
    whyInSupplements: pt(
      'Whey protein is a convenient way to add protein to the diet. It is rich in essential amino acids, including leucine.',
    ),
    forms: [
      form(
        'Concentrate (WPC)',
        'Protein content varies widely by product; retains more lactose and fat than isolate.',
      ),
      form('Isolate (WPI)', 'Further filtered for higher protein and lower lactose content.'),
      form(
        'Hydrolysate',
        'Partially broken down protein. Usually more expensive; often more bitter.',
      ),
      form(
        'Blends',
        'Mixtures of concentrate, isolate and sometimes other proteins. Labels may not disclose the proportions.',
      ),
    ],
    studiedDoses: [
      dose({
        context: 'Total daily protein, exercising adults',
        min: 1.4,
        max: 2.0,
        unit: 'g',
        frequency: 'per kg body weight per day (all sources)',
        population: 'Exercising adults',
        source: 'source.issn-protein-2017',
      }),
      dose({
        context: 'Protein per meal or serving',
        min: 20,
        max: 40,
        unit: 'g',
        frequency: 'per dose',
        population: 'Exercising adults',
        source: 'source.issn-protein-2017',
      }),
    ],
    findings: [
      finding(
        'Muscle gain with resistance training',
        'requires_context',
        'Adequate total protein intake supports gains in muscle when combined with resistance training. Supplements are one way to reach intake targets; they are not required if the diet already provides enough.',
        ['source.issn-protein-2017'],
      ),
    ],
    safety: pt(
      'Whey contains milk proteins and, depending on the form, lactose. People with a milk allergy should avoid it. Anyone with kidney disease should seek medical advice about protein intake.',
    ),
    buyingNotes: pt(
      '- Look at **protein per serving and per 100 g** on the nutrition panel. Scoop sizes differ between brands.',
      '- A "blend" may not disclose how much is isolate vs concentrate.',
      '- Check sugars and the sweetener listed in the ingredients.',
      '- Compare on **cost per 25 g of protein**, not cost per kg of powder.',
    ),
    sources: [keyedRef('source.issn-protein-2017')],
    ...published('2026-03-01', '2026-09-10'),
  },
  {
    _id: 'ingredient.ashwagandha',
    _type: 'ingredient',
    name: 'Ashwagandha',
    slug: slug('ashwagandha'),
    featured: true,
    summary:
      'Withania somnifera, a plant used in Ayurveda. Sold as root or root-and-leaf extracts, often standardised to withanolides.',
    commonLabelNames: [
      'Ashwagandha',
      'Withania somnifera',
      'Ashwagandha root extract',
      'KSM-66®',
      'Sensoril®',
    ],
    overview: pt(
      'Ashwagandha (Withania somnifera) is an evergreen shrub used in Ayurvedic practice. Supplements usually contain extracts of the root, or root and leaf, and many are standardised to a stated percentage of withanolides.',
    ),
    whyInSupplements: pt(
      'Ashwagandha is marketed mainly for stress and sleep. Branded extracts differ in plant part, extraction method and standardisation, which makes products hard to compare.',
    ),
    forms: [
      form('Root powder', 'Dried, powdered root. Not standardised.'),
      form(
        'Standardised root extract',
        'Extract with a declared withanolide percentage. Several branded extracts exist.',
      ),
      form('Root and leaf extract', 'Some branded extracts include leaf as well as root.'),
    ],
    studiedDoses: [
      dose({
        context: 'Extracts in clinical trials',
        min: 250,
        max: 600,
        unit: 'mg',
        frequency: 'per day',
        duration: 'Typically up to about 3 months',
        population: 'Adults',
        source: 'source.ods-ashwagandha',
      }),
    ],
    findings: [
      finding(
        'Stress and anxiety',
        'insufficient_evidence',
        'Some small, short trials report benefits, but studies vary in extract, dose and quality; the evidence is limited.',
        ['source.ods-ashwagandha'],
      ),
      finding(
        'Sleep',
        'insufficient_evidence',
        'Limited evidence from small trials; findings are not yet conclusive.',
        ['source.ods-ashwagandha'],
      ),
    ],
    safety: pt(
      'The cited fact sheet reports that short-term use in trials was generally well tolerated, that rare cases of liver injury have been reported with ashwagandha products, and that it should be avoided during pregnancy. It notes possible interactions with some medications, including those for thyroid conditions, diabetes and blood pressure. Speak to a doctor first.',
    ),
    buyingNotes: pt(
      '- Check the **plant part** (root vs root and leaf) and the **extract amount in mg**.',
      '- A withanolide percentage only means something alongside the extract amount.',
      '- Branded extracts are not interchangeable; studies on one do not automatically apply to another.',
    ),
    sources: [keyedRef('source.ods-ashwagandha')],
    ...published('2026-03-01', '2026-09-10'),
  },
  {
    _id: 'ingredient.vitamin-d3',
    _type: 'ingredient',
    name: 'Vitamin D3',
    slug: slug('vitamin-d3'),
    featured: true,
    summary:
      'Cholecalciferol, the form of vitamin D made in skin exposed to sunlight. Needed for calcium absorption.',
    commonLabelNames: ['Vitamin D3', 'Cholecalciferol', 'Vitamin D (as cholecalciferol)'],
    overview: pt(
      'Vitamin D helps the body absorb calcium and is needed for bone health. D3 (cholecalciferol) is most commonly sourced from lanolin (sheep wool) or fish oil; vegan D3 from lichen also exists. Supplement labels in India express amounts in IU, mcg or both (1 mcg = 40 IU).',
    ),
    whyInSupplements: pt(
      'Used to correct or prevent low vitamin D status, which depends heavily on sun exposure, skin pigmentation, clothing and diet.',
    ),
    forms: [
      form('Vitamin D3 (cholecalciferol)', 'Animal-derived (lanolin, fish oil) or lichen-derived.'),
      form('Vitamin D2 (ergocalciferol)', 'Plant or fungal origin.'),
    ],
    studiedDoses: [
      dose({
        context: 'Recommended Dietary Allowance (US), adults 19–70',
        min: 600,
        max: 600,
        unit: 'IU',
        frequency: 'per day (15 mcg)',
        population: 'Adults 19–70',
        source: 'source.ods-vitamin-d',
      }),
      dose({
        context: 'Tolerable Upper Intake Level (US), adults',
        min: null,
        max: 4000,
        unit: 'IU',
        frequency: 'per day (100 mcg)',
        population: 'Adults',
        source: 'source.ods-vitamin-d',
      }),
    ],
    findings: [
      finding(
        'Bone health',
        'requires_context',
        'Vitamin D is required for bone health; benefit from supplements depends on a person’s baseline vitamin D status and calcium intake.',
        ['source.ods-vitamin-d'],
      ),
    ],
    safety: pt(
      'Very high intakes over time can cause excess calcium in the blood. Long-term intake above the upper limit should only happen under medical supervision. Blood tests are the only way to know your vitamin D status.',
    ),
    buyingNotes: pt(
      '- Check whether the amount is in **IU or mcg** (1 mcg = 40 IU).',
      '- Softgels are often gelatin; look for the veg mark if that matters to you.',
      '- D3 is usually animal-derived even in "vegetarian" capsules; vegan products specify lichen.',
    ),
    sources: [keyedRef('source.ods-vitamin-d')],
    ...published('2026-03-01', '2026-09-10'),
  },
  {
    _id: 'ingredient.omega-3',
    _type: 'ingredient',
    name: 'Omega-3 (EPA & DHA)',
    slug: slug('omega-3'),
    summary:
      'Long-chain fatty acids found in fish oil and algal oil. Labels should disclose EPA and DHA amounts, not just "fish oil".',
    commonLabelNames: ['Fish oil', 'EPA', 'DHA', 'Omega-3 fatty acids', 'Algal oil'],
    overview: pt(
      'Omega-3 supplements usually contain EPA and DHA from fish oil, krill oil or algae. ALA, the plant omega-3 in flaxseed, is a different fatty acid.',
    ),
    whyInSupplements: pt(
      'Used by people who eat little oily fish. Research focuses on heart and eye health, with mixed findings depending on the outcome and population.',
    ),
    forms: [
      form('Fish oil (triglyceride / ethyl ester)', 'Most common. Non-vegetarian.'),
      form('Algal oil', 'A vegetarian source of DHA and sometimes EPA.'),
      form('Krill oil', 'Non-vegetarian; typically lower EPA+DHA per capsule.'),
    ],
    studiedDoses: [],
    findings: [
      finding(
        'Established intake recommendations for EPA/DHA',
        'insufficient_evidence',
        'No RDA has been established for EPA and DHA; an Adequate Intake exists only for ALA.',
        ['source.ods-omega-3'],
      ),
    ],
    safety: pt(
      'Omega-3 supplements may interact with blood-thinning medication. Speak to a doctor if you take any regular medication.',
    ),
    buyingNotes: pt(
      '- "1000 mg fish oil" is not "1000 mg omega-3". Look for **EPA + DHA per serving**.',
      '- Fish oil and most capsule shells are non-vegetarian; algal oil in a vegetarian shell is the vegetarian option.',
    ),
    sources: [keyedRef('source.ods-omega-3')],
    ...published('2026-03-01', '2026-09-10'),
  },
  {
    _id: 'ingredient.magnesium',
    _type: 'ingredient',
    name: 'Magnesium',
    slug: slug('magnesium'),
    summary:
      'An essential mineral. Supplement labels list the compound (e.g. glycinate, citrate, oxide); what matters is the elemental magnesium it provides.',
    commonLabelNames: [
      'Magnesium glycinate',
      'Magnesium bisglycinate',
      'Magnesium citrate',
      'Magnesium oxide',
      'Elemental magnesium',
    ],
    overview: pt(
      'Magnesium is involved in hundreds of enzyme reactions, including muscle and nerve function. It is found in nuts, seeds, legumes, whole grains and green leafy vegetables.',
    ),
    whyInSupplements: pt(
      'Used to top up dietary intake. Products differ mainly in the magnesium compound and how much elemental magnesium each serving provides.',
    ),
    forms: [
      form('Magnesium oxide', 'High elemental magnesium by weight; commonly used in tablets.'),
      form('Magnesium citrate', 'A common, soluble form.'),
      form('Magnesium glycinate / bisglycinate', 'Magnesium bound to glycine.'),
    ],
    studiedDoses: [
      dose({
        context: 'Upper limit from supplements (US), adults',
        min: null,
        max: 350,
        unit: 'mg',
        frequency: 'per day, from supplements and medication',
        population: 'Adults',
        source: 'source.ods-magnesium',
      }),
    ],
    findings: [],
    safety: pt(
      'High doses from supplements commonly cause diarrhoea. People with kidney disease should not take magnesium supplements without medical advice.',
    ),
    buyingNotes: pt(
      '- Check whether the label states **elemental magnesium** or only the compound weight.',
      '- "500 mg magnesium glycinate" provides much less than 500 mg of magnesium.',
    ),
    sources: [keyedRef('source.ods-magnesium')],
    ...published('2026-03-01', '2026-09-10'),
  },
];
