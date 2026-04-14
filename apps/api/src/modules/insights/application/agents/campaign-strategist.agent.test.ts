import assert from 'node:assert/strict';
import test from 'node:test';

import { CampaignStrategistAgent } from './campaign-strategist.agent';
import {
  CAMPAIGN_STRATEGIST_EXAMPLE_INPUTS,
  CAMPAIGN_STRATEGIST_EXPECTED_INSIGHT_EXAMPLES,
} from './campaign-strategist.examples';

test('CampaignStrategistAgent detects scale opportunity', async () => {
  const agent = new CampaignStrategistAgent();
  const output = await agent.execute(
    structuredClone(CAMPAIGN_STRATEGIST_EXAMPLE_INPUTS.scale_candidate),
  );

  assert.equal(output.status, 'ready');

  const scaleFinding = output.findings.find(
    (finding) =>
      finding.recommended_action.action_type ===
      CAMPAIGN_STRATEGIST_EXPECTED_INSIGHT_EXAMPLES.scale_candidate.action_type,
  );

  assert.ok(scaleFinding);
  assert.match(
    scaleFinding.title,
    new RegExp(
      CAMPAIGN_STRATEGIST_EXPECTED_INSIGHT_EXAMPLES.scale_candidate.title,
      'i',
    ),
  );
  assert.ok(scaleFinding.priority_score >= 55);
  assert.ok(scaleFinding.confidence_score >= 0.6);
});

test('CampaignStrategistAgent flags campaign to contain', async () => {
  const agent = new CampaignStrategistAgent();
  const output = await agent.execute(
    structuredClone(CAMPAIGN_STRATEGIST_EXAMPLE_INPUTS.contain_candidate),
  );

  assert.equal(output.status, 'ready');

  const reduceFinding = output.findings.find(
    (finding) =>
      finding.recommended_action.action_type ===
      CAMPAIGN_STRATEGIST_EXPECTED_INSIGHT_EXAMPLES.contain_candidate.action_type,
  );

  assert.ok(reduceFinding);
  assert.match(
    reduceFinding.title,
    new RegExp(
      CAMPAIGN_STRATEGIST_EXPECTED_INSIGHT_EXAMPLES.contain_candidate.title,
      'i',
    ),
  );
  assert.ok(reduceFinding.priority_score >= 70);
  assert.ok(reduceFinding.evidence.length >= 3);
});

test('CampaignStrategistAgent flags campaign to pause', async () => {
  const agent = new CampaignStrategistAgent();
  const output = await agent.execute(
    structuredClone(CAMPAIGN_STRATEGIST_EXAMPLE_INPUTS.pause_candidate),
  );

  assert.equal(output.status, 'ready');

  const pauseFinding = output.findings.find(
    (finding) =>
      finding.recommended_action.action_type ===
      CAMPAIGN_STRATEGIST_EXPECTED_INSIGHT_EXAMPLES.pause_candidate.action_type,
  );

  assert.ok(pauseFinding);
  assert.match(
    pauseFinding.title,
    new RegExp(
      CAMPAIGN_STRATEGIST_EXPECTED_INSIGHT_EXAMPLES.pause_candidate.title,
      'i',
    ),
  );
  assert.equal(pauseFinding.severity, 'critical');
  assert.ok(pauseFinding.priority_score >= 80);
});

test('CampaignStrategistAgent identifies budget validation opportunity in portfolio mix', async () => {
  const agent = new CampaignStrategistAgent();
  const output = await agent.execute(
    structuredClone(CAMPAIGN_STRATEGIST_EXAMPLE_INPUTS.portfolio_mix),
  );

  assert.equal(output.status, 'ready');

  const investigateFinding = output.findings.find(
    (finding) =>
      finding.title ===
      CAMPAIGN_STRATEGIST_EXPECTED_INSIGHT_EXAMPLES.portfolio_mix_budget_check.title,
  );

  assert.ok(investigateFinding);
  assert.equal(investigateFinding.recommended_action.action_type, 'investigate');
  assert.ok(
    investigateFinding.data_gaps.includes(
      'budget_lost_impression_share_unavailable',
    ),
  );
});
