import { useRef, useState } from "react";
import type { PointerEvent, WheelEvent } from "react";

export function useImageZoom() {
  const [zoomImage, setZoomImage] = useState<string | null>(null);
  const [zoomScale, setZoomScale] = useState(1);
  const zoomStageRef = useRef<HTMLDivElement | null>(null);
  const zoomDrag = useRef({ active: false, x: 0, y: 0, left: 0, top: 0 });

  const openZoomImage = (image: string) => {
    setZoomScale(1);
    setZoomImage(image);
  };

  const closeZoomImage = () => {
    setZoomImage(null);
    setZoomScale(1);
  };

  const zoomBy = (delta: number) => {
    setZoomScale((scale) => Math.max(0.5, Math.min(4, Number((scale + delta).toFixed(2)))));
  };

  const zoomWithWheel = (event: WheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    const stage = zoomStageRef.current;
    if (!stage) {
      zoomBy(event.deltaY > 0 ? -0.15 : 0.15);
      return;
    }

    const rect = stage.getBoundingClientRect();
    const anchorX = event.clientX - rect.left + stage.scrollLeft;
    const anchorY = event.clientY - rect.top + stage.scrollTop;
    const previousScale = zoomScale;
    const nextScale = Math.max(0.5, Math.min(4, Number((zoomScale + (event.deltaY > 0 ? -0.15 : 0.15)).toFixed(2))));
    if (nextScale === previousScale) return;

    setZoomScale(nextScale);
    requestAnimationFrame(() => {
      const ratio = nextScale / previousScale;
      stage.scrollLeft = anchorX * ratio - (event.clientX - rect.left);
      stage.scrollTop = anchorY * ratio - (event.clientY - rect.top);
    });
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

  return {
    zoomImage,
    zoomScale,
    zoomStageRef,
    setZoomScale,
    openZoomImage,
    closeZoomImage,
    zoomBy,
    zoomWithWheel,
    startZoomDrag,
    moveZoomDrag,
    stopZoomDrag,
  };
}
