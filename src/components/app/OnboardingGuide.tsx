import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import type { PageKey } from "../../types";
import { useI18n } from "../../i18n/context";

interface OnboardingGuideProps {
  open: boolean;
  activePage: PageKey;
  onSelectPage: (page: PageKey) => void;
  onClose: () => void;
}

interface TourStep {
  page?: PageKey;
  selector: string;
  title: string;
  body: string;
}

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

const PADDING = 8;

export function OnboardingGuide({ open, activePage, onSelectPage, onClose }: OnboardingGuideProps) {
  const { t } = useI18n();
  const [step, setStep] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);

  const steps = useMemo<TourStep[]>(
    () => [
      {
        selector: ".nav-list",
        title: t("guideSidebarTitle"),
        body: t("guideSidebarBody"),
      },
      {
        page: "providers",
        selector: ".provider-toolbar .add-button",
        title: t("guideProvidersTitle"),
        body: t("guideProvidersBody"),
      },
      {
        page: "providers",
        selector: ".api-provider-row .provider-balance-panel, .api-provider-row .provider-actions",
        title: t("guideBalanceTitle"),
        body: t("guideBalanceBody"),
      },
      {
        page: "providers",
        selector: ".api-provider-row",
        title: t("guideOpenAiAuthTitle"),
        body: t("guideOpenAiAuthBody"),
      },
      {
        page: "agents",
        selector: ".provider-tabs-connected, .agent-provider-row .provider-actions",
        title: t("guideAgentsTitle"),
        body: t("guideAgentsBody"),
      },
      {
        page: "talking",
        selector: ".chat-topbar",
        title: t("guideUseTitle"),
        body: t("guideUseBody"),
      },
      {
        page: "drawing",
        selector: ".drawing-control-panel",
        title: t("guideDrawingTitle"),
        body: t("guideDrawingBody"),
      },
      {
        page: "sessions",
        selector: ".session-refresh-button, .session-list-panel",
        title: t("guideSessionsTitle"),
        body: t("guideSessionsBody"),
      },
      {
        page: "settings",
        selector: ".settings-page .form-grid",
        title: t("guideSettingsControlsTitle"),
        body: t("guideSettingsControlsBody"),
      },
    ],
    [t],
  );

  const current = steps[step] ?? steps[0];
  const isLast = step === steps.length - 1;

  useEffect(() => {
    if (!open) {
      setStep(0);
      return;
    }
    if (current.page && current.page !== activePage) {
      onSelectPage(current.page);
    }
  }, [activePage, current.page, onSelectPage, open]);

  useEffect(() => {
    if (!open) return;
    let raf = 0;
    const measure = () => {
      raf = window.requestAnimationFrame(() => {
        const target = document.querySelector<HTMLElement>(current.selector);
        if (!target) {
          setRect(null);
          return;
        }
        target.scrollIntoView({ block: "nearest", inline: "nearest" });
        const next = target.getBoundingClientRect();
        setRect({
          top: Math.max(0, next.top - PADDING),
          left: Math.max(0, next.left - PADDING),
          width: Math.min(window.innerWidth, next.width + PADDING * 2),
          height: Math.min(window.innerHeight, next.height + PADDING * 2),
        });
      });
    };
    const timer = window.setTimeout(measure, 80);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.clearTimeout(timer);
      window.cancelAnimationFrame(raf);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [current.selector, activePage, open]);

  if (!open) return null;

  const fallbackRect = {
    top: 96,
    left: 96,
    width: Math.min(420, window.innerWidth - 192),
    height: 120,
  };
  const target = rect ?? fallbackRect;
  const cardTop = target.top + target.height + 18;
  const popoverTop =
    cardTop + 230 < window.innerHeight ? cardTop : Math.max(56, target.top - 248);
  const popoverLeft = Math.min(
    Math.max(16, target.left),
    Math.max(16, window.innerWidth - 376),
  );

  return createPortal(
    <>
      <div className="tour-overlay" role="dialog" aria-modal="true" aria-labelledby="tour-title" />
      <div
        className="tour-highlight"
        style={{
          top: target.top,
          left: target.left,
          width: target.width,
          height: target.height,
        }}
      />
      <section className="tour-card" style={{ top: popoverTop, left: popoverLeft }}>
        <span className="eyebrow">{t("guideEyebrow")} {step + 1}/{steps.length}</span>
        <h3 id="tour-title">{current.title}</h3>
        <p>{current.body}</p>
        <div className="guide-progress" aria-label={`${step + 1} / ${steps.length}`}>
          {steps.map((item, index) => (
            <button
              aria-label={item.title}
              className={index === step ? "active" : ""}
              key={item.title}
              onClick={() => setStep(index)}
              type="button"
            />
          ))}
        </div>
        <div className="tour-card-actions">
          <button className="secondary-button" onClick={onClose} type="button">
            {t("cancel")}
          </button>
          <div className="tour-card-actions">
            <button
              className="secondary-button"
              disabled={step === 0}
              onClick={() => setStep((currentStep) => Math.max(0, currentStep - 1))}
              type="button"
            >
              {t("guideBack")}
            </button>
            <button
              className="primary-button"
              onClick={() => {
                if (isLast) {
                  onClose();
                } else {
                  setStep((currentStep) => Math.min(steps.length - 1, currentStep + 1));
                }
              }}
              type="button"
            >
              {isLast ? t("guideDone") : t("guideNext")}
            </button>
          </div>
        </div>
      </section>
    </>,
    document.body,
  );
}
