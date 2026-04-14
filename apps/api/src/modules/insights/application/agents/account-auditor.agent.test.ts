import assert from 'node:assert/strict';
import test from 'node:test';

import { AccountAuditorAgent } from './account-auditor.agent';
import { ACCOUNT_AUDITOR_EXAMPLE_INPUTS } from './account-auditor.examples';

test('AccountAuditorAgent returns insufficient_data when baseline is missing', async () => {
  const agent = new AccountAuditorAgent();
  const output = await agent.execute(
    structuredClone(ACCOUNT_AUDITOR_EXAMPLE_INPUTS.insufficient_data),
  );

  assert.equal(output.status, 'insufficient_data');
  assert.equal(output.findings.length, 0);
  assert.match(output.summary, /Nao ha base suficiente/i);
});

test('AccountAuditorAgent flags macro efficiency deterioration across multiple windows', async () => {
  const agent = new AccountAuditorAgent();
  const output = await agent.execute(
    structuredClone(ACCOUNT_AUDITOR_EXAMPLE_INPUTS.deterioration),
  );

  assert.equal(output.status, 'ready');
  assert.ok(output.findings.length >= 1);

  const topFinding = output.findings[0];
  assert.ok(topFinding);

  if (topFinding === undefined) {
    throw new Error('Expected top finding to exist.');
  }

  assert.equal(topFinding.category, 'account_health');
  assert.equal(topFinding.recommended_action.action_type, 'investigate');
  assert.match(topFinding.title, /perdeu eficiencia/i);
  assert.ok(topFinding.priority_score >= 70);
  assert.ok(topFinding.confidence_score >= 0.6);
  assert.ok(topFinding.evidence.length >= 3);
  assert.ok(topFinding.technical_explanation.length > 20);
  assert.ok(topFinding.executive_explanation.length > 20);
});

test('AccountAuditorAgent detects scaling opportunity when account improves with consistency', async () => {
  const agent = new AccountAuditorAgent();
  const output = await agent.execute(
    structuredClone(ACCOUNT_AUDITOR_EXAMPLE_INPUTS.scale_opportunity),
  );

  assert.equal(output.status, 'ready');
  assert.ok(output.findings.length >= 1);

  const scaleFinding = output.findings.find(
    (finding) => finding.recommended_action.action_type === 'scale',
  );

  assert.ok(scaleFinding);
  assert.equal(scaleFinding.category, 'budget_allocation');
  assert.match(scaleFinding.summary, /melhora consistente/i);
  assert.ok(scaleFinding.priority_score >= 55);
});

test('AccountAuditorAgent surfaces volatility risk when windows diverge too much', async () => {
  const agent = new AccountAuditorAgent();
  const output = await agent.execute(
    structuredClone(ACCOUNT_AUDITOR_EXAMPLE_INPUTS.volatility),
  );

  assert.equal(output.status, 'ready');

  const volatilityFinding = output.findings.find(
    (finding) => finding.recommended_action.action_type === 'monitor',
  );

  assert.ok(volatilityFinding);
  assert.match(volatilityFinding.title, /instabilidade/i);
  assert.ok(volatilityFinding.evidence.length >= 2);
  assert.ok(volatilityFinding.confidence_score >= 0.55);
});
