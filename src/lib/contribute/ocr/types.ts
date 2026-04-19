export type OcrExtraction = {
  id: string;
  tile_x: number; tile_y: number; tile_w: number; tile_h: number;
  global_x: number; global_y: number; global_w: number; global_h: number;
  category: string; text: string;
  text_validated: string | null;
  category_validated: string | null;
  confidence: number;
  status: 'pending' | 'validated' | 'rejected';
};
