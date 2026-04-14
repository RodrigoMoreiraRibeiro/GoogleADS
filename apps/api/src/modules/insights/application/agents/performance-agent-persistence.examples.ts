export const persistConsolidatedInsightsExample = `
await performanceAgentPersistenceService.upsertConsolidatedInsights([
  {
    sourceRunId: '145',
    consolidatedInsight: {
      tenantId: '1',
      clientId: '12',
      accountId: '88',
      entityType: 'campaign',
      entityId: '123456789',
      entityLabel: 'Pesquisa Institucional',
      category: 'campaign_efficiency',
      severity: 'warning',
      priorityBand: 'high',
      priorityScore: 81,
      confidenceScore: 0.86,
      confidenceBand: 'high',
      riskLevel: 'medium',
      sourceAgentNames: ['campaign_strategist', 'hypothesis_reviewer'],
      title: 'Campanha com custo acima da media',
      summary: 'A campanha perdeu eficiencia frente ao baseline da conta.',
      diagnosis: 'O CPA subiu sem aumento proporcional de conversoes.',
      primaryHypothesis: 'A combinacao entre segmentacao e mensagem perdeu aderencia.',
      alternativeHypotheses: ['Mudanca recente na concorrencia'],
      hypothesisStatus: 'plausible',
      recommendedAction: {
        actionType: 'reduce',
        actionTarget: 'campaign:123456789',
        description: 'Reduzir verba e revisar copy e segmentacao.'
      },
      expectedImpact: 'Conter desperdicio e proteger o CPA consolidado.',
      technicalExplanation: 'CPA 34% acima do baseline com ROAS em queda.',
      executiveExplanation: 'Essa campanha esta consumindo mais verba do que deveria para o retorno atual.',
      evidenceJson: [],
      reviewNotes: ['Sem dado adicional de landing page.'],
      blockedClaims: ['Nao ha evidencia suficiente para atribuir a queda apenas ao criativo.'],
      nextSteps: ['Reduzir verba em 10%', 'Revisar mensagens principais'],
      analysisWindow: {
        analysis_window_label: 'last_7d',
        period_start: '2026-04-01',
        period_end: '2026-04-07',
        baseline_start: '2026-03-25',
        baseline_end: '2026-03-31',
        comparison_label: 'last_7d vs previous_7d'
      },
      dataQuality: {
        is_sync_stale: false,
        has_minimum_volume: true,
        has_baseline: true,
        warnings: []
      },
      generatedAt: '2026-04-13T10:30:00.000Z'
    }
  }
]);
`.trim();

export const readAnalysisRunHistoryExample = `
const runs = await performanceAgentHistoryService.listAnalysisRuns({
  tenantId: '1',
  clientId: '12',
  accountId: '88',
  limit: 10,
});

const outputs = await performanceAgentHistoryService.listAgentOutputs('145');
const insights = await performanceAgentHistoryService.listConsolidatedInsights('145');
const diff = await performanceAgentHistoryService.compareExecutions({
  leftAnalysisRunId: '144',
  rightAnalysisRunId: '145',
});
`.trim();
