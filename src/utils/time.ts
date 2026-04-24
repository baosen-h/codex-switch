import type { Lang } from "../i18n/translations";

export function formatDate(raw: string): string {
  if (!raw) return "";
  const d = new Date(raw);
  if (isNaN(d.getTime())) return raw;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

export function timeAgo(raw: string, lang: Lang = "en"): string {
  if (!raw) return "";
  const d = new Date(raw);
  if (isNaN(d.getTime())) return raw;
  const secs = Math.floor((Date.now() - d.getTime()) / 1000);

  if (lang === "zh") {
    if (secs < 60) return "刚刚";
    const mins = Math.floor(secs / 60);
    if (mins < 60) return `${mins} 分钟前`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours} 小时前`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days} 天前`;
    const months = Math.floor(days / 30);
    if (months < 12) return `${months} 个月前`;
    return `${Math.floor(months / 12)} 年前`;
  }

  if (secs < 60) return "just now";
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

export function formatConversationTime(raw: string, lang: Lang = "en"): string {
  if (!raw) return "";
  const d = new Date(raw);
  if (isNaN(d.getTime())) return raw;

  const now = new Date();
  const sameYear = d.getFullYear() === now.getFullYear();
  const sameDay =
    sameYear &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();

  const p = (n: number) => String(n).padStart(2, "0");

  if (lang === "zh") {
    if (sameDay) return `${p(d.getHours())}:${p(d.getMinutes())}`;
    return `${d.getMonth() + 1}月${d.getDate()}日 ${p(d.getHours())}:${p(d.getMinutes())}`;
  }

  if (sameDay) return `${p(d.getHours())}:${p(d.getMinutes())}`;
  const month = d.toLocaleString("en-US", { month: "short" });
  return sameYear
    ? `${month} ${d.getDate()} ${p(d.getHours())}:${p(d.getMinutes())}`
    : `${d.getFullYear()} ${month} ${d.getDate()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
