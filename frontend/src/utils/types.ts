export type Mode = 'scroll' | 'slides' | 'scrape';

export interface SourceImage {
  img: HTMLImageElement;
  url: string;
}

export interface ProgressInfo {
  prog: number;
  q?: number;
  slideIdx?: number;
  phase: 'scroll' | 'pause' | 'show' | 'transition' | 'done';
  localMs?: number;
  transDur?: number;
}

export interface QualityLabels {
  [key: string]: string;
}

export const QUALITY_LABELS: QualityLabels = {
  '5000000': '5Mbps قياسي',
  '12000000': '12Mbps جيد',
  '25000000': '25Mbps عالي',
  '50000000': '50Mbps فائق',
  '80000000': '80Mbps احترافي',
};

export const VIDEO_PRESETS = [
  { label: 'يوتيوب - فيديو عادي أفقي', width: 1920, height: 1080, ratio: '16:9' },
  { label: 'يوتيوب - Shorts', width: 1080, height: 1920, ratio: '9:16' },
  { label: 'فيسبوك - فيديو أفقي', width: 1920, height: 1080, ratio: '16:9' },
  { label: 'فيسبوك - Reels', width: 1080, height: 1920, ratio: '9:16' },
  { label: 'فيسبوك - فيديو مربع', width: 1080, height: 1080, ratio: '1:1' },
];