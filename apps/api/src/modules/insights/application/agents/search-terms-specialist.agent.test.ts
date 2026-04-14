import assert from 'node:assert/strict';
import test from 'node:test';

import { SearchTermsSpecialistAgent } from './search-terms-specialist.agent';
import { SEARCH_TERMS_SPECIALIST_EXAMPLE_INPUTS } from './search-terms-specialist.examples';

test('SearchTermsSpecialistAgent flags waste terms and ignores valid exploration', async () => {
  const agent = new SearchTermsSpecialistAgent();
  const output = await agent.execute(
    structuredClone(SEARCH_TERMS_SPECIALIST_EXAMPLE_INPUTS.portfolio_mix),
  );

  const wasteFinding = output.findings.find(
    (finding) => finding.title === 'Termo com gasto relevante e sem conversao',
  );

  assert.ok(wasteFinding);
  assert.ok(
    wasteFinding.entity_label === 'curso gratis de trafego pago' ||
      wasteFinding.entity_label === 'manual google ads pdf' ||
      wasteFinding.entity_label === 'agencia google ads whatsapp',
  );

  const explorationWasSuppressed = output.findings.every(
    (finding) => finding.entity_label !== 'empresa gestao google ads',
  );
  assert.ok(explorationWasSuppressed);
});

test('SearchTermsSpecialistAgent detects irrelevant term and suggests negative review', async () => {
  const agent = new SearchTermsSpecialistAgent();
  const output = await agent.execute(
    structuredClone(SEARCH_TERMS_SPECIALIST_EXAMPLE_INPUTS.portfolio_mix),
  );

  const irrelevantFinding = output.findings.find(
    (finding) => finding.title === 'Termo com sinal de irrelevancia para a oferta',
  );

  assert.ok(irrelevantFinding);
  assert.equal(irrelevantFinding.recommended_action.action_type, 'review_search_terms');
  assert.ok(irrelevantFinding.evidence[0]?.note.includes('padroes semanticos'));
});

test('SearchTermsSpecialistAgent finds semantic opportunity', async () => {
  const agent = new SearchTermsSpecialistAgent();
  const output = await agent.execute(
    structuredClone(SEARCH_TERMS_SPECIALIST_EXAMPLE_INPUTS.portfolio_mix),
  );

  const opportunityFinding = output.findings.find(
    (finding) => finding.title === 'Termo com oportunidade de expansao semantica',
  );

  assert.ok(opportunityFinding);
  assert.equal(opportunityFinding.recommended_action.action_type, 'review_search_terms');
  assert.ok(opportunityFinding.confidence_score >= 0.6);
});

test('SearchTermsSpecialistAgent highlights concentration of waste', async () => {
  const agent = new SearchTermsSpecialistAgent();
  const output = await agent.execute(
    structuredClone(SEARCH_TERMS_SPECIALIST_EXAMPLE_INPUTS.portfolio_mix),
  );

  const concentrationFinding = output.findings.find(
    (finding) => finding.title === 'Desperdicio concentrado em poucos termos',
  );

  assert.ok(concentrationFinding);
  assert.equal(concentrationFinding.entity_type, 'account');
  assert.ok(concentrationFinding.priority_score >= 60);
});

test('SearchTermsSpecialistAgent returns insufficient_data when search terms are unavailable', async () => {
  const agent = new SearchTermsSpecialistAgent();
  const output = await agent.execute(
    structuredClone(SEARCH_TERMS_SPECIALIST_EXAMPLE_INPUTS.unavailable),
  );

  assert.equal(output.status, 'insufficient_data');
  assert.ok(output.data_quality.warnings.includes('search_terms_unavailable'));
});
