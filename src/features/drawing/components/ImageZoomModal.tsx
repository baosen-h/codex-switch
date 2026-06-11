import { createPortal } from "react-dom";
import type { RefObject } from "react";
import type { PointerEvent, WheelEvent } from "react";
import { imageSrc } from "../drawingUtils";
import { CloseIcon, CopyIcon, ResetZoomIcon, ZoomIcon, ZoomOutIcon } from "./DrawingIcons";

interface ImageZoomModalProps {
  image: string | null;
  zoomScale: number;
  stageRef: RefObject<HTMLDivElement>;
  copyImageLabel: string;
  onClose: () => void;
  onCopyImage: () => void;
  onZoomBy: (delta: number) => void;
  onResetZoom: () => void;
  onWheel: (event: WheelEvent<HTMLDivElement>) => void;
  onPointerDown: (event: PointerEvent<HTMLDivElement>) => void;
  onPointerMove: (event: PointerEvent<HTMLDivElement>) => void;
  onPointerUp: (event: PointerEvent<HTMLDivElement>) => void;
}

export function ImageZoomModal({
  image,
  zoomScale,
  stageRef,
  copyImageLabel,
  onClose,
  onCopyImage,
  onZoomBy,
  onResetZoom,
  onWheel,
  onPointerDown,
  onPointerMove,
  onPointerUp,
}: ImageZoomModalProps) {
  if (!image) return null;

  return createPortal(
    <div className="image-zoom-modal" onClick={onClose} role="presentation">
      <button className="image-zoom-close" onClick={onClose} type="button" title="Close">X</button>
      <div
        className="image-zoom-stage"
        ref={stageRef}
        onClick={(event) => event.stopPropagation()}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onWheel={onWheel}
      >
        <img draggable={false} src={imageSrc(image)} alt="" style={{ width: `${zoomScale * 100}%` }} />
      </div>
      <div className="image-zoom-toolbar" onClick={(event) => event.stopPropagation()}>
        <button onClick={() => onZoomBy(-0.25)} type="button" title="Zoom out"><ZoomOutIcon /></button>
        <button onClick={onResetZoom} type="button" title="Reset zoom"><ResetZoomIcon /></button>
        <button onClick={() => onZoomBy(0.25)} type="button" title="Zoom in"><ZoomIcon /></button>
        <button onClick={onCopyImage} type="button" title={copyImageLabel}><CopyIcon /></button>
        <button onClick={onClose} type="button" title="Close"><CloseIcon /></button>
      </div>
    </div>,
    document.body,
  );
}
