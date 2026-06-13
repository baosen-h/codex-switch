import { Link } from "lucide-react";

interface WebSearchProviderIconProps {
  providerId: string;
  providerName: string;
}

export function WebSearchProviderIcon({
  providerId,
  providerName,
}: WebSearchProviderIconProps) {
  if (providerId === "direct") {
    return (
      <span className="web-search-provider-icon provider-icon-fallback" aria-hidden="true">
        <Link size={17} />
      </span>
    );
  }

  const initials = providerName
    .trim()
    .split(/\s+/)
    .map((part) => part.charAt(0))
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <span className="web-search-provider-icon provider-icon-fallback" aria-hidden="true">
      {initials || "?"}
    </span>
  );
}
