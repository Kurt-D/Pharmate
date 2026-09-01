import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, BookOpen, ChevronDown, ChevronUp, Search, X } from 'lucide-react';
import faqData, { FAQ_CATEGORIES } from '../config/faqData.js';

function searchableText(faq) {
  return [faq.question, faq.summary, ...faq.keywords, ...faq.stepByStep].join(' ').toLowerCase();
}

export default function TutorialCenterScreen({
  onClose,
  onReplay,
  onShowOnScreen,
  open,
  page = false,
}) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('All');
  const [expanded, setExpanded] = useState(null);

  const filteredFaqs = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return faqData.filter(
      (faq) =>
        (category === 'All' || faq.category === category) &&
        (!normalizedQuery || searchableText(faq).includes(normalizedQuery))
    );
  }, [category, query]);

  if (!open) return null;

  const content = (
    <section
      aria-labelledby="help-center-title"
      aria-modal={page ? undefined : 'true'}
      className="pm-tutorial-center pm-help-center"
      role={page ? undefined : 'dialog'}
    >
      <header>
        <div>
          <small>Settings · PharMate Help</small>
          <h2 id="help-center-title">Help &amp; FAQs</h2>
          <p>Search for a feature or follow a simple step-by-step guide.</p>
        </div>
        <button
          aria-label={page ? 'Back to profile' : 'Close Help and FAQs'}
          onClick={onClose}
          type="button"
        >
          {page ? <ArrowLeft /> : <X />}
        </button>
      </header>

      <button className="pm-help-center__replay" onClick={onReplay} type="button">
        <span>
          <BookOpen />
        </span>
        <span>
          <strong>Replay Full 8-Step Tour</strong>
          <small>See the important controls directly on each screen.</small>
        </span>
        <ArrowRight />
      </button>

      <label className="pm-help-center__search">
        <Search aria-hidden="true" />
        <span className="visually-hidden">Search Help and FAQs</span>
        <input
          autoComplete="off"
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search schedules, doses, tokens…"
          type="search"
          value={query}
        />
      </label>

      <div aria-label="FAQ categories" className="pm-help-center__chips">
        {FAQ_CATEGORIES.map((item) => (
          <button
            aria-pressed={category === item}
            className={category === item ? 'active' : ''}
            key={item}
            onClick={() => setCategory(item)}
            type="button"
          >
            {item}
          </button>
        ))}
      </div>

      <p className="pm-help-center__results" role="status">
        {filteredFaqs.length} {filteredFaqs.length === 1 ? 'guide' : 'guides'} found
      </p>

      <div className="pm-help-center__list">
        {filteredFaqs.map((faq) => {
          const isExpanded = expanded === faq.id;
          return (
            <article className={isExpanded ? 'is-expanded' : ''} key={faq.id}>
              <button
                aria-expanded={isExpanded}
                className="pm-help-center__question"
                onClick={() => setExpanded(isExpanded ? null : faq.id)}
                type="button"
              >
                <span>
                  <small>{faq.category}</small>
                  <strong>{faq.question}</strong>
                  <em>{faq.summary}</em>
                </span>
                {isExpanded ? <ChevronUp /> : <ChevronDown />}
              </button>
              {isExpanded && (
                <div className="pm-help-center__answer">
                  <ol>
                    {faq.stepByStep.map((step) => (
                      <li key={step}>{step}</li>
                    ))}
                  </ol>
                  <p>
                    <strong>Important:</strong> {faq.importantRule}
                  </p>
                  <button onClick={() => onShowOnScreen(faq)} type="button">
                    Show on Screen <ArrowRight />
                  </button>
                </div>
              )}
            </article>
          );
        })}
        {!filteredFaqs.length && (
          <div className="pm-help-center__empty">
            <Search />
            <strong>No matching guide</strong>
            <p>Try a word such as schedule, scan, token, or caregiver.</p>
          </div>
        )}
      </div>
    </section>
  );

  if (page) return <main className="pm-help-center-page">{content}</main>;

  return (
    <div className="pm-tutorial-center-backdrop" role="presentation">
      {content}
    </div>
  );
}

export function HelpCenterPage() {
  const navigate = useNavigate();
  return (
    <TutorialCenterScreen
      open
      page
      onClose={() => navigate('/patient/profile')}
      onReplay={() =>
        window.dispatchEvent(new CustomEvent('pm-start-help-tour', { detail: 'welcome' }))
      }
      onShowOnScreen={(faq) =>
        window.dispatchEvent(new CustomEvent('pm-show-help-guide', { detail: faq }))
      }
    />
  );
}
