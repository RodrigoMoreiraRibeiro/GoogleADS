const fs = require('node:fs');
const path = require('node:path');

const PptxGenJS = require('pptxgenjs');

const pptx = new PptxGenJS();

const COLORS = {
  ink: '142033',
  navy: '101823',
  navySoft: '1B2940',
  paper: 'FCFBF7',
  sand: 'F3EFE6',
  line: 'D8D2C8',
  accent: 'C5723D',
  accentStrong: 'A85528',
  success: '0F766E',
  warning: '9A3412',
  slate: '66758A',
  white: 'FFFFFF',
};

const OUTPUT_DIR = path.join(
  __dirname,
  '..',
  'artifacts',
  'presentations',
);
const OUTPUT_FILE = path.join(
  OUTPUT_DIR,
  'google-ads-saas-apresentacao-comercial.pptx',
);

pptx.layout = 'LAYOUT_WIDE';
pptx.author = 'OpenAI Codex';
pptx.company = 'Google Ads SaaS';
pptx.subject = 'Apresentacao comercial para potencial cliente';
pptx.title = 'Google Ads SaaS | Apresentacao Comercial';
pptx.lang = 'pt-BR';
pptx.theme = {
  headFontFace: 'Aptos Display',
  bodyFontFace: 'Aptos',
  lang: 'pt-BR',
};

const slides = [
  addCoverSlide,
  addProblemSlide,
  addSolutionSlide,
  addWorkflowSlide,
  addOptimizationAgentSlide,
  addExecutiveReportingSlide,
  addSecuritySlide,
  addPilotSlide,
];

async function main() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  slides.forEach((buildSlide, index) => buildSlide(index + 1, slides.length));

  await pptx.writeFile({ fileName: OUTPUT_FILE });
  process.stdout.write(`${OUTPUT_FILE}\n`);
}

function addCoverSlide(index, total) {
  const slide = pptx.addSlide();

  slide.background = { color: COLORS.paper };
  slide.addShape(pptx.ShapeType.rect, {
    x: 0,
    y: 0,
    w: 4.15,
    h: 7.5,
    fill: { color: COLORS.navy },
    line: { color: COLORS.navy },
  });
  slide.addShape(pptx.ShapeType.rect, {
    x: 4.15,
    y: 0,
    w: 9.18,
    h: 7.5,
    fill: {
      color: COLORS.paper,
      transparency: 0,
    },
    line: { color: COLORS.paper },
  });

  addTag(slide, 0.55, 0.45, 2.5, 'APRESENTACAO COMERCIAL', {
    fill: COLORS.navySoft,
    text: COLORS.white,
  });
  slide.addText('GOOGLE ADS SAAS', {
    x: 0.55,
    y: 1.05,
    w: 2.7,
    h: 0.4,
    fontFace: 'Aptos',
    fontSize: 17,
    bold: true,
    color: COLORS.white,
    charSpace: 1.2,
  });
  slide.addText('Plataforma SaaS em nuvem para analytics, insights e relatorios executivos', {
    x: 0.55,
    y: 1.65,
    w: 2.7,
    h: 1.5,
    fontFace: 'Aptos Display',
    fontSize: 26,
    bold: true,
    color: COLORS.white,
    valign: 'mid',
  });
  slide.addText(
    'Uma plataforma SaaS em nuvem com arquitetura local-first: centraliza contas Google Ads, reduz retrabalho operacional e transforma dados em recomendacoes claras para gestor e cliente final.',
    {
      x: 0.55,
      y: 3.3,
      w: 2.9,
      h: 1.15,
      fontFace: 'Aptos',
      fontSize: 12.5,
      color: 'E7ECF2',
      breakLine: false,
      margin: 0,
      valign: 'mid',
    },
  );

  addMetricChip(slide, 0.55, 5.1, 'MULTI-TENANT REAL');
  addMetricChip(slide, 0.55, 5.62, 'SAAS EM NUVEM');
  addMetricChip(slide, 0.55, 6.14, 'INSIGHTS EXPLICAVEIS');

  slide.addText('O problema nao e so ler metricas. O valor esta em interpretar, priorizar e explicar o que fazer depois.', {
    x: 4.65,
    y: 1.1,
    w: 7.6,
    h: 0.9,
    fontFace: 'Aptos Display',
    fontSize: 28,
    bold: true,
    color: COLORS.ink,
  });
  slide.addText(
    'Este produto foi desenhado para agencias e gestores que querem uma operacao segura, escalavel e mais convincente diante do cliente.',
    {
      x: 4.65,
      y: 2.1,
      w: 7.45,
      h: 0.7,
      fontFace: 'Aptos',
      fontSize: 14,
      color: COLORS.slate,
    },
  );

  addValueCard(
    slide,
    4.65,
    3.05,
    2.3,
    1.5,
    'Operacao',
    'Conecta multiplas contas, organiza clientes e sincroniza dados em uma base central da plataforma.',
  );
  addValueCard(
    slide,
    7.12,
    3.05,
    2.3,
    1.5,
    'Analise',
    'Aponta desperdicio, oportunidades e proximos passos com prioridade e confianca.',
  );
  addValueCard(
    slide,
    9.59,
    3.05,
    2.3,
    1.5,
    'Apresentacao',
    'Traduz performance em relatorios executivos claros para clientes leigos.',
  );

  addFooter(slide, index, total);
}

function addProblemSlide(index, total) {
  const slide = createContentSlide(
    'O problema que mais consome tempo e margem',
    'Hoje, a maior parte das agencias ainda perde energia em consolidacao manual, leitura fragmentada e relatorios que nao escalam.',
    index,
    total,
  );

  addProblemCard(
    slide,
    0.7,
    1.95,
    'Dependencia da interface do Google Ads',
    'Gestor precisa navegar conta por conta para entender o que mudou e o que precisa de acao.',
  );
  addProblemCard(
    slide,
    3.95,
    1.95,
    'API usada de forma ineficiente',
    'Dashboards que consultam em tempo real aumentam custo, latencia e risco de throttling.',
  );
  addProblemCard(
    slide,
    7.2,
    1.95,
    'Analise pouco padronizada',
    'Cada gestor explica resultado de um jeito, o que reduz consistencia e governanca.',
  );
  addProblemCard(
    slide,
    10.45,
    1.95,
    'Cliente final nao entende o relatorio',
    'Muito numero tecnico e pouco impacto de negocio tornam a apresentacao menos convincente.',
  );

  slide.addShape(pptx.ShapeType.roundRect, {
    x: 0.7,
    y: 5.25,
    w: 11.95,
    h: 1.15,
    rectRadius: 0.06,
    fill: { color: 'F8F2EA' },
    line: { color: 'E6D8C8' },
  });
  slide.addText('Resultado pratico: mais tempo montando contexto, menos tempo otimizando campanhas e menos valor percebido pelo cliente.', {
    x: 1.0,
    y: 5.58,
    w: 11.35,
    h: 0.4,
    fontSize: 18,
    bold: true,
    color: COLORS.accentStrong,
    align: 'center',
  });
}

function addSolutionSlide(index, total) {
  const slide = createContentSlide(
    'O que a plataforma entrega',
    'Uma plataforma em nuvem para operacao, diagnostico e narrativa executiva, sem depender da Google Ads API cada vez que alguem abre a tela.',
    index,
    total,
  );

  addSolutionColumn(
    slide,
    0.75,
    2.05,
    '1. Coleta controlada',
    [
      'Conecta multiplas contas Google Ads por tenant.',
      'Sincroniza via jobs agendados e checkpoints.',
      'Salva fatos e agregados em banco proprio.',
    ],
    COLORS.success,
  );
  addSolutionColumn(
    slide,
    4.45,
    2.05,
    '2. Analise com criterio',
    [
      'Compara periodos, campanhas e recortes.',
      'Prioriza gargalos e vencedores com evidencias.',
      'Gera recomendacoes explicaveis para o gestor.',
    ],
    COLORS.accent,
  );
  addSolutionColumn(
    slide,
    8.15,
    2.05,
    '3. Apresentacao profissional',
    [
      'Transforma dados em linguagem simples.',
      'Cria slides executivos prontos para cliente leigo.',
      'Eleva a percepcao de valor da operacao.',
    ],
    COLORS.navySoft,
  );

  slide.addText('Em vez de so mostrar metricas, o sistema organiza o fluxo completo: coleta, interpreta e comunica.', {
    x: 0.75,
    y: 6.2,
    w: 11.75,
    h: 0.4,
    fontSize: 17,
    bold: true,
    color: COLORS.ink,
    align: 'center',
  });
}

function addWorkflowSlide(index, total) {
  const slide = createContentSlide(
    'Como funciona na pratica',
    'A arquitetura foi pensada para seguranca, simplicidade operacional e velocidade de leitura para o time.',
    index,
    total,
  );

  const steps = [
    {
      title: 'Conectar',
      text: 'A agencia conecta contas Google Ads com OAuth seguro e escopo por tenant.',
    },
    {
      title: 'Sincronizar',
      text: 'Jobs agendados puxam dados incrementais e reprocessam janelas recentes.',
    },
    {
      title: 'Analisar',
      text: 'O motor detecta sintomas, prioriza oportunidades e sugere acoes.',
    },
    {
      title: 'Apresentar',
      text: 'Dashboards e decks leem a base operacional da plataforma e explicam o que aconteceu.',
    },
  ];

  steps.forEach((step, indexStep) => {
    const x = 0.85 + indexStep * 3.05;
    slide.addShape(pptx.ShapeType.roundRect, {
      x,
      y: 2.45,
      w: 2.6,
      h: 2.55,
      rectRadius: 0.05,
      fill: { color: COLORS.white },
      line: { color: COLORS.line, pt: 1.2 },
      shadow: {
        type: 'outer',
        color: 'D8D2C8',
        blur: 1,
        angle: 45,
        distance: 1,
        opacity: 0.15,
      },
    });
    slide.addShape(pptx.ShapeType.ellipse, {
      x: x + 0.18,
      y: 2.22,
      w: 0.42,
      h: 0.42,
      fill: { color: COLORS.accent },
      line: { color: COLORS.accent },
    });
    slide.addText(String(indexStep + 1), {
      x: x + 0.18,
      y: 2.285,
      w: 0.42,
      h: 0.2,
      align: 'center',
      fontSize: 12,
      bold: true,
      color: COLORS.white,
    });
    slide.addText(step.title, {
      x: x + 0.2,
      y: 2.8,
      w: 2.1,
      h: 0.4,
      fontSize: 20,
      bold: true,
      color: COLORS.ink,
    });
    slide.addText(step.text, {
      x: x + 0.2,
      y: 3.32,
      w: 2.15,
      h: 1.25,
      fontSize: 12.4,
      color: COLORS.slate,
      valign: 'mid',
      margin: 0,
    });

    if (indexStep < steps.length - 1) {
      slide.addShape(pptx.ShapeType.chevron, {
        x: x + 2.45,
        y: 3.45,
        w: 0.35,
        h: 0.35,
        fill: { color: 'E8DED2' },
        line: { color: 'E8DED2' },
      });
    }
  });

  slide.addText('Principio central: mesmo em nuvem, a tela nunca depende da Google Ads API em tempo real. O produto le da base operacional da plataforma e so agenda nova sync quando necessario.', {
    x: 0.9,
    y: 5.8,
    w: 11.7,
    h: 0.55,
    fontSize: 15.5,
    bold: true,
    color: COLORS.accentStrong,
    align: 'center',
  });
}

function addOptimizationAgentSlide(index, total) {
  const slide = createContentSlide(
    'O diferencial: um agente de otimizacao controlado',
    'A proposta nao e uma IA solta. Primeiro o sistema estrutura evidencias; depois a camada de IA traduz isso em recomendacoes legiveis.',
    index,
    total,
  );

  addValueCard(
    slide,
    0.8,
    2.2,
    3.7,
    1.35,
    'O que ele faz',
    'Mostra por que o CPA subiu, onde ha desperdicio e quais campanhas devem receber mais ou menos verba.',
  );
  addValueCard(
    slide,
    4.8,
    2.2,
    3.7,
    1.35,
    'Como decide',
    'Compara periodos, aplica regras, calcula prioridade e confianca e so entao gera narrativa.',
  );
  addValueCard(
    slide,
    8.8,
    2.2,
    3.7,
    1.35,
    'Como protege o negocio',
    'Nao executa alteracoes sozinho no MVP. Toda recomendacao pode ser auditada e revisada pelo gestor.',
  );

  slide.addShape(pptx.ShapeType.roundRect, {
    x: 0.8,
    y: 4.1,
    w: 12.0,
    h: 1.7,
    rectRadius: 0.04,
    fill: { color: COLORS.white },
    line: { color: COLORS.line },
  });
  slide.addText('Exemplo de saida para o gestor', {
    x: 1.05,
    y: 4.35,
    w: 2.3,
    h: 0.28,
    fontSize: 14,
    bold: true,
    color: COLORS.ink,
  });
  slide.addText('“Campanha acima do custo medio da conta. Reduzir 10% a 20% da verba e revisar termos, anuncios e landing page antes de reexpandir.”', {
    x: 1.05,
    y: 4.72,
    w: 10.95,
    h: 0.45,
    fontSize: 18,
    bold: true,
    color: COLORS.accentStrong,
    italic: true,
  });
  slide.addText('A plataforma tambem gera uma versao simplificada para o cliente final, sem jargao tecnico e com foco em impacto de negocio.', {
    x: 1.05,
    y: 5.22,
    w: 10.95,
    h: 0.3,
    fontSize: 12.5,
    color: COLORS.slate,
  });
}

function addExecutiveReportingSlide(index, total) {
  const slide = createContentSlide(
    'Relatorios executivos que parecem trabalho de agencia premium',
    'O sistema transforma resultado em uma apresentacao curta, clara e convincente, desenhada para quem nao domina trafego pago.',
    index,
    total,
  );

  const blocks = [
    {
      x: 0.85,
      title: 'O que mostra',
      lines: [
        'Quanto foi investido',
        'Qual resultado foi obtido',
        'O que funcionou melhor',
        'O que travou performance',
      ],
    },
    {
      x: 4.35,
      title: 'Como fala',
      lines: [
        'Menos jargao tecnico',
        'Mais impacto de negocio',
        'Uma mensagem por slide',
        'Tom profissional e confiavel',
      ],
    },
    {
      x: 7.85,
      title: 'O que melhora',
      lines: [
        'Reduz retrabalho manual',
        'Padroniza apresentacoes',
        'Aumenta percepcao de valor',
        'Facilita renovacao e upsell',
      ],
    },
  ];

  blocks.forEach((block) => {
    slide.addShape(pptx.ShapeType.roundRect, {
      x: block.x,
      y: 2.2,
      w: 2.95,
      h: 2.7,
      rectRadius: 0.05,
      fill: { color: COLORS.white },
      line: { color: COLORS.line },
    });
    slide.addText(block.title, {
      x: block.x + 0.2,
      y: 2.48,
      w: 2.5,
      h: 0.3,
      fontSize: 18,
      bold: true,
      color: COLORS.ink,
    });
    slide.addText(block.lines.map((line) => `- ${line}`).join('\n'), {
      x: block.x + 0.2,
      y: 2.95,
      w: 2.45,
      h: 1.55,
      fontSize: 12.5,
      color: COLORS.slate,
      breakLine: false,
      margin: 0,
      valign: 'mid',
    });
  });

  slide.addShape(pptx.ShapeType.roundRect, {
    x: 0.85,
    y: 5.35,
    w: 9.95,
    h: 0.95,
    rectRadius: 0.04,
    fill: { color: 'F8F2EA' },
    line: { color: 'F0E0D0' },
  });
  slide.addText('Deck mensal recomendado: resumo executivo, evolucao do periodo, vencedores, gargalos, plano de otimizacao e proximos passos.', {
    x: 1.1,
    y: 5.67,
    w: 9.4,
    h: 0.24,
    fontSize: 15,
    bold: true,
    color: COLORS.accentStrong,
    align: 'center',
  });

  slide.addShape(pptx.ShapeType.roundRect, {
    x: 11.1,
    y: 2.2,
    w: 1.6,
    h: 4.1,
    rectRadius: 0.04,
    fill: { color: COLORS.navy },
    line: { color: COLORS.navy },
  });
  slide.addText('CLIENTE', {
    x: 11.45,
    y: 2.65,
    w: 0.9,
    h: 0.25,
    rotate: 270,
    fontSize: 14,
    bold: true,
    color: COLORS.white,
    align: 'center',
  });
  slide.addText('Leitura simples\n+\nProximos passos', {
    x: 11.3,
    y: 3.35,
    w: 1.2,
    h: 1.1,
    rotate: 270,
    fontSize: 17,
    bold: true,
    color: 'F6EDE3',
    align: 'center',
    valign: 'mid',
  });
}

function addSecuritySlide(index, total) {
  const slide = createContentSlide(
    'Seguranca e governanca desde o desenho do produto',
    'Para atender multiplos clientes no mesmo ambiente, a plataforma foi pensada com isolamento forte, auditoria e controle operacional desde o inicio.',
    index,
    total,
  );

  const items = [
    'Secrets nunca vao para o frontend',
    'Refresh tokens criptografados em repouso',
    'Isolamento por tenant em toda a camada de dados',
    'Logs com mascaramento e trilha de auditoria',
    'Rate limit interno por usuario e tenant',
    'Permissoes por papel e por escopo de cliente',
  ];

  items.forEach((item, itemIndex) => {
    const column = itemIndex < 3 ? 0 : 1;
    const row = itemIndex % 3;
    const x = column === 0 ? 0.85 : 6.75;
    const y = 2.15 + row * 1.2;

    slide.addShape(pptx.ShapeType.roundRect, {
      x,
      y,
      w: 5.55,
      h: 0.9,
      rectRadius: 0.03,
      fill: { color: COLORS.white },
      line: { color: COLORS.line },
    });
    slide.addShape(pptx.ShapeType.ellipse, {
      x: x + 0.18,
      y: y + 0.23,
      w: 0.22,
      h: 0.22,
      fill: { color: COLORS.success },
      line: { color: COLORS.success },
    });
    slide.addText(item, {
      x: x + 0.48,
      y: y + 0.22,
      w: 4.75,
      h: 0.26,
      fontSize: 13.8,
      bold: true,
      color: COLORS.ink,
    });
  });

  slide.addText('Para um cliente potencial, isso significa menos risco operacional, mais confianca para centralizar contas e um caminho mais seguro para escalar o uso.', {
    x: 1.1,
    y: 6.1,
    w: 11.1,
    h: 0.35,
    fontSize: 15.5,
    bold: true,
    color: COLORS.accentStrong,
    align: 'center',
  });
}

function addPilotSlide(index, total) {
  const slide = createContentSlide(
    'Proposta de implantacao e proximo passo',
    'O produto esta em ambiente local para testes internos, mas o posicionamento comercial e operacional ja e de plataforma SaaS em nuvem. O caminho ideal e vender um piloto controlado, provar valor rapido e expandir em seguida.',
    index,
    total,
  );

  const phases = [
    {
      title: 'Fase 1',
      subtitle: 'Discovery',
      text: 'Definir tenant piloto, clientes iniciais, metas e relatorios prioritarios.',
    },
    {
      title: 'Fase 2',
      subtitle: 'Piloto em nuvem',
      text: 'Subir a operacao em nuvem, conectar contas, ativar sync agendada, dashboards e primeiros insights.',
    },
    {
      title: 'Fase 3',
      subtitle: 'Expansao',
      text: 'Ligar deck executivo, padronizar o uso interno e ampliar a base de clientes.',
    },
  ];

  slide.addShape(pptx.ShapeType.roundRect, {
    x: 0.95,
    y: 1.95,
    w: 11.7,
    h: 0.55,
    rectRadius: 0.03,
    fill: { color: 'F8F2EA' },
    line: { color: 'EEDBC9' },
  });
  slide.addText('Status atual: validacao local interna. Posicionamento comercial: plataforma SaaS em nuvem pronta para piloto controlado.', {
    x: 1.2,
    y: 2.12,
    w: 11.2,
    h: 0.18,
    fontSize: 12.8,
    bold: true,
    color: COLORS.accentStrong,
    align: 'center',
  });

  phases.forEach((phase, phaseIndex) => {
    const x = 0.95 + phaseIndex * 3.9;
    slide.addShape(pptx.ShapeType.roundRect, {
      x,
      y: 2.75,
      w: 3.3,
      h: 2.2,
      rectRadius: 0.05,
      fill: { color: COLORS.white },
      line: { color: COLORS.line },
    });
    addTag(slide, x + 0.22, 3.0, 1.1, phase.title, {
      fill: COLORS.accent,
      text: COLORS.white,
      size: 10.5,
    });
    slide.addText(phase.subtitle, {
      x: x + 0.22,
      y: 3.45,
      w: 2.6,
      h: 0.3,
      fontSize: 19,
      bold: true,
      color: COLORS.ink,
    });
    slide.addText(phase.text, {
      x: x + 0.22,
      y: 3.82,
      w: 2.75,
      h: 0.82,
      fontSize: 12.5,
      color: COLORS.slate,
      margin: 0,
    });
  });

  slide.addShape(pptx.ShapeType.roundRect, {
    x: 0.95,
    y: 5.55,
    w: 11.7,
    h: 0.95,
    rectRadius: 0.04,
    fill: { color: COLORS.navy },
    line: { color: COLORS.navy },
  });
  slide.addText('Proximo passo sugerido: workshop curto para alinhar branding, piloto inicial em nuvem e formato do relatorio comercial.', {
    x: 1.25,
    y: 5.88,
    w: 11.1,
    h: 0.26,
    fontSize: 16,
    bold: true,
    color: COLORS.white,
    align: 'center',
  });
}

function createContentSlide(title, subtitle, index, total) {
  const slide = pptx.addSlide();

  slide.background = { color: COLORS.paper };
  slide.addShape(pptx.ShapeType.rect, {
    x: 0,
    y: 0,
    w: 13.33,
    h: 0.7,
    fill: { color: COLORS.paper },
    line: { color: COLORS.paper },
  });

  addTag(slide, 0.7, 0.45, 1.5, 'GOOGLE ADS SAAS', {
    fill: 'F8E6DA',
    text: COLORS.accentStrong,
    size: 10.5,
  });
  slide.addText(title, {
    x: 0.7,
    y: 0.98,
    w: 8.9,
    h: 0.5,
    fontFace: 'Aptos Display',
    fontSize: 28,
    bold: true,
    color: COLORS.ink,
  });
  slide.addText(subtitle, {
    x: 0.7,
    y: 1.45,
    w: 10.7,
    h: 0.45,
    fontSize: 13.4,
    color: COLORS.slate,
  });

  addFooter(slide, index, total);
  return slide;
}

function addTag(slide, x, y, w, text, options) {
  slide.addShape(pptx.ShapeType.roundRect, {
    x,
    y,
    w,
    h: 0.34,
    rectRadius: 0.05,
    fill: { color: options.fill },
    line: { color: options.fill },
  });
  slide.addText(text, {
    x,
    y: y + 0.07,
    w,
    h: 0.12,
    align: 'center',
    fontSize: options.size ?? 10,
    bold: true,
    color: options.text,
    charSpace: 0.8,
  });
}

function addMetricChip(slide, x, y, label) {
  slide.addShape(pptx.ShapeType.roundRect, {
    x,
    y,
    w: 1.95,
    h: 0.34,
    rectRadius: 0.05,
    fill: { color: '203047' },
    line: { color: '30445F' },
  });
  slide.addText(label, {
    x,
    y: y + 0.07,
    w: 1.95,
    h: 0.12,
    align: 'center',
    fontSize: 10,
    bold: true,
    color: COLORS.white,
  });
}

function addValueCard(slide, x, y, w, h, title, text) {
  slide.addShape(pptx.ShapeType.roundRect, {
    x,
    y,
    w,
    h,
    rectRadius: 0.05,
    fill: { color: COLORS.white },
    line: { color: COLORS.line },
  });
  slide.addText(title, {
    x: x + 0.18,
    y: y + 0.2,
    w: w - 0.36,
    h: 0.22,
    fontSize: 18,
    bold: true,
    color: COLORS.ink,
  });
  slide.addText(text, {
    x: x + 0.18,
    y: y + 0.55,
    w: w - 0.36,
    h: h - 0.68,
    fontSize: 12.5,
    color: COLORS.slate,
    margin: 0,
    valign: 'mid',
  });
}

function addProblemCard(slide, x, y, title, text) {
  slide.addShape(pptx.ShapeType.roundRect, {
    x,
    y,
    w: 2.75,
    h: 2.45,
    rectRadius: 0.05,
    fill: { color: COLORS.white },
    line: { color: COLORS.line },
  });
  slide.addText(title, {
    x: x + 0.18,
    y: y + 0.24,
    w: 2.35,
    h: 0.55,
    fontSize: 17,
    bold: true,
    color: COLORS.ink,
    valign: 'mid',
  });
  slide.addText(text, {
    x: x + 0.18,
    y: y + 0.98,
    w: 2.35,
    h: 1.0,
    fontSize: 12.2,
    color: COLORS.slate,
    margin: 0,
  });
}

function addSolutionColumn(slide, x, y, title, lines, color) {
  slide.addShape(pptx.ShapeType.roundRect, {
    x,
    y,
    w: 3.15,
    h: 3.4,
    rectRadius: 0.05,
    fill: { color: COLORS.white },
    line: { color: COLORS.line },
  });
  slide.addShape(pptx.ShapeType.rect, {
    x,
    y,
    w: 3.15,
    h: 0.14,
    fill: { color },
    line: { color },
  });
  slide.addText(title, {
    x: x + 0.22,
    y: y + 0.28,
    w: 2.6,
    h: 0.45,
    fontSize: 20,
    bold: true,
    color: COLORS.ink,
  });
  slide.addText(lines.map((line) => `- ${line}`).join('\n'), {
    x: x + 0.22,
    y: y + 0.88,
    w: 2.55,
    h: 1.9,
    fontSize: 12.6,
    color: COLORS.slate,
    margin: 0,
  });
}

function addFooter(slide, index, total) {
  slide.addText('Confidencial | Google Ads SaaS', {
    x: 0.75,
    y: 7.04,
    w: 3.25,
    h: 0.16,
    fontSize: 9.5,
    color: COLORS.slate,
  });
  slide.addText(`${index}/${total}`, {
    x: 12.08,
    y: 7.04,
    w: 0.45,
    h: 0.16,
    fontSize: 9.5,
    color: COLORS.slate,
    align: 'right',
  });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
