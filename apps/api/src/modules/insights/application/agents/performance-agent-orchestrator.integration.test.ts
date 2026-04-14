import assert from 'node:assert/strict';
import test from 'node:test';

import type {
  AgentFinding,
  AgentInput,
  AgentOutput,
  ConsolidatedInsight,
  PerformanceAgentName,
} from '@googleads/shared';

import { AccountAuditorAgent } from './account-auditor.agent';
import { CampaignStrategistAgent } from './campaign-strategist.agent';
import { CreativePerformanceAgent } from './creative-performance.agent';
import { ExecutiveSummaryAgent } from './executive-summary.agent';
import { HypothesisReviewerAgent } from './hypothesis-reviewer.agent';
import { PerformanceAgentDedupeService } from './performance-agent-dedupe.service';
import { PerformanceAgentOrchestratorService } from './performance-agent-orchestrator.service';
import { PerformanceAgentPayloadBuilderService } from './performance-agent-payload-builder.service';
import { PerformanceAgentRuntimeConfigService } from './performance-agent-runtime-config.service';
import { SearchTermsSpecialistAgent } from './search-terms-specialist.agent';
import { SegmentationSpecialistAgent } from './segmentation-specialist.agent';
import type { PerformanceAnalysisAgent } from '../../domain/agents/performance-analysis-agent.interface';
import type {
  AccountWindowComparison,
  PerformanceAgentExecutionResult,
  PerformanceAnalysisRunContext,
  PerformanceFeatureBundle,
  PerformanceInsightUpsertRecord,
  PersistAgentRunFailureInput,
  PersistAgentRunStartInput,
  PersistAgentRunSuccessInput,
  PersistedAgentRunRecord,
} from '../../domain/agents/performance-agent.types';
import {
  buildAction,
  buildAgentOutput,
  buildFinding,
  createDeterministicHash,
} from '../../domain/agents/performance-agent.utils';

const EXPECTED_AGENT_ORDER = [
  'account_auditor',
  'campaign_strategist',
  'segmentation_specialist',
  'search_terms_specialist',
  'creative_performance',
  'hypothesis_reviewer',
  'executive_summary',
] as const;

test('Scenario 1: CPA subindo por piora em mobile', async () => {
  const harness = createHarness({
    '1001': createScenario({
      analysisRunId: '1001',
      accountCurrent: metrics(1_200, 20_000, 300, 9, 2_400),
      accountBaseline: metrics(1_000, 18_000, 280, 16, 4_000),
      windowComparisons: deteriorationWindows(),
      campaignsCurrent: [
        campaign('2001', 'Search Core', metrics(1_200, 20_000, 300, 9, 2_400), 0.72),
      ],
      campaignsBaseline: [
        campaign('2001', 'Search Core', metrics(1_000, 18_000, 280, 16, 4_000), 0.74),
      ],
      segmentationCurrent: [
        segment('2001', 'Search Core', 'device', 'MOBILE', metrics(800, 11_000, 180, 1, 120)),
        segment('2001', 'Search Core', 'device', 'DESKTOP', metrics(400, 9_000, 120, 8, 2_160)),
      ],
      segmentationBaseline: [
        segment('2001', 'Search Core', 'device', 'MOBILE', metrics(500, 9_500, 150, 6, 1_500)),
        segment('2001', 'Search Core', 'device', 'DESKTOP', metrics(500, 8_500, 130, 10, 2_500)),
      ],
    }),
  }, {
    accountAuditorAgent: createNoopAgent('account_auditor'),
    campaignStrategistAgent: createNoopAgent('campaign_strategist'),
    segmentationSpecialistAgent: createStubFindingAgent({
      agentName: 'segmentation_specialist',
      summary: 'Mobile puxando perda de eficiencia.',
      recommendedFocus: 'Revisar mobile.',
      findingsBuilder: () => [
        buildFinding({
          sourceAgent: 'segmentation_specialist',
          entityType: 'device',
          entityId: 'device:MOBILE',
          entityLabel: 'MOBILE',
          category: 'device',
          severity: 'critical',
          priorityScore: 88,
          confidenceScore: 0.83,
          riskLevel: 'medium',
          title: 'Dispositivo com muito clique e baixa conversao',
          summary: 'O mobile concentrou gasto e perdeu eficiencia.',
          diagnosis: 'O CPA subiu com baixa conversao no mobile.',
          primaryHypothesis: 'A experiencia mobile esta menos aderente.',
          recommendedAction: buildAction(
            'adjust_device',
            'Reduzir exposicao em mobile e revisar experiencia.',
            { actionTarget: 'device:MOBILE' },
          ),
          expectedImpact: 'Reduzir desperdicio em mobile.',
          technicalExplanation: 'Clicks altos e conversao baixa no mobile.',
          executiveExplanation: 'O celular esta trazendo mais custo do que retorno.',
          evidence: [],
          dataGaps: [],
          tags: ['device', 'mobile'],
        }),
      ],
    }),
    searchTermsSpecialistAgent: createNoopAgent('search_terms_specialist'),
    creativePerformanceAgent: createNoopAgent('creative_performance'),
  });

  const result = await harness.orchestrator.runAnalysis('1001');

  assertExecutionOrder(result, harness.persistence, '1001');

  const segmentationOutput = findOutput(result, 'segmentation_specialist');
  assert.ok(
    segmentationOutput.findings.some(
      (finding) => finding.title === 'Dispositivo com muito clique e baixa conversao',
    ),
  );

  const snapshots = harness.persistence.snapshotsByRun.get('1001') ?? [];
  assert.ok(snapshots.some((item) => item.entityLabel === 'MOBILE'));
  assert.equal(harness.persistence.analysisRuns.get('1001')?.status, 'completed');
});

test('Scenario 2: desperdicio noturno relevante', async () => {
  const harness = createHarness({
    '1002': createScenario({
      analysisRunId: '1002',
      accountCurrent: metrics(900, 16_000, 240, 15, 3_000),
      accountBaseline: metrics(880, 15_700, 238, 15, 3_050),
      windowComparisons: stableWindows(),
      campaignsCurrent: [
        campaign('2002', 'Always On', metrics(900, 16_000, 240, 15, 3_000), 0.68),
      ],
      campaignsBaseline: [
        campaign('2002', 'Always On', metrics(880, 15_700, 238, 15, 3_050), 0.68),
      ],
      segmentationCurrent: [
        segment('2002', 'Always On', 'schedule', '02:00', metrics(330, 3_500, 75, 1, 120)),
        segment('2002', 'Always On', 'schedule', '14:00', metrics(220, 4_100, 64, 7, 1_800)),
      ],
      segmentationBaseline: [
        segment('2002', 'Always On', 'schedule', '02:00', metrics(190, 3_300, 62, 2, 260)),
        segment('2002', 'Always On', 'schedule', '14:00', metrics(220, 4_000, 60, 6, 1_650)),
      ],
    }),
  }, {
    accountAuditorAgent: createNoopAgent('account_auditor'),
    campaignStrategistAgent: createNoopAgent('campaign_strategist'),
    segmentationSpecialistAgent: createStubFindingAgent({
      agentName: 'segmentation_specialist',
      summary: 'Janela noturna com desperdicio.',
      recommendedFocus: 'Ajustar horario 02:00.',
      findingsBuilder: () => [
        buildFinding({
          sourceAgent: 'segmentation_specialist',
          entityType: 'schedule',
          entityId: 'schedule:02:00',
          entityLabel: '02:00',
          category: 'schedule',
          severity: 'warning',
          priorityScore: 79,
          confidenceScore: 0.78,
          riskLevel: 'medium',
          title: 'Faixa horaria com desperdicio acima do esperado',
          summary: 'O horario noturno consome verba com baixa resposta.',
          diagnosis: 'A faixa 02:00 perdeu eficiencia.',
          primaryHypothesis: 'A demanda noturna esta menos qualificada.',
          recommendedAction: buildAction(
            'adjust_schedule',
            'Reduzir programacao na faixa 02:00.',
            { actionTarget: 'schedule:02:00' },
          ),
          expectedImpact: 'Cortar desperdicio temporal.',
          technicalExplanation: 'A faixa noturna tem baixo retorno relativo.',
          executiveExplanation: 'Esse horario gasta mais do que retorna.',
          evidence: [],
          dataGaps: [],
          tags: ['schedule', 'night'],
        }),
      ],
    }),
    searchTermsSpecialistAgent: createNoopAgent('search_terms_specialist'),
    creativePerformanceAgent: createNoopAgent('creative_performance'),
  });

  const result = await harness.orchestrator.runAnalysis('1002');
  assertExecutionOrder(result, harness.persistence, '1002');
  const segmentationOutput = findOutput(result, 'segmentation_specialist');
  assert.ok(
    segmentationOutput.findings.some(
      (finding) => finding.title === 'Faixa horaria com desperdicio acima do esperado',
    ),
  );
  assert.ok(
    (harness.persistence.snapshotsByRun.get('1002') ?? []).some(
      (item) =>
        item.entityType === 'schedule' &&
        item.entityLabel === '02:00',
    ),
  );
  assert.ok(
    result.summary.top_problems.some(
      (item) => item.entity_label === '02:00',
    ),
  );
});

test('Scenario 3: regiao com custo alto e baixa conversao', async () => {
  const harness = createHarness({
    '1003': createScenario({
      analysisRunId: '1003',
      accountCurrent: metrics(1_100, 19_000, 285, 18, 4_200),
      accountBaseline: metrics(1_050, 18_800, 280, 18, 4_100),
      windowComparisons: stableWindows(),
      campaignsCurrent: [
        campaign('2003', 'Regional Search', metrics(1_100, 19_000, 285, 18, 4_200), 0.66),
      ],
      campaignsBaseline: [
        campaign('2003', 'Regional Search', metrics(1_050, 18_800, 280, 18, 4_100), 0.66),
      ],
      segmentationCurrent: [
        segment('2003', 'Regional Search', 'geo', 'Norte', metrics(380, 5_200, 82, 2, 260)),
        segment('2003', 'Regional Search', 'geo', 'Sudeste', metrics(420, 6_300, 96, 9, 2_500)),
      ],
      segmentationBaseline: [
        segment('2003', 'Regional Search', 'geo', 'Norte', metrics(250, 4_800, 70, 3, 420)),
        segment('2003', 'Regional Search', 'geo', 'Sudeste', metrics(400, 6_100, 92, 8, 2_300)),
      ],
    }),
  }, {
    accountAuditorAgent: createNoopAgent('account_auditor'),
    campaignStrategistAgent: createNoopAgent('campaign_strategist'),
    segmentationSpecialistAgent: createStubFindingAgent({
      agentName: 'segmentation_specialist',
      summary: 'Regiao com ineficiencia relevante.',
      recommendedFocus: 'Revisar regiao Norte.',
      findingsBuilder: () => [
        buildFinding({
          sourceAgent: 'segmentation_specialist',
          entityType: 'geo',
          entityId: 'geo:Norte',
          entityLabel: 'Norte',
          category: 'geo',
          severity: 'critical',
          priorityScore: 85,
          confidenceScore: 0.8,
          riskLevel: 'medium',
          title: 'Regiao com CPA muito acima da media',
          summary: 'A regiao Norte esta cara para o retorno atual.',
          diagnosis: 'O custo local subiu e a conversao ficou baixa.',
          primaryHypothesis: 'A oferta esta menos aderente nessa regiao.',
          recommendedAction: buildAction(
            'adjust_geo',
            'Reduzir exposicao na regiao Norte.',
            { actionTarget: 'geo:Norte' },
          ),
          expectedImpact: 'Conter desperdicio geografico.',
          technicalExplanation: 'O CPA da regiao superou a referencia da conta.',
          executiveExplanation: 'Essa regiao esta custando mais do que deveria.',
          evidence: [],
          dataGaps: [],
          tags: ['geo', 'waste'],
        }),
      ],
    }),
    searchTermsSpecialistAgent: createNoopAgent('search_terms_specialist'),
    creativePerformanceAgent: createNoopAgent('creative_performance'),
  });

  const result = await harness.orchestrator.runAnalysis('1003');
  assertExecutionOrder(result, harness.persistence, '1003');
  const segmentationOutput = findOutput(result, 'segmentation_specialist');

  assert.ok(
    segmentationOutput.findings.some(
      (finding) =>
        finding.category === 'geo' &&
        finding.entity_label === 'Norte',
    ),
  );

  assert.ok(
    findOutput(result, 'hypothesis_reviewer').findings.some(
      (finding) => finding.entity_type === 'geo' && finding.entity_label === 'Norte',
    ),
  );
  assert.ok(
    result.summary.executive_summary.toLowerCase().includes('norte'),
  );
});

test('Scenario 4: campanha vencedora limitada por orcamento', async () => {
  const harness = createHarness({
    '1004': createScenario({
      analysisRunId: '1004',
      accountCurrent: metrics(1_400, 30_000, 420, 28, 8_400),
      accountBaseline: metrics(1_250, 27_500, 390, 22, 6_380),
      windowComparisons: scalingWindows(),
      campaignsCurrent: [
        campaign('2004', 'Brand Winner', metrics(560, 9_000, 120, 14, 5_600), 0.41),
        campaign('2005', 'Generic Search', metrics(840, 21_000, 300, 14, 2_800), 0.78),
      ],
      campaignsBaseline: [
        campaign('2004', 'Brand Winner', metrics(420, 7_500, 98, 10, 3_800), 0.44),
        campaign('2005', 'Generic Search', metrics(830, 20_000, 292, 12, 2_580), 0.79),
      ],
      segmentationCurrent: [],
      segmentationBaseline: [],
    }),
  }, {
    accountAuditorAgent: createNoopAgent('account_auditor'),
    campaignStrategistAgent: createStubFindingAgent({
      agentName: 'campaign_strategist',
      summary: 'Uma campanha mostra espaco para escalar com criterio.',
      recommendedFocus: 'Validar ampliacao da campanha vencedora.',
      findingsBuilder: () => [
        buildFinding({
          sourceAgent: 'campaign_strategist',
          entityType: 'campaign',
          entityId: '2004',
          entityLabel: 'Brand Winner',
          category: 'budget_allocation',
          severity: 'info',
          priorityScore: 77,
          confidenceScore: 0.8,
          riskLevel: 'low',
          title: 'Campanha eficiente com espaco de entrega para validar limitacao',
          summary: 'A campanha combina eficiencia alta com espaco potencial para expandir.',
          diagnosis: 'A campanha esta acima da media da conta e pode estar limitada.',
          primaryHypothesis: 'Existe oportunidade de escalar sem deteriorar eficiencia no curto prazo.',
          recommendedAction: buildAction(
            'scale',
            'Validar limitacao por orcamento e ampliar gradualmente a verba.',
            { actionTarget: 'campaign:2004' },
          ),
          expectedImpact: 'Aumentar volume mantendo eficiencia competitiva.',
          technicalExplanation: 'A campanha lidera em retorno relativo e ainda sugere folga de entrega.',
          executiveExplanation: 'Essa campanha e uma candidata forte para receber mais investimento.',
          evidence: [
            evidence('ev-1004-1', 'roas', 10),
            evidence('ev-1004-2', 'search_impression_share', 0.41),
          ],
          dataGaps: [],
          tags: ['campaign', 'scale'],
        }),
      ],
    }),
    segmentationSpecialistAgent: createNoopAgent('segmentation_specialist'),
    searchTermsSpecialistAgent: createNoopAgent('search_terms_specialist'),
    creativePerformanceAgent: createNoopAgent('creative_performance'),
  });

  const result = await harness.orchestrator.runAnalysis('1004');
  assertExecutionOrder(result, harness.persistence, '1004');
  const campaignOutput = findOutput(result, 'campaign_strategist');

  assert.ok(
    campaignOutput.findings.some(
      (finding) =>
        finding.title === 'Campanha eficiente com espaco de entrega para validar limitacao' &&
        finding.entity_label === 'Brand Winner',
    ),
  );

  assert.ok(
    result.summary.top_opportunities.some(
      (item) => item.entity_label === 'Brand Winner',
    ),
  );
  assert.equal(harness.persistence.analysisRuns.get('1004')?.status, 'completed');
});

test('Scenario 5: termos com gasto e sem conversao persistem e mantem idempotencia entre execucoes', async () => {
  const scenario = createScenario({
    analysisRunId: '1005',
    accountCurrent: metrics(980, 18_500, 260, 18, 4_100),
    accountBaseline: metrics(960, 18_000, 255, 18, 4_000),
    windowComparisons: stableWindows(),
    campaignsCurrent: [
      campaign('2006', 'Search Terms', metrics(980, 18_500, 260, 18, 4_100), 0.69),
    ],
    campaignsBaseline: [
      campaign('2006', 'Search Terms', metrics(960, 18_000, 255, 18, 4_000), 0.69),
    ],
    searchTermsAvailable: true,
    searchTermsCurrent: [
      searchTerm('2006', 'Search Terms', 'curso gratis de google ads', metrics(120, 0, 28, 0, 0)),
      searchTerm('2006', 'Search Terms', 'manual google ads pdf', metrics(110, 0, 24, 0, 0)),
      searchTerm('2006', 'Search Terms', 'telefone google ads whatsapp', metrics(95, 0, 21, 0, 0)),
      searchTerm('2006', 'Search Terms', 'gestao google ads para ecommerce', metrics(85, 0, 18, 3, 1_200)),
    ],
    searchTermsBaseline: [
      searchTerm('2006', 'Search Terms', 'curso gratis de google ads', metrics(80, 0, 18, 0, 0)),
      searchTerm('2006', 'Search Terms', 'manual google ads pdf', metrics(70, 0, 16, 0, 0)),
      searchTerm('2006', 'Search Terms', 'telefone google ads whatsapp', metrics(60, 0, 15, 0, 0)),
      searchTerm('2006', 'Search Terms', 'gestao google ads para ecommerce', metrics(60, 0, 14, 2, 900)),
    ],
  });

  const harness = createHarness({
    '1005': scenario,
    '1006': {
      ...scenario,
      runContext: {
        ...scenario.runContext,
        analysisRunId: '1006',
      },
    },
  }, {
    accountAuditorAgent: createNoopAgent('account_auditor'),
    campaignStrategistAgent: createNoopAgent('campaign_strategist'),
    segmentationSpecialistAgent: createNoopAgent('segmentation_specialist'),
    searchTermsSpecialistAgent: createStubFindingAgent({
      agentName: 'search_terms_specialist',
      summary: 'Poucos termos concentram desperdicio e pedem revisao.',
      recommendedFocus: 'Negativar termos informacionais sem resposta.',
      findingsBuilder: () => [
        buildFinding({
          sourceAgent: 'search_terms_specialist',
          entityType: 'search_term',
          entityId: '2006:curso gratis de google ads',
          entityLabel: 'curso gratis de google ads',
          category: 'search_terms',
          severity: 'warning',
          priorityScore: 81,
          confidenceScore: 0.84,
          riskLevel: 'low',
          title: 'Termo com gasto relevante e sem conversao',
          summary: 'O termo consome verba sem gerar sinal de resultado.',
          diagnosis: 'O gasto se acumula sem conversoes no periodo observado.',
          primaryHypothesis: 'A intencao de busca e mais informacional do que comercial.',
          recommendedAction: buildAction(
            'review_search_terms',
            'Revisar termo e considerar negativa para consultas informacionais.',
            { actionTarget: 'search_term:2006:curso gratis de google ads' },
          ),
          expectedImpact: 'Reduzir desperdicio concentrado em termos pouco qualificados.',
          technicalExplanation: 'O termo teve gasto recorrente e nao apresentou conversao.',
          executiveExplanation: 'Esse termo esta consumindo verba sem trazer resultado.',
          evidence: [],
          dataGaps: [],
          tags: ['search_term', 'waste'],
        }),
      ],
    }),
    creativePerformanceAgent: createNoopAgent('creative_performance'),
  });

  const first = await harness.orchestrator.runAnalysis('1005');
  const second = await harness.orchestrator.runAnalysis('1006');
  assertExecutionOrder(first, harness.persistence, '1005');
  assertExecutionOrder(second, harness.persistence, '1006');

  const searchTermsOutput = findOutput(first, 'search_terms_specialist');
  assert.ok(
    searchTermsOutput.findings.some(
      (finding) => finding.title === 'Termo com gasto relevante e sem conversao',
    ),
  );

  const persisted = Array.from(harness.persistence.insightsByKey.values()).find((record) =>
    record.latestPayload.title === 'Termo com gasto relevante e sem conversao' &&
    record.latestPayload.entity_label === 'curso gratis de google ads',
  );
  assert.ok(persisted);
  assert.equal(
    persisted.versions.length,
    1,
    'O mesmo insight recalculado em outra execucao nao deve abrir nova versao.',
  );

  assert.ok((harness.persistence.snapshotsByRun.get('1005') ?? []).length > 0);
  assert.ok((harness.persistence.snapshotsByRun.get('1006') ?? []).length > 0);
  assert.equal(second.persistedInsights, first.persistedInsights);
  assert.ok(
    second.summary.top_problems.some(
      (item) => item.entity_label === 'curso gratis de google ads',
    ),
  );
});

test('Scenario 6: queda de CTR sem queda de ROAS gera revisao criativa sem exagero', async () => {
  const harness = createHarness({
    '1007': createScenario({
      analysisRunId: '1007',
      accountCurrent: metrics(900, 18_000, 900, 18, 3_600),
      accountBaseline: metrics(900, 17_500, 950, 18, 3_550),
      windowComparisons: stableWindows(),
      campaignsCurrent: [
        campaign('2007', 'Creative Stable ROAS', metrics(400, 6_000, 90, 8, 1_600), 0.7),
      ],
      campaignsBaseline: [
        campaign('2007', 'Creative Stable ROAS', metrics(390, 6_100, 140, 8, 1_560), 0.7),
      ],
    }),
  }, {
    accountAuditorAgent: createNoopAgent('account_auditor'),
    campaignStrategistAgent: createNoopAgent('campaign_strategist'),
    segmentationSpecialistAgent: createNoopAgent('segmentation_specialist'),
    searchTermsSpecialistAgent: createNoopAgent('search_terms_specialist'),
    creativePerformanceAgent: createStubFindingAgent({
      agentName: 'creative_performance',
      summary: 'Criativo pede ajuste sem sinal de colapso de retorno.',
      recommendedFocus: 'Revisar copy e gancho criativo.',
      findingsBuilder: () => [
        buildFinding({
          sourceAgent: 'creative_performance',
          entityType: 'campaign',
          entityId: '2007',
          entityLabel: 'Creative Stable ROAS',
          category: 'creative',
          severity: 'warning',
          priorityScore: 69,
          confidenceScore: 0.72,
          riskLevel: 'low',
          title: 'Baixa atratividade criativa frente a conta',
          summary: 'O CTR caiu, mas o retorno final permanece sustentado.',
          diagnosis: 'Existe sinal de queda de atratividade sem colapso de ROAS.',
          primaryHypothesis: 'A copy perdeu forca relativa e pede refresh.',
          recommendedAction: buildAction(
            'review_creative',
            'Atualizar copy e variacoes criativas mantendo monitoramento do retorno.',
            { actionTarget: 'campaign:2007' },
          ),
          expectedImpact: 'Recuperar taxa de clique sem comprometer a eficiencia.',
          technicalExplanation: 'O CTR enfraqueceu frente ao baseline enquanto o ROAS permaneceu sustentado.',
          executiveExplanation: 'Os anuncios perderam um pouco de atratividade, mas ainda geram resultado.',
          evidence: [
            evidence('ev-1007-1', 'ctr', 0.015),
            evidence('ev-1007-2', 'roas', 4),
          ],
          dataGaps: [],
          tags: ['creative', 'ctr'],
        }),
      ],
    }),
  });

  const result = await harness.orchestrator.runAnalysis('1007');
  assertExecutionOrder(result, harness.persistence, '1007');
  const creativeOutput = findOutput(result, 'creative_performance');

  assert.ok(
    creativeOutput.findings.some(
      (finding) => finding.title === 'Baixa atratividade criativa frente a conta',
    ),
  );
  assert.ok(
    creativeOutput.findings.every(
      (finding) => finding.title !== 'Sinal de fadiga criativa ou perda de atratividade',
    ),
  );

  const reviewerOutput = findOutput(result, 'hypothesis_reviewer');
  assert.ok(
    reviewerOutput.findings.every(
      (finding) =>
        finding.hypothesis_status === 'plausible' ||
        finding.hypothesis_status === 'confirmed' ||
        finding.hypothesis_status === 'weak',
    ),
  );
  assert.ok(
    result.summary.executive_summary.toLowerCase().includes('creative stable roas'),
  );
});

test('Scenario 7: conflito entre agentes reduz confianca e exige revisao', async () => {
  const harness = createHarness(
    {
      '1008': createScenario({
        analysisRunId: '1008',
        accountCurrent: metrics(1_300, 25_000, 360, 24, 6_200),
        accountBaseline: metrics(1_100, 23_000, 320, 18, 4_500),
        windowComparisons: scalingWindows(),
        campaignsCurrent: [
          campaign('2008', 'Conflict Campaign', metrics(650, 10_000, 140, 12, 3_250), 0.42),
          campaign('2009', 'Support Campaign', metrics(650, 15_000, 220, 12, 2_950), 0.79),
        ],
        campaignsBaseline: [
          campaign('2008', 'Conflict Campaign', metrics(470, 8_800, 108, 9, 2_300), 0.45),
          campaign('2009', 'Support Campaign', metrics(630, 14_200, 212, 11, 2_650), 0.8),
        ],
      }),
    },
    {
      accountAuditorAgent: createNoopAgent('account_auditor'),
      campaignStrategistAgent: createStubFindingAgent({
        agentName: 'campaign_strategist',
        summary: 'Campanha sugere escala taticamente.',
        recommendedFocus: 'Escalar campanha com cautela.',
        findingsBuilder: () => [
          buildFinding({
            sourceAgent: 'campaign_strategist',
            entityType: 'campaign',
            entityId: '2008',
            entityLabel: 'Conflict Campaign',
            category: 'campaign_efficiency',
            severity: 'info',
            priorityScore: 84,
            confidenceScore: 0.83,
            riskLevel: 'medium',
            title: 'Campanha com espaco para escalar',
            summary: 'A campanha aponta oportunidade de crescimento.',
            diagnosis: 'Os sinais de eficiencia sugerem ganho de volume.',
            primaryHypothesis: 'A campanha pode absorver mais verba.',
            recommendedAction: buildAction(
              'scale',
              'Expandir investimento de forma gradual.',
              { actionTarget: 'campaign:2008' },
            ),
            expectedImpact: 'Ganhar volume adicional com eficiencia competitiva.',
            technicalExplanation: 'Os indicadores gerais de campanha sustentam teste de escala.',
            executiveExplanation: 'A campanha parece pronta para receber mais investimento.',
            evidence: [
              evidence('ev-1008-1', 'roas', 5),
              evidence('ev-1008-2', 'cpa', 54),
            ],
            dataGaps: [],
            tags: ['campaign', 'scale'],
          }),
        ],
      }),
      segmentationSpecialistAgent: createNoopAgent('segmentation_specialist'),
      searchTermsSpecialistAgent: createNoopAgent('search_terms_specialist'),
      creativePerformanceAgent: createStubFindingAgent({
        agentName: 'creative_performance',
        summary: 'Criativo da campanha pede contencao antes de expandir.',
        recommendedFocus: 'Frear escala e revisar criativo.',
        findingsBuilder: () => [
          buildFinding({
            sourceAgent: 'creative_performance',
            entityType: 'campaign',
            entityId: '2008',
            entityLabel: 'Conflict Campaign',
            category: 'campaign_efficiency',
            severity: 'warning',
            priorityScore: 80,
            confidenceScore: 0.81,
            riskLevel: 'medium',
            title: 'Campanha com atrito criativo pede contencao',
            summary: 'A leitura criativa indica cautela antes de ampliar verba.',
            diagnosis: 'Existe friccao criativa que pode derrubar eficiencia se houver escala imediata.',
            primaryHypothesis: 'O criativo nao sustenta expansao sem revisao.',
            recommendedAction: buildAction(
              'reduce',
              'Segurar escala e revisar copy antes de ampliar investimento.',
              { actionTarget: 'campaign:2008' },
            ),
            expectedImpact: 'Evitar aumento de desperdicio em caso de criativo fragil.',
            technicalExplanation: 'O componente criativo sugere risco adicional para uma escala imediata.',
            executiveExplanation: 'Antes de investir mais, faz sentido revisar a mensagem dessa campanha.',
            evidence: [
              evidence('ev-1008-3', 'ctr', 0.012),
              evidence('ev-1008-4', 'conversion_rate', 0.018),
            ],
            dataGaps: [],
            tags: ['campaign', 'creative', 'conflict'],
          }),
        ],
      }),
      dedupeService: createConflictInjectingDedupeService({
        entityId: '2008',
        entityType: 'campaign',
        conflictType: 'hard_action_conflict',
        sourceAgents: ['campaign_strategist', 'creative_performance'],
      }),
    },
  );

  const result = await harness.orchestrator.runAnalysis('1008');
  assertExecutionOrder(result, harness.persistence, '1008');
  const reviewerOutput = findOutput(result, 'hypothesis_reviewer');
  const conflictFinding = reviewerOutput.findings.find((finding) =>
    finding.data_gaps.includes('hard_agent_conflict'),
  );

  assert.ok(conflictFinding);
  assert.ok(conflictFinding.confidence_score < 0.82);
  assert.ok(
    conflictFinding.hypothesis_status === 'plausible' ||
      conflictFinding.hypothesis_status === 'weak' ||
      conflictFinding.hypothesis_status === 'insufficient_evidence',
  );
  assert.ok(conflictFinding.data_gaps.includes('hard_agent_conflict'));

  const conflicts = harness.persistence.conflictsByRun.get('1008') ?? [];
  assert.ok(conflicts.some((conflict) => conflict.conflictType === 'hard_action_conflict'));
  assert.ok(
    result.summary.executive_headline.length > 0 &&
      result.summary.report_narrative.length > 0,
  );
});

class InMemoryFeatureReaderRepository {
  public constructor(
    private readonly scenarios: Readonly<Record<string, IntegrationScenario>>,
  ) {}

  public async loadRunContext(
    analysisRunId: string,
  ): Promise<PerformanceAnalysisRunContext> {
    const scenario = this.scenarios[analysisRunId];

    if (scenario === undefined) {
      throw new Error(`Missing integration scenario for ${analysisRunId}.`);
    }

    return structuredClone(scenario.runContext);
  }

  public async loadFeatureBundle(
    runContext: PerformanceAnalysisRunContext,
  ): Promise<PerformanceFeatureBundle> {
    const scenario = this.scenarios[runContext.analysisRunId];

    if (scenario === undefined) {
      throw new Error(`Missing integration scenario for ${runContext.analysisRunId}.`);
    }

    return structuredClone(scenario.featureBundle);
  }
}

class InMemoryPerformanceAgentPersistenceService {
  public readonly analysisRuns = new Map<
    string,
    {
      status: 'queued' | 'running' | 'completed' | 'failed';
      orchestratorRunUuid: string | null;
      summaryJson: unknown | null;
    }
  >();

  public readonly agentExecutionOrder = new Map<string, string[]>();
  public readonly agentOutputsByRun = new Map<string, AgentOutputHistoryRecord[]>();
  public readonly conflictsByRun = new Map<
    string,
    ReadonlyArray<{
      readonly entityType: string;
      readonly entityId: string;
      readonly conflictType: string;
      readonly sourceAgents: readonly string[];
      readonly resolution: string;
    }>
  >();
  public readonly snapshotsByRun = new Map<string, InsightSnapshotRecord[]>();
  public readonly insightsByKey = new Map<string, PersistedInsightRecord>();

  private nextAgentRunId = 1;
  private nextInsightId = 1;
  private nextVersionId = 1;

  public constructor(runIds: readonly string[]) {
    for (const runId of runIds) {
      this.analysisRuns.set(runId, {
        status: 'queued',
        orchestratorRunUuid: null,
        summaryJson: null,
      });
      this.agentExecutionOrder.set(runId, []);
      this.agentOutputsByRun.set(runId, []);
      this.snapshotsByRun.set(runId, []);
    }
  }

  public async beginAnalysisRun(input: {
    readonly analysisRunId: string;
    readonly orchestratorRunUuid: string;
  }): Promise<void> {
    const run = this.analysisRuns.get(input.analysisRunId);

    if (run === undefined) {
      throw new Error(`analysis_run_id ${input.analysisRunId} nao encontrado.`);
    }

    if (run.status === 'running') {
      throw new Error('analysis run ja em execucao.');
    }

    if (run.status === 'completed') {
      throw new Error('analysis run ja concluido.');
    }

    run.status = 'running';
    run.orchestratorRunUuid = input.orchestratorRunUuid;
  }

  public async completeAnalysisRun(input: {
    readonly analysisRunId: string;
    readonly status: 'completed' | 'failed';
    readonly summaryJson?: unknown | null;
  }): Promise<void> {
    const run = this.analysisRuns.get(input.analysisRunId);

    if (run === undefined) {
      throw new Error(`analysis_run_id ${input.analysisRunId} nao encontrado.`);
    }

    run.status = input.status;

    if (input.summaryJson !== undefined) {
      run.summaryJson = structuredClone(input.summaryJson);
    }
  }

  public async persistAgentRunStart(
    input: PersistAgentRunStartInput,
  ): Promise<PersistedAgentRunRecord> {
    const agentRunId = String(this.nextAgentRunId++);
    const bucket = this.agentExecutionOrder.get(input.analysisRunId);

    if (bucket === undefined) {
      throw new Error(`analysis_run_id ${input.analysisRunId} nao encontrado.`);
    }

    bucket.push(input.agentName);

    const outputs = this.agentOutputsByRun.get(input.analysisRunId);
    outputs?.push({
      agentRunId,
      analysisRunId: input.analysisRunId,
      agentName: input.agentName,
      agentVersion: input.agentVersion,
      status: 'running',
      priorityScore: null,
      confidenceScore: null,
      summary: null,
      recommendedFocus: null,
      outputHash: null,
      findingsCount: 0,
    });

    return {
      agentRunId,
      dedupeKey: input.dedupeKey,
    };
  }

  public async persistAgentRunFailure(
    input: PersistAgentRunFailureInput,
  ): Promise<void> {
    const record = this.findAgentRunRecord(input.agentRunId);
    record.status = input.status;
    record.priorityScore = input.priorityScore;
    record.confidenceScore = input.confidenceScore;
    record.summary = input.summary;
    record.outputHash = null;
  }

  public async persistAgentRunSuccess(
    input: PersistAgentRunSuccessInput,
  ): Promise<void> {
    const record = this.findAgentRunRecord(input.agentRunId);
    record.status = input.output.status;
    record.priorityScore = input.output.priority_score;
    record.confidenceScore = input.output.confidence_score;
    record.summary = input.output.summary;
    record.recommendedFocus = input.output.recommended_focus;
    record.outputHash = input.output.output_hash;
    record.findingsCount = input.output.findings.length;
    record.output = structuredClone(input.output);
  }

  public async persistConflicts(input: {
    readonly analysisRunId: string;
    readonly conflicts: readonly {
      readonly entityType: string;
      readonly entityId: string;
      readonly conflictType: string;
      readonly sourceAgents: readonly string[];
      readonly resolution: string;
    }[];
  }): Promise<void> {
    this.conflictsByRun.set(input.analysisRunId, structuredClone(input.conflicts));
  }

  public async upsertConsolidatedInsights(
    records: readonly PerformanceInsightUpsertRecord[],
  ): Promise<number> {
    for (const record of records) {
      const key = createDeterministicHash({
        tenantId: record.consolidatedInsight.tenantId,
        clientId: record.consolidatedInsight.clientId,
        entityType: record.consolidatedInsight.entityType,
        entityId: record.consolidatedInsight.entityId,
        category: record.consolidatedInsight.category,
        actionType: record.consolidatedInsight.recommendedAction.actionType,
      });
      const contentHash = createDeterministicHash({
        title: record.consolidatedInsight.title,
        summary: record.consolidatedInsight.summary,
        diagnosis: record.consolidatedInsight.diagnosis,
        hypothesisStatus: record.consolidatedInsight.hypothesisStatus,
        recommendedAction: record.consolidatedInsight.recommendedAction,
        technicalExplanation: record.consolidatedInsight.technicalExplanation,
        executiveExplanation: record.consolidatedInsight.executiveExplanation,
        evidenceJson: record.consolidatedInsight.evidenceJson,
        reviewNotes: record.consolidatedInsight.reviewNotes,
      });
      const payload = toConsolidatedInsightPayload(record.consolidatedInsight, key);
      const payloadHash = createDeterministicHash(payload);
      const existing = this.insightsByKey.get(key);

      if (existing === undefined) {
        const insightId = String(this.nextInsightId++);
        const versionId = String(this.nextVersionId++);
        this.insightsByKey.set(key, {
          insightId,
          currentVersionNumber: 1,
          latestRunId: record.sourceRunId,
          versions: [
            {
              versionId,
              versionNumber: 1,
              contentHash,
              payloadHash,
              payload,
            },
          ],
          latestPayload: payload,
        });

        this.pushRunSnapshot(record.sourceRunId, {
          insightId,
          versionId,
          versionNumber: 1,
          insightKey: key,
          entityType: record.consolidatedInsight.entityType,
          entityId: record.consolidatedInsight.entityId,
          entityLabel: record.consolidatedInsight.entityLabel,
          title: record.consolidatedInsight.title,
          hypothesisStatus: record.consolidatedInsight.hypothesisStatus,
          category: record.consolidatedInsight.category,
          severity: record.consolidatedInsight.severity,
          priorityScore: record.consolidatedInsight.priorityScore,
          confidenceScore: record.consolidatedInsight.confidenceScore,
          runChangeType: 'new',
          contentHash,
          payloadHash,
          payload,
        });

        continue;
      }

      const latestVersion = existing.versions[existing.versions.length - 1];
      const unchanged = latestVersion?.contentHash === contentHash;

      let versionId = latestVersion?.versionId ?? null;
      let versionNumber = existing.currentVersionNumber;

      if (!unchanged) {
        versionId = String(this.nextVersionId++);
        versionNumber = existing.currentVersionNumber + 1;
        existing.currentVersionNumber = versionNumber;
        existing.versions.push({
          versionId,
          versionNumber,
          contentHash,
          payloadHash,
          payload,
        });
      }

      existing.latestRunId = record.sourceRunId;
      existing.latestPayload = payload;

      this.pushRunSnapshot(record.sourceRunId, {
        insightId: existing.insightId,
        versionId,
        versionNumber,
        insightKey: key,
        entityType: record.consolidatedInsight.entityType,
        entityId: record.consolidatedInsight.entityId,
        entityLabel: record.consolidatedInsight.entityLabel,
        title: record.consolidatedInsight.title,
        hypothesisStatus: record.consolidatedInsight.hypothesisStatus,
        category: record.consolidatedInsight.category,
        severity: record.consolidatedInsight.severity,
        priorityScore: record.consolidatedInsight.priorityScore,
        confidenceScore: record.consolidatedInsight.confidenceScore,
        runChangeType: unchanged ? 'unchanged' : 'updated',
        contentHash,
        payloadHash,
        payload,
      });
    }

    return records.length;
  }

  private findAgentRunRecord(agentRunId: string): AgentOutputHistoryRecord {
    for (const outputs of this.agentOutputsByRun.values()) {
      const record = outputs.find((item) => item.agentRunId === agentRunId);

      if (record !== undefined) {
        return record;
      }
    }

    throw new Error(`agent_run_id ${agentRunId} nao encontrado.`);
  }

  private pushRunSnapshot(
    analysisRunId: string,
    snapshot: InsightSnapshotRecord,
  ): void {
    const bucket = this.snapshotsByRun.get(analysisRunId);

    if (bucket === undefined) {
      throw new Error(`analysis_run_id ${analysisRunId} nao encontrado.`);
    }

    bucket.push(snapshot);
  }
}

function createHarness(
  scenarios: Readonly<Record<string, IntegrationScenario>>,
  options?: {
    readonly dedupeService?: Pick<PerformanceAgentDedupeService, 'dedupeFindings'>;
    readonly accountAuditorAgent?: PerformanceAnalysisAgent;
    readonly campaignStrategistAgent?: PerformanceAnalysisAgent;
    readonly segmentationSpecialistAgent?: PerformanceAnalysisAgent;
    readonly searchTermsSpecialistAgent?: PerformanceAnalysisAgent;
    readonly creativePerformanceAgent?: PerformanceAnalysisAgent;
  },
) {
  const featureReader = new InMemoryFeatureReaderRepository(scenarios);
  const runtimeConfig = new PerformanceAgentRuntimeConfigService();
  const payloadBuilder = new PerformanceAgentPayloadBuilderService();
  const persistence = new InMemoryPerformanceAgentPersistenceService(
    Object.keys(scenarios),
  );
  const dedupeService =
    options?.dedupeService ?? new PerformanceAgentDedupeService();

  const orchestrator = new PerformanceAgentOrchestratorService(
    featureReader as never,
    runtimeConfig,
    payloadBuilder,
    dedupeService as never,
    persistence as never,
    (options?.accountAuditorAgent ?? new AccountAuditorAgent()) as never,
    (options?.campaignStrategistAgent ?? new CampaignStrategistAgent()) as never,
    (options?.segmentationSpecialistAgent ??
      new SegmentationSpecialistAgent()) as never,
    (options?.searchTermsSpecialistAgent ??
      new SearchTermsSpecialistAgent()) as never,
    (options?.creativePerformanceAgent ??
      new CreativePerformanceAgent()) as never,
    new HypothesisReviewerAgent(),
    new ExecutiveSummaryAgent(),
  );

  return { orchestrator, persistence };
}

function createConflictInjectingDedupeService(input: {
  readonly entityType: string;
  readonly entityId: string;
  readonly conflictType: 'soft_action_conflict' | 'hard_action_conflict';
  readonly sourceAgents: readonly PerformanceAgentName[];
}): Pick<PerformanceAgentDedupeService, 'dedupeFindings'> {
  const base = new PerformanceAgentDedupeService();

  return {
    dedupeFindings(findings) {
      const deduped = base.dedupeFindings(findings);
      const target = deduped.findings.find(
        (finding) =>
          finding.entity_type === input.entityType &&
          finding.entity_id === input.entityId,
      );

      if (target === undefined) {
        return deduped;
      }

      return {
        ...deduped,
        conflicts: [
          ...deduped.conflicts,
          {
            entityType: input.entityType,
            entityId: input.entityId,
            conflictType: input.conflictType,
            sourceAgents: input.sourceAgents,
            resolution:
              'Conflito sintetico de integracao para validar revisao do reviewer.',
          },
        ],
      };
    },
  };
}

function createNoopAgent(
  agentName: PerformanceAgentName,
): PerformanceAnalysisAgent {
  return {
    agentName,
    isRequired: false,
    async execute(input: AgentInput) {
      return buildAgentOutput({
        agentName,
        agentVersion: input.agent_version,
        executionContext: input.execution_context,
        analysisWindow: input.analysis_window,
        status: 'skipped',
        priorityScore: 0,
        confidenceScore: 0.45,
        dataQuality: input.data_quality,
        summary: `Sem alertas para ${agentName}.`,
        recommendedFocus: null,
        candidateEntityIds: [],
        findings: [],
        entitiesEvaluated: 0,
        findingsSuppressed: 0,
      });
    },
  };
}

function createStubFindingAgent(input: {
  readonly agentName: PerformanceAgentName;
  readonly findingsBuilder: (input: AgentInput) => readonly AgentFinding[];
  readonly summary: string;
  readonly recommendedFocus: string | null;
}): PerformanceAnalysisAgent {
  return {
    agentName: input.agentName,
    isRequired: false,
    async execute(agentInput: AgentInput) {
      const findings = input.findingsBuilder(agentInput);

      return buildAgentOutput({
        agentName: input.agentName,
        agentVersion: agentInput.agent_version,
        executionContext: agentInput.execution_context,
        analysisWindow: agentInput.analysis_window,
        status: findings.length > 0 ? 'ready' : 'skipped',
        priorityScore: findings[0]?.priority_score ?? 0,
        confidenceScore: findings[0]?.confidence_score ?? 0.45,
        dataQuality: agentInput.data_quality,
        summary: input.summary,
        recommendedFocus: input.recommendedFocus,
        candidateEntityIds: findings.map((finding) => finding.entity_id),
        findings,
        entitiesEvaluated: findings.length,
        findingsSuppressed: 0,
      });
    },
  };
}

function createScenario(input: {
  readonly analysisRunId: string;
  readonly accountCurrent: MetricsShape;
  readonly accountBaseline: MetricsShape;
  readonly windowComparisons: readonly AccountWindowComparison[];
  readonly campaignsCurrent?: readonly ReturnType<typeof campaign>[];
  readonly campaignsBaseline?: readonly ReturnType<typeof campaign>[];
  readonly segmentationCurrent?: readonly ReturnType<typeof segment>[];
  readonly segmentationBaseline?: readonly ReturnType<typeof segment>[];
  readonly searchTermsAvailable?: boolean;
  readonly searchTermsCurrent?: readonly ReturnType<typeof searchTerm>[];
  readonly searchTermsBaseline?: readonly ReturnType<typeof searchTerm>[];
}): IntegrationScenario {
  const runContext: PerformanceAnalysisRunContext = {
    analysisRunId: input.analysisRunId,
    tenantId: '1',
    tenantName: 'Tenant Teste',
    clientId: '10',
    clientName: 'Cliente Demo',
    accountId: '9001',
    periodStart: '2026-04-01',
    periodEnd: '2026-04-07',
    baselineStart: '2026-03-25',
    baselineEnd: '2026-03-31',
    comparisonLabel: 'last_7d vs previous_7d',
    triggeredByUserId: null,
    generatedBy: 'system',
  };

  const featureBundle: PerformanceFeatureBundle = {
    account_summary_current: input.accountCurrent,
    account_summary_baseline: input.accountBaseline,
    account_window_comparisons: input.windowComparisons,
    campaign_summaries_current: input.campaignsCurrent ?? [],
    campaign_summaries_baseline: input.campaignsBaseline ?? [],
    segmentation_rows_current: input.segmentationCurrent ?? [],
    segmentation_rows_baseline: input.segmentationBaseline ?? [],
    search_terms_available: input.searchTermsAvailable ?? false,
    search_term_rows_current: input.searchTermsCurrent ?? [],
    search_term_rows_baseline: input.searchTermsBaseline ?? [],
    sync_health: {
      overallStatus: 'healthy',
      lastSuccessfulSyncAt: '2026-04-08T02:00:00.000Z',
      lastFailedSyncAt: null,
      queuedJobs: 0,
      failedJobs: 0,
      openIssues: 0,
    },
  };

  return {
    runContext,
    featureBundle,
  };
}

function metrics(
  spend: number,
  impressions: number,
  clicks: number,
  conversions: number,
  conversionValue: number,
): MetricsShape {
  return {
    spend,
    impressions,
    clicks,
    conversions,
    conversionValue,
    ctr: impressions > 0 ? round(clicks / impressions, 4) : null,
    cpa: conversions > 0 ? round(spend / conversions, 2) : null,
    roas: spend > 0 ? round(conversionValue / spend, 2) : null,
  };
}

function campaign(
  campaignId: string,
  campaignName: string,
  metricShape: MetricsShape,
  searchImpressionShare: number | null,
) {
  return {
    campaignId,
    campaignName,
    status: 'ENABLED',
    searchImpressionShare,
    ...metricShape,
  };
}

function segment(
  campaignId: string,
  campaignName: string,
  dimension: 'device' | 'geo' | 'schedule' | 'day_of_week',
  dimensionValue: string,
  metricShape: MetricsShape,
) {
  return {
    campaignId,
    campaignName,
    dimension,
    dimensionValue,
    ...metricShape,
  };
}

function searchTerm(
  campaignId: string,
  campaignName: string,
  term: string,
  metricShape: MetricsShape,
) {
  return {
    campaignId,
    campaignName,
    searchTerm: term,
    ...metricShape,
  };
}

function evidence(
  evidenceId: string,
  metric: string,
  currentValue: number,
): AgentFinding['evidence'][number] {
  return {
    evidence_id: evidenceId,
    metric,
    current_value: currentValue,
    baseline_value: null,
    delta_pct: null,
    threshold_value: null,
    window: 'analysis_run',
    scope_label: 'Escopo integrado',
    source_table: 'fact_google_ads_campaign_daily',
    note: `Evidencia ${metric}`,
  };
}

function stableWindows(): readonly AccountWindowComparison[] {
  return [
    comparison('last_7d', 7, metrics(900, 16_000, 240, 15, 3_000), metrics(890, 15_900, 238, 15, 2_980)),
    comparison('last_14d', 14, metrics(1_760, 31_000, 478, 30, 5_980), metrics(1_740, 30_800, 474, 30, 5_920)),
    comparison('last_30d', 30, metrics(3_900, 67_000, 1_030, 64, 12_500), metrics(3_850, 66_000, 1_012, 63, 12_320)),
  ];
}

function deteriorationWindows(): readonly AccountWindowComparison[] {
  return [
    comparison('last_7d', 7, metrics(1_200, 20_000, 300, 10, 2_400), metrics(1_000, 18_000, 280, 16, 4_000)),
    comparison('last_14d', 14, metrics(2_320, 39_000, 580, 18, 4_400), metrics(1_980, 36_500, 550, 30, 7_200)),
    comparison('last_30d', 30, metrics(4_700, 82_000, 1_200, 42, 10_000), metrics(4_200, 78_000, 1_150, 65, 15_400)),
  ];
}

function scalingWindows(): readonly AccountWindowComparison[] {
  return [
    comparison('last_7d', 7, metrics(1_400, 30_000, 420, 28, 8_400), metrics(1_250, 27_500, 390, 22, 6_380)),
    comparison('last_14d', 14, metrics(2_720, 57_000, 810, 52, 15_800), metrics(2_500, 53_000, 760, 42, 12_100)),
    comparison('last_30d', 30, metrics(5_800, 118_000, 1_720, 108, 31_000), metrics(5_400, 112_000, 1_610, 90, 25_400)),
  ];
}

function comparison(
  windowLabel: 'last_7d' | 'last_14d' | 'last_30d',
  sampleDays: 7 | 14 | 30,
  current: MetricsShape,
  baseline: MetricsShape,
): AccountWindowComparison {
  return {
    windowLabel,
    sampleDays,
    current,
    baseline,
  };
}

function findOutput(
  result: PerformanceAgentExecutionResult,
  agentName: AgentOutput['agent_name'],
): AgentOutput {
  const output = result.agentOutputs.find((item) => item.agent_name === agentName);

  if (output === undefined) {
    throw new Error(`Agent output ${agentName} nao encontrado.`);
  }

  return output;
}

function assertExecutionOrder(
  result: PerformanceAgentExecutionResult,
  persistence: InMemoryPerformanceAgentPersistenceService,
  analysisRunId: string,
): void {
  assert.deepEqual(
    result.agentOutputs.map((output) => output.agent_name),
    EXPECTED_AGENT_ORDER,
  );
  assert.deepEqual(
    persistence.agentExecutionOrder.get(analysisRunId),
    EXPECTED_AGENT_ORDER,
  );
}

function round(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function toConsolidatedInsightPayload(
  draft: PerformanceInsightUpsertRecord['consolidatedInsight'],
  insightKey: string,
): ConsolidatedInsight {
  return {
    insight_id: createDeterministicHash({
      insight_key: insightKey,
      generated_at: draft.generatedAt,
    }).slice(0, 24),
    insight_key: insightKey,
    tenant_id: draft.tenantId,
    client_id: draft.clientId,
    account_id: draft.accountId,
    entity_type: draft.entityType,
    entity_id: draft.entityId,
    entity_label: draft.entityLabel,
    category: draft.category,
    severity: draft.severity,
    priority_band: draft.priorityBand,
    priority_score: draft.priorityScore,
    confidence_band: draft.confidenceBand,
    confidence_score: draft.confidenceScore,
    risk_level: draft.riskLevel,
    source_agent_names: draft.sourceAgentNames,
    title: draft.title,
    summary: draft.summary,
    diagnosis: draft.diagnosis,
    primary_hypothesis: draft.primaryHypothesis,
    alternative_hypotheses: draft.alternativeHypotheses,
    hypothesis_status: draft.hypothesisStatus,
    recommended_action: {
      action_type: draft.recommendedAction.actionType,
      action_target: draft.recommendedAction.actionTarget,
      description: draft.recommendedAction.description,
      execution_mode: 'manual',
    },
    expected_impact: draft.expectedImpact,
    technical_explanation: draft.technicalExplanation,
    executive_explanation: draft.executiveExplanation,
    evidence: draft.evidenceJson,
    review_notes: draft.reviewNotes,
    supporting_finding_ids: [],
    blocked_claims: draft.blockedClaims,
    next_steps: draft.nextSteps,
    analysis_window: draft.analysisWindow,
    data_quality: draft.dataQuality,
    generated_at: draft.generatedAt,
  };
}

interface IntegrationScenario {
  readonly runContext: PerformanceAnalysisRunContext;
  readonly featureBundle: PerformanceFeatureBundle;
}

interface AgentOutputHistoryRecord {
  readonly agentRunId: string;
  readonly analysisRunId: string;
  readonly agentName: AgentOutput['agent_name'];
  readonly agentVersion: string;
  status: string;
  priorityScore: number | null;
  confidenceScore: number | null;
  summary: string | null;
  recommendedFocus: string | null;
  outputHash: string | null;
  findingsCount: number;
  output?: AgentOutput;
}

interface PersistedInsightVersionRecord {
  readonly versionId: string;
  readonly versionNumber: number;
  readonly contentHash: string;
  readonly payloadHash: string;
  readonly payload: ConsolidatedInsight;
}

interface PersistedInsightRecord {
  readonly insightId: string;
  currentVersionNumber: number;
  latestRunId: string;
  latestPayload: ConsolidatedInsight;
  readonly versions: PersistedInsightVersionRecord[];
}

interface InsightSnapshotRecord {
  readonly insightId: string;
  readonly versionId: string | null;
  readonly versionNumber: number;
  readonly insightKey: string;
  readonly entityType: string;
  readonly entityId: string;
  readonly entityLabel: string | null;
  readonly title: string;
  readonly hypothesisStatus: AgentFinding['hypothesis_status'];
  readonly category: string;
  readonly severity: string;
  readonly priorityScore: number;
  readonly confidenceScore: number;
  readonly runChangeType: 'new' | 'updated' | 'unchanged';
  readonly contentHash: string;
  readonly payloadHash: string;
  readonly payload: ConsolidatedInsight;
}

type MetricsShape = {
  readonly spend: number;
  readonly impressions: number;
  readonly clicks: number;
  readonly conversions: number;
  readonly conversionValue: number;
  readonly ctr: number | null;
  readonly cpa: number | null;
  readonly roas: number | null;
};
