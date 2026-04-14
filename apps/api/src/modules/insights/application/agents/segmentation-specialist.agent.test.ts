import assert from 'node:assert/strict';
import test from 'node:test';

import { SegmentationSpecialistAgent } from './segmentation-specialist.agent';
import { SEGMENTATION_SPECIALIST_EXAMPLE_INPUTS } from './segmentation-specialist.examples';

test('SegmentationSpecialistAgent flags wasted schedule window', async () => {
  const agent = new SegmentationSpecialistAgent();
  const output = await agent.execute(
    structuredClone(SEGMENTATION_SPECIALIST_EXAMPLE_INPUTS.portfolio_mix),
  );

  assert.equal(output.status, 'ready');

  const wasteFinding = output.findings.find(
    (finding) => finding.title === 'Faixa horaria com desperdicio acima do esperado',
  );

  assert.ok(wasteFinding);
  assert.equal(wasteFinding.recommended_action.action_type, 'adjust_schedule');
  assert.ok(wasteFinding.priority_score >= 60);
});

test('SegmentationSpecialistAgent finds geo expansion opportunity', async () => {
  const agent = new SegmentationSpecialistAgent();
  const output = await agent.execute(
    structuredClone(SEGMENTATION_SPECIALIST_EXAMPLE_INPUTS.portfolio_mix),
  );

  const geoFinding = output.findings.find(
    (finding) => finding.title === 'Regiao com oportunidade de expansao',
  );

  assert.ok(geoFinding);
  assert.equal(geoFinding.category, 'geo');
  assert.equal(geoFinding.recommended_action.action_type, 'adjust_geo');
  assert.ok(geoFinding.confidence_score >= 0.6);
});

test('SegmentationSpecialistAgent flags device click volume with low conversion', async () => {
  const agent = new SegmentationSpecialistAgent();
  const output = await agent.execute(
    structuredClone(SEGMENTATION_SPECIALIST_EXAMPLE_INPUTS.portfolio_mix),
  );

  const deviceFinding = output.findings.find(
    (finding) => finding.title === 'Dispositivo com muito clique e baixa conversao',
  );

  assert.ok(deviceFinding);
  assert.equal(deviceFinding.category, 'device');
  assert.equal(deviceFinding.recommended_action.action_type, 'adjust_device');
  assert.ok(deviceFinding.evidence.length >= 2);
});

test('SegmentationSpecialistAgent supports day of week analysis when local data exists', async () => {
  const agent = new SegmentationSpecialistAgent();
  const output = await agent.execute(
    structuredClone(SEGMENTATION_SPECIALIST_EXAMPLE_INPUTS.portfolio_mix),
  );

  const weekdayFinding = output.findings.find(
    (finding) => finding.title === 'Dia da semana com desperdicio acima do esperado',
  );

  assert.ok(weekdayFinding);
  assert.equal(weekdayFinding.entity_type, 'day_of_week');
  assert.ok(
    weekdayFinding.data_gaps.includes('day_of_week_support_depends_on_local_ingestion'),
  );
});

test('SegmentationSpecialistAgent exposes missing day-of-week data as quality warning', async () => {
  const agent = new SegmentationSpecialistAgent();
  const output = await agent.execute(
    structuredClone(SEGMENTATION_SPECIALIST_EXAMPLE_INPUTS.missing_day_of_week),
  );

  assert.ok(
    output.data_quality.warnings.includes('segmentation_day_of_week_unavailable'),
  );
});
