import { useEffect, useState } from "react";
import type { ApiProvider } from "../../../types";
import { createRecord } from "../drawingUtils";
import { loadRecords, saveRecords } from "../storage";
import type { DrawingRecord } from "../types";

export function useDrawingRecords(fallbackProvider?: ApiProvider) {
  const [records, setRecords] = useState<DrawingRecord[]>(() => loadRecords(fallbackProvider));
  const [activeId, setActiveId] = useState(records[0]?.id ?? "");
  const [currentImageIndex, setCurrentImageIndex] = useState(0);

  const activeRecord = records.find((record) => record.id === activeId)
    ?? records[0]
    ?? createRecord(fallbackProvider);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      saveRecords(records);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [records]);

  const patchActiveRecord = (patch: Partial<DrawingRecord>) => {
    setRecords((current) =>
      current.map((record) => (record.id === activeRecord.id ? { ...record, ...patch } : record)),
    );
  };

  const addRecord = () => {
    const next = createRecord(fallbackProvider);
    setRecords((current) => [next, ...current]);
    setActiveId(next.id);
    setCurrentImageIndex(0);
  };

  const deleteRecord = (id: string) => {
    setRecords((current) => {
      const next = current.filter((record) => record.id !== id);
      if (!next.length) {
        const fresh = createRecord(fallbackProvider);
        setActiveId(fresh.id);
        return [fresh];
      }
      if (id === activeId) setActiveId(next[0].id);
      return next;
    });
    setCurrentImageIndex(0);
  };

  const selectRecord = (id: string) => {
    setActiveId(id);
    setCurrentImageIndex(0);
  };

  return {
    records,
    setRecords,
    activeId,
    activeRecord,
    currentImageIndex,
    setCurrentImageIndex,
    patchActiveRecord,
    addRecord,
    deleteRecord,
    selectRecord,
  };
}
