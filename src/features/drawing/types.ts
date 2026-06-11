import type { ApiProvider } from "../../types";

export interface DrawingPageProps {
  providers: ApiProvider[];
  onNotify: (message: string, type: "ok" | "err") => void;
}

export type DrawingMode = "draw" | "edit";

export interface DrawingRecord {
  id: string;
  mode: DrawingMode;
  providerId: string;
  model: string;
  prompt: string;
  size: string;
  quality: string;
  background: string;
  count: number;
  inputImages: string[];
  images: string[];
  createdAt: number;
}
