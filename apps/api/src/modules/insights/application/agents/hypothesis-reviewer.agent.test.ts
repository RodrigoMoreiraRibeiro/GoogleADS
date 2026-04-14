import assert from 'node:assert/strict';
import test from 'node:test';

import { HypothesisReviewerAgent } from './hypothesis-reviewer.agent';
import {
  HYPOTHESIS_REVIEWER_EXAMPLE_INPUTS,
  HYPOTHESIS_REVIEWER_EXPECTED_AFTER,
} from './hypothesis-reviewer.examples';

test('HypothesisReviewerAgent merges similar findings and confirms well-supported hypothesis', async () => {
  const agent = new HypothesisReviewerAgent();
  const output = await agent.execute(
    structuredClone(HYPOTHESIS_REVIEWER_EXAMPLE_INPUTS.confirmed_merge),
  );

  assert.equal(output.status, 'ready');
  assert.equal(output.findings.length, 1);

  const finding = output.findings[0];
  assert.ok(finding);
  assert.equal(
    finding.hypothesis_status,
    HYPOTHESIS_REVIEWER_EXPECTED_AFTER.confirmed_merge.hypothesis_status,
  );
  assert.ok(finding.support_agent_names.includes('creative_performance'));
  assert.ok(
    finding.review_notes.some((note) => note.includes('Merged 2 achados similares')),
  );
  assert.ok(finding.primary_hypothesis.includes('sugere') || finding.primary_hypothesis.includes('plausivel'));
});

test('HypothesisReviewerAgent downgrades confidence and status when there is hard conflict', async () => {
  const agent = new HypothesisReviewerAgent();
  const output = await agent.execute(
    structuredClone(HYPOTHESIS_REVIEWER_EXAMPLE_INPUTS.conflict_and_downgrade),
  );

  const finding = output.findings[0];
  assert.ok(finding);
  assert.equal(
    finding.hypothesis_status,
    HYPOTHESIS_REVIEWER_EXPECTED_AFTER.conflict_and_downgrade.hypothesis_status,
  );
  assert.ok(finding.confidence_score < 0.78);
  assert.ok(finding.data_gaps.includes('hard_agent_conflict'));
});

test('HypothesisReviewerAgent discards weak findings with insufficient evidence', async () => {
  const agent = new HypothesisReviewerAgent();
  const output = await agent.execute(
    structuredClone(HYPOTHESIS_REVIEWER_EXAMPLE_INPUTS.discarded_weak),
  );

  assert.equal(output.status, HYPOTHESIS_REVIEWER_EXPECTED_AFTER.discarded_weak.status);
  assert.equal(output.findings.length, 0);
  assert.ok(output.stats.findings_suppressed >= 1);
});

test('HypothesisReviewerAgent returns insufficient_data without review queue', async () => {
  const agent = new HypothesisReviewerAgent();
  const output = await agent.execute({
    ...structuredClone(HYPOTHESIS_REVIEWER_EXAMPLE_INPUTS.confirmed_merge),
    features: {
      review_queue_findings: [],
      review_queue_conflicts: [],
    },
  });

  assert.equal(output.status, 'insufficient_data');
  assert.equal(output.findings.length, 0);
});
