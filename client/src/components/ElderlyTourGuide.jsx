import { useEffect, useId, useRef, useState } from 'react';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, BookOpen, Check, X } from 'lucide-react';

export function TourReplayCard({ audience = 'patient', onReplay }) {
  return (
    <section className="pm-tour-replay" aria-labelledby={`${audience}-tour-replay-title`}>
      <span aria-hidden="true"><BookOpen /></span>
      <div>
        <h2 id={`${audience}-tour-replay-title`}>Help &amp; App Guide</h2>
        <p>Review the important controls directly on the screen.</p>
      </div>
      <button onClick={onReplay} type="button">Open Guide</button>
    </section>
  );
}

export default function ElderlyTourGuide({ onClose, onStepChange, open, steps }) {
  const [index, setIndex] = useState(0);
  const [spotlight, setSpotlight] = useState(null);
  const [pointer, setPointer] = useState(null);
  const [cardStyle, setCardStyle] = useState({ bottom: '1rem', top: 'auto' });
  const cardRef = useRef(null);
  const onStepChangeRef = useRef(onStepChange);
  const titleId = useId();
  const descriptionId = useId();
  const step = steps[index];

  useEffect(() => {
    onStepChangeRef.current = onStepChange;
  }, [onStepChange]);

  useEffect(() => {
    if (!open) return;
    setIndex(0);
  }, [open, steps]);

  useEffect(() => {
    if (!open || !step) return;
    onStepChangeRef.current?.(step, index);
    cardRef.current?.focus();
  }, [index, open, step]);

  useEffect(() => {
    if (!open || !step) return undefined;
    let frame;
    let attempts = 0;
    let aligned = false;

    const measureTarget = () => {
      const element = document.querySelector(step.target);
      if (!element) {
        setSpotlight(null);
        setPointer(null);
        setCardStyle({ bottom: '1rem', top: 'auto' });
        if (attempts < 120) {
          attempts += 1;
          frame = window.requestAnimationFrame(measureTarget);
        }
        return;
      }

      const rect = element.getBoundingClientRect();
      if (!aligned) {
        aligned = true;
        element.scrollIntoView({
          block: 'center',
          behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
            ? 'auto'
            : 'smooth',
        });
        frame = window.requestAnimationFrame(measureTarget);
        return;
      }
      const left = Math.max(8, rect.left);
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      setSpotlight({
        height: Math.max(56, rect.height),
        left,
        top: Math.max(8, rect.top),
        width: Math.max(56, Math.min(rect.width, window.innerWidth - left - 8)),
      });

      if (centerY < window.innerHeight * 0.42) {
        setPointer({ direction: 'up', left: centerX - 28, top: rect.bottom + 10 });
        setCardStyle({ bottom: 'auto', top: Math.max(12, Math.min(rect.bottom + 78, window.innerHeight - 245)) });
      } else {
        setPointer({ direction: 'down', left: centerX - 28, top: rect.top - 66 });
        setCardStyle({ bottom: Math.max(12, window.innerHeight - rect.top + 76), top: 'auto' });
      }
    };

    frame = window.requestAnimationFrame(measureTarget);
    window.addEventListener('resize', measureTarget);
    document.addEventListener('scroll', measureTarget, true);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('resize', measureTarget);
      document.removeEventListener('scroll', measureTarget, true);
    };
  }, [index, open, step]);

  useEffect(() => {
    if (!open) return undefined;
    const closeOnEscape = (event) => event.key === 'Escape' && onClose('skip');
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [onClose, open]);

  if (!open || !step) return null;
  const PointerIcon =
    pointer?.direction === 'up'
      ? ArrowUp
      : pointer?.direction === 'down'
        ? ArrowDown
        : pointer?.direction === 'left'
          ? ArrowLeft
          : ArrowRight;
  const lastStep = index === steps.length - 1;

  return (
    <div className="pm-elderly-tour" role="presentation">
      <div className={`pm-elderly-tour__shade ${spotlight ? 'has-spotlight' : ''}`} />
      {spotlight && <div aria-hidden="true" className="pm-elderly-tour__spotlight" style={spotlight} />}
      {pointer && (
        <span
          aria-hidden="true"
          className={`pm-elderly-tour__pointer points-${pointer.direction}`}
          style={{ left: pointer.left, top: pointer.top }}
        >
          <PointerIcon />
        </span>
      )}
      <section
        aria-describedby={descriptionId}
        aria-labelledby={titleId}
        aria-modal="true"
        className="pm-elderly-tour__card pm-pointer-spotlight__card"
        ref={cardRef}
        role="dialog"
        style={cardStyle}
        tabIndex="-1"
      >
        <button
          aria-label="Skip the tutorial"
          className="pm-pointer-spotlight__close"
          onClick={() => onClose('skip')}
          type="button"
        >
          Skip Tour <X />
        </button>
        <small className="pm-pointer-spotlight__step">Step {index + 1} of {steps.length}</small>
        <h2 id={titleId}>{step.title}</h2>
        <p id={descriptionId}>{step.description}</p>
        <div className="pm-elderly-tour__navigation">
          <button
            className="pm-elderly-tour__back"
            disabled={index === 0}
            onClick={() => setIndex((current) => Math.max(0, current - 1))}
            type="button"
          >
            <ArrowLeft /> Back
          </button>
          <button
            className="pm-elderly-tour__next"
            onClick={() => (lastStep ? onClose('complete') : setIndex((current) => current + 1))}
            type="button"
          >
            {lastStep ? <Check /> : null}
            {lastStep ? 'Finish' : 'Next Step'}
            {!lastStep ? <ArrowRight /> : null}
          </button>
        </div>
      </section>
    </div>
  );
}

export { ElderlyTourGuide as InteractiveSpotlightGuide };
