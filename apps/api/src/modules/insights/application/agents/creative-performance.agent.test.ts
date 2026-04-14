import assert from 'node:assert/strict';
import test from 'node:test';

import { CreativePerformanceAgent } from './creative-performance.agent';
import {
  CREATIVE_PERFORMANCE_EXAMPLE_INPUTS,
  CREATIVE_PERFORMANCE_EXPECTED_FINDINGS,
} from './creative-performance.examples';

test('CreativePerformanceAgent flags creative fatigue', async () => {
  const agent = new CreativePerformanceAgent();
  const output = await agent.execute(
    structuredClone(CREATIVE_PERFORMANCE_EXAMPLE_INPUTS.fatigue_candidate),
  );

  const finding = output.findings.find(
    (item) => item.title === CREATIVE_PERFORMANCE_EXPECTED_FINDINGS.fatigue_candidate.title,
  );

  assert.ok(finding);
  assert.equal(
    finding.recommended_action.action_type,
    CREATIVE_PERFORMANCE_EXPECTED_FINDINGS.fatigue_candidate.action_type,
  );
  assert.ok(finding.technical_explanation.includes('CTR'));
});

test('CreativePerformanceAgent flags click to conversion misalignment', async () => {
  const agent = new CreativePerformanceAgent();
  const output = await agent.execute(
    structuredClone(CREATIVE_PERFORMANCE_EXAMPLE_INPUTS.click_conversion_gap),
  );

  const finding = output.findings.find(
    (item) => item.title === CREATIVE_PERFORMANCE_EXPECTED_FINDINGS.click_conversion_gap.title,
  );

  assert.ok(finding);
  assert.equal(
    finding.recommended_action.action_type,
    CREATIVE_PERFORMANCE_EXPECTED_FINDINGS.click_conversion_gap.action_type,
  );
  assert.ok(finding.confidence_score >= 0.6);
});

test('CreativePerformanceAgent flags low attractiveness', async () => {
  const agent = new CreativePerformanceAgent();
  const output = await agent.execute(
    structuredClone(CREATIVE_PERFORMANCE_EXAMPLE_INPUTS.low_attractiveness),
  );

  const finding = output.findings.find(
    (item) => item.title === CREATIVE_PERFORMANCE_EXPECTED_FINDINGS.low_attractiveness.title,
  );

  assert.ok(finding);
  assert.equal(
    finding.recommended_action.action_type,
    CREATIVE_PERFORMANCE_EXPECTED_FINDINGS.low_attractiveness.action_type,
  );
  assert.ok(finding.evidence.some((evidence) => evidence.metric === 'impressions'));
});

test('CreativePerformanceAgent flags need for copy review', async () => {
  const agent = new CreativePerformanceAgent();
  const output = await agent.execute(
    structuredClone(CREATIVE_PERFORMANCE_EXAMPLE_INPUTS.copy_refresh),
  );

  const finding = output.findings.find(
    (item) => item.title === CREATIVE_PERFORMANCE_EXPECTED_FINDINGS.copy_refresh.title,
  );

  assert.ok(finding);
  assert.equal(
    finding.recommended_action.action_type,
    CREATIVE_PERFORMANCE_EXPECTED_FINDINGS.copy_refresh.action_type,
  );
  assert.ok(finding.executive_explanation.includes('mensagem'));
});

test('CreativePerformanceAgent returns insufficient_data without campaign baseline', async () => {
  const agent = new CreativePerformanceAgent();
  const output = await agent.execute(
    structuredClone(CREATIVE_PERFORMANCE_EXAMPLE_INPUTS.unavailable),
  );

  assert.equal(output.status, 'insufficient_data');
  assert.ok(output.data_quality.warnings.includes('creative_baseline_missing'));
});
