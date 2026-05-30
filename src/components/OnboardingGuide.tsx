import { useMemo, useState } from "react";
import { useI18n } from "../i18n/context";

interface OnboardingGuideProps {
  open: boolean;
  onClose: () => void;
}

export function OnboardingGuide({ open, onClose }: OnboardingGuideProps) {
  const { t } = useI18n();
  const [step, setStep] = useState(0);
  const steps = useMemo(
    () => [
      {
        title: t("guideProvidersTitle"),
        body: t("guideProvidersBody"),
      },
      {
        title: t("guideAgentsTitle"),
        body: t("guideAgentsBody"),
      },
      {
        title: t("guideUseTitle"),
        body: t("guideUseBody"),
      },
      {
        title: t("guideSessionsTitle"),
        body: t("guideSessionsBody"),
      },
    ],
    [t],
  );

  if (!open) return null;

  const current = steps[step];
  const isLast = step === steps.length - 1;

  return (
    <div className="guide-backdrop" role="dialog" aria-modal="true" aria-labelledby="guide-title">
      <section className="guide-card">
        <div className="guide-header">
          <div>
            <span className="eyebrow">{t("guideEyebrow")}</span>
            <h2 id="guide-title">{current.title}</h2>
          </div>
          <button className="icon-button guide-close" type="button" onClick={onClose} title={t("cancel")}>
            x
          </button>
        </div>
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
        <div className="guide-actions">
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
      </section>
    </div>
  );
}
