export type ExecutiveDeckReportType = 'weekly' | 'monthly';

export type ExecutiveDeckAudience = 'executive' | 'client' | 'marketing';

export type ExecutiveDeckSlideType =
  | 'cover_summary'
  | 'trend'
  | 'winners'
  | 'gaps'
  | 'diagnosis'
  | 'action_plan'
  | 'next_steps';

export type ExecutiveDeckChartType =
  | 'line'
  | 'bar'
  | 'stacked_bar'
  | 'kpi_strip'
  | 'none';

export interface ExecutiveDeckPeriodReference {
  period_label: string;
  period_start: string;
  period_end: string;
  baseline_label?: string | null;
}

export interface ExecutiveDeckHighlight {
  label: string;
  value: string;
  context?: string | null;
}

export interface ExecutiveDeckChartSeriesPoint {
  label: string;
  value: number;
}

export interface ExecutiveDeckChartSeries {
  name: string;
  points: ExecutiveDeckChartSeriesPoint[];
}

export interface ExecutiveDeckChart {
  chart_type: ExecutiveDeckChartType;
  title: string;
  x_label?: string | null;
  y_label?: string | null;
  series: ExecutiveDeckChartSeries[];
}

export interface ExecutiveDeckSlide {
  slide_id: string;
  slide_type: ExecutiveDeckSlideType;
  title: string;
  main_message: string;
  bullets: string[];
  highlights: ExecutiveDeckHighlight[];
  chart?: ExecutiveDeckChart | null;
  speaker_note?: string | null;
}

export interface ExecutiveDeck {
  deck_id: string;
  tenant_id: string;
  client_id: string;
  report_type: ExecutiveDeckReportType;
  period_reference: ExecutiveDeckPeriodReference;
  audience: ExecutiveDeckAudience;
  headline: string;
  slides: ExecutiveDeckSlide[];
  generated_at: string;
}
