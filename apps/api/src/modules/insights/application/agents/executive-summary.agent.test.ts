import assert from 'node:assert/strict';
import test from 'node:test';

import {
  readConsolidatedInsights,
  readFindings,
} from '../../domain/agents/performance-agent-feature-readers';
import {
  buildExecutiveSummaryProjection,
  ExecutiveSummaryAgent,
} from './executive-summary.agent';
import {
  EXECUTIVE_SUMMARY_EXAMPLE_INPUTS,
  EXECUTIVE_SUMMARY_EXPECTED_TEXT,
} from './executive-summary.examples';

test('ExecutiveSummaryAgent builds technical and executive headlines', async () => {
  const agent = new ExecutiveSummaryAgent();
  const output = await agent.execute(
    structuredClone(EXECUTIVE_SUMMARY_EXAMPLE_INPUTS.portfolio_summary),
  );

  assert.equal(output.status, 'ready');
  assert.ok(output.summary.includes('acao imediata') || output.summary.includes('insight'));
  assert.ok(output.recommended_focus?.includes('principal ponto de atencao') || output.recommended_focus?.includes('maior ponto de atencao'));
});

test('buildExecutiveSummaryProjection returns top problems, opportunities and slide outline', () => {
  const input = structuredClone(EXECUTIVE_SUMMARY_EXAMPLE_INPUTS.portfolio_summary);
  const projection = buildExecutiveSummaryProjection({
    consolidatedInsights: readConsolidatedInsights(input.features.consolidated_insights),
    reviewedFindings: readFindings(input.features.reviewed_findings),
  });

  assert.equal(projection.top_problems.length, 2);
  assert.equal(projection.top_opportunities.length, 2);
  assert.ok(projection.slide_outline.length >= 4);
  assert.ok(projection.next_steps.length > 0);
  assert.ok(projection.technical_summary.includes('Top problemas'));
  assert.ok(projection.executive_summary.includes('melhores oportunidades'));
});

test('ExecutiveSummaryAgent examples keep stable technical and executive summary templates', () => {
  const input = structuredClone(EXECUTIVE_SUMMARY_EXAMPLE_INPUTS.portfolio_summary);
  const projection = buildExecutiveSummaryProjection({
    consolidatedInsights: readConsolidatedInsights(input.features.consolidated_insights),
    reviewedFindings: readFindings(input.features.reviewed_findings),
  });

  assert.equal(
    projection.technical_summary,
    EXECUTIVE_SUMMARY_EXPECTED_TEXT.technical_summary_example,
  );
  assert.equal(
    projection.executive_summary,
    EXECUTIVE_SUMMARY_EXPECTED_TEXT.executive_summary_example,
  );
});

test('ExecutiveSummaryAgent returns insufficient_data without consolidated insights', async () => {
  const agent = new ExecutiveSummaryAgent();
  const output = await agent.execute(
    structuredClone(EXECUTIVE_SUMMARY_EXAMPLE_INPUTS.unavailable),
  );

  assert.equal(output.status, 'insufficient_data');
  assert.equal(output.findings.length, 0);
});
