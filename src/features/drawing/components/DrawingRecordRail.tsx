import { imageSrc } from "../drawingUtils";
import type { DrawingRecord } from "../types";
import { PlusIcon, TrashIcon } from "./DrawingIcons";

interface DrawingRecordRailProps {
  records: DrawingRecord[];
  activeRecord: DrawingRecord;
  currentImageIndex: number;
  labels: {
    add: string;
    delete: string;
    drawMode: string;
    editMode: string;
  };
  onAddRecord: () => void;
  onSelectRecord: (id: string) => void;
  onDeleteRecord: (id: string) => void;
  onSelectImage: (index: number) => void;
}

export function DrawingRecordRail({
  records,
  activeRecord,
  currentImageIndex,
  labels,
  onAddRecord,
  onSelectRecord,
  onDeleteRecord,
  onSelectImage,
}: DrawingRecordRailProps) {
  return (
    <aside className="drawing-record-rail">
      <button className="drawing-add-record" onClick={onAddRecord} type="button" title={labels.add}>
        <PlusIcon />
      </button>
      <div className="drawing-record-list">
        {records.map((record) => (
          <div
            className={`drawing-record-item ${record.id === activeRecord.id ? "active" : ""}`}
            key={record.id}
          >
            <button
              className="drawing-record-thumb"
              onClick={() => onSelectRecord(record.id)}
              type="button"
              title={record.prompt.trim() || (record.mode === "edit" ? labels.editMode : labels.drawMode)}
            >
              {record.images[0] ? <img src={imageSrc(record.images[0])} alt="" /> : <span>{record.mode === "edit" ? labels.editMode : labels.drawMode}</span>}
            </button>
            <button
              className="drawing-record-delete"
              onClick={() => onDeleteRecord(record.id)}
              type="button"
              title={labels.delete}
            >
              <TrashIcon />
            </button>
          </div>
        ))}
      </div>
      {activeRecord.images.length > 1 ? (
        <div className="drawing-output-strip">
          {activeRecord.images.map((image, index) => (
            <button
              className={index === currentImageIndex ? "active" : ""}
              key={`${image}-${index}`}
              onClick={() => onSelectImage(index)}
              type="button"
            >
              <img src={imageSrc(image)} alt="" />
            </button>
          ))}
        </div>
      ) : null}
    </aside>
  );
}
