import { Link } from "lucide-react";
import bochaLogo from "../../assets/web-search/bocha.svg";
import exaLogo from "../../assets/web-search/exa.svg";
import jinaLogo from "../../assets/web-search/jina.svg";
import searxngLogo from "../../assets/web-search/searxng.svg";
import tavilyLogo from "../../assets/web-search/tavily.svg";
import zhipuLogo from "../../assets/web-search/zhipu.svg";

const providerLogos: Record<string, string> = {
  bocha: bochaLogo,
  exa: exaLogo,
  jina: jinaLogo,
  searxng: searxngLogo,
  tavily: tavilyLogo,
  zhipu: zhipuLogo,
};

interface WebSearchProviderIconProps {
  providerId: string;
  providerName: string;
}

export function WebSearchProviderIcon({
  providerId,
  providerName,
}: WebSearchProviderIconProps) {
  const logo = providerLogos[providerId];

  if (logo) {
    return (
      <span className="web-search-provider-icon" aria-hidden="true">
        <img alt="" src={logo} />
      </span>
    );
  }

  if (providerId === "direct") {
    return (
      <span className="web-search-provider-icon provider-icon-fallback" aria-hidden="true">
        <Link size={17} />
      </span>
    );
  }

  return (
    <span className="web-search-provider-icon provider-icon-fallback" aria-hidden="true">
      {providerName.trim().charAt(0).toUpperCase() || "?"}
    </span>
  );
}
