import { useEffect, useMemo, useState } from "react";
import { cn } from "../ui/lib";

export type ImageProps = {
  base64?: string;
  uint8Array?: Uint8Array;
  mediaType: string;
  alt: string;
  className?: string;
} & Omit<React.ImgHTMLAttributes<HTMLImageElement>, "alt" | "src">;

function Image({
  base64,
  uint8Array,
  mediaType,
  alt,
  className,
  ...props
}: ImageProps) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);

  const dataUrl = useMemo(() => {
    if (!base64) return null;
    return `data:${mediaType};base64,${base64}`;
  }, [base64, mediaType]);

  useEffect(() => {
    if (dataUrl || !uint8Array?.length) {
      setObjectUrl(null);
      return undefined;
    }

    const bytes = new Uint8Array(uint8Array);
    const url = URL.createObjectURL(new Blob([bytes.buffer], { type: mediaType }));
    setObjectUrl(url);

    return () => URL.revokeObjectURL(url);
  }, [dataUrl, mediaType, uint8Array]);

  return (
    <img
      alt={alt}
      className={cn("block object-cover", className)}
      src={dataUrl ?? objectUrl ?? ""}
      {...props}
    />
  );
}

export { Image };
