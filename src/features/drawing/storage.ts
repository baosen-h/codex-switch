import type { ApiProvider } from "../../types";
import { DRAWING_STORAGE_KEY } from "./constants";
import { createRecord } from "./drawingUtils";
import type { DrawingRecord } from "./types";

export function loadRecords(provider?: ApiProvider): DrawingRecord[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(DRAWING_STORAGE_KEY) || "[]") as DrawingRecord[];
    if (Array.isArray(parsed) && parsed.length) return parsed;
  } catch {
    // Ignore invalid localStorage data and recreate below.
  }
  return [createRecord(provider)];
}

export function saveRecords(records: DrawingRecord[]): void {
  localStorage.setItem(DRAWING_STORAGE_KEY, JSON.stringify(records));
}
