import { createPortal } from "react-dom";
import { Copy, X, ZoomIn, ZoomOut, RotateCcw } from "lucide-react";
import { useRef, useState } from "react";
import type { PointerEvent, WheelEvent } from "react";

interface AiImageZoomModalProps {
  image: string | null;
  copyLabel: string;
  onClose: () => void;
  onCopyImage: (image: string) => void;
}

export function AiImageZoomModal({
  image,
  copyLabel,
  onClose,
  onCopyImage,
}: AiImageZoomModalProps) {
  const [zoomScale, setZoomScale] = useState(1);
  const zoomStageRef = useRef<HTMLDivElement | null>(null);
  const zoomDrag = useRef({ active: false, x: 0, y: 0, left: 0, top: 0 });

  const zoomBy = (delta: number) => {
    setZoomScale((scale) => Math.max(0.5, Math.min(4, Number((scale + delta).toFixed(2)))));
  };

  const zoomWithWheel = (event: WheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    zoomBy(event.deltaY > 0 ? -0.15 : 0.15);
  };

  const startZoomDrag = (event: PointerEvent<HTMLDivElement>) => {
    const stage = zoomStageRef.current;
    if (!stage || event.button !== 0) return;
    zoomDrag.current = {
      active: true,
      x: event.clientX,
      y: event.clientY,
      left: stage.scrollLeft,
      top: stage.scrollTop,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const moveZoomDrag = (event: PointerEvent<HTMLDivElement>) => {
    const stage = zoomStageRef.current;
    if (!stage || !zoomDrag.current.active) return;
    stage.scrollLeft = zoomDrag.current.left - (event.clientX - zoomDrag.current.x);
    stage.scrollTop = zoomDrag.current.top - (event.clientY - zoomDrag.current.y);
  };

  const stopZoomDrag = (event: PointerEvent<HTMLDivElement>) => {
    zoomDrag.current.active = false;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  if (!image) return null;

  return createPortal(
    <div className="image-zoom-modal" onClick={onClose} role="presentation">
      <button className="image-zoom-close" onClick={onClose} type="button" title="Close">
        <X />
      </button>
      <div
        className="image-zoom-stage"
        ref={zoomStageRef}
        onClick={(event) => event.stopPropagation()}
        onPointerDown={startZoomDrag}
        onPointerMove={moveZoomDrag}
        onPointerUp={stopZoomDrag}
        onPointerCancel={stopZoomDrag}
        onWheel={zoomWithWheel}
      >
        <img draggable={false} src={image} alt="" style={{ width: `${zoomScale * 100}%` }} />
      </div>
      <div className="image-zoom-toolbar" onClick={(event) => event.stopPropagation()}>
        <button onClick={() => zoomBy(-0.25)} type="button" title="Zoom out"><ZoomOut /></button>
        <button onClick={() => setZoomScale(1)} type="button" title="Reset zoom"><RotateCcw /></button>
        <button onClick={() => zoomBy(0.25)} type="button" title="Zoom in"><ZoomIn /></button>
        <button onClick={() => onCopyImage(image)} type="button" title={copyLabel}><Copy /></button>
        <button onClick={onClose} type="button" title="Close"><X /></button>
      </div>
    </div>,
    document.body,
  );
}
