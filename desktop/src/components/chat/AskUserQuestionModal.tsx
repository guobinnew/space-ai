/**
 * AskUserQuestionModal — 向用户提问对话框
 *
 * 参照 smart-code AskUserQuestion.tsx，简化版。
 * 当 LLM 调用 AskUserQuestion 工具时，显示多选问题让用户选择。
 */

import { useState } from 'react';
import { useTranslation } from '../../i18n';
import type { QuestionItem } from '../../types/chat';

type Props = {
  questions: QuestionItem[];
  onAnswer: (answer: string) => void;
};

export function AskUserQuestionModal({ questions, onAnswer }: Props) {
  const t = useTranslation();
  // selections[questionText] = selected label(s)
  const [selections, setSelections] = useState<Record<string, string | string[]>>({});

  const handleSelect = (question: string, label: string, multiSelect: boolean) => {
    setSelections((prev) => {
      if (multiSelect) {
        const current = (prev[question] as string[]) || [];
        const updated = current.includes(label)
          ? current.filter((l) => l !== label)
          : [...current, label];
        return { ...prev, [question]: updated };
      }
      return { ...prev, [question]: label };
    });
  };

  const handleSubmit = () => {
    const answers: Record<string, string> = {};
    for (const q of questions) {
      const sel = selections[q.question];
      if (Array.isArray(sel)) {
        answers[q.question] = sel.join(', ');
      } else if (typeof sel === 'string') {
        answers[q.question] = sel;
      } else {
        answers[q.question] = '';
      }
    }
    onAnswer(JSON.stringify(answers));
  };

  const allAnswered = questions.every((q) => {
    const sel = selections[q.question];
    return Array.isArray(sel) ? sel.length > 0 : typeof sel === 'string' && sel !== '';
  });

  return (
    <div className="flex justify-start mb-2">
      <div className="max-w-[85%] rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-container-low)] px-4 py-3">
        <div className="text-xs font-semibold text-[var(--color-text-secondary)] mb-3 uppercase tracking-wider">
          {t('tool.askUser')}
        </div>
        <div className="flex flex-col gap-4">
          {questions.map((q) => (
            <div key={q.question}>
              <div className="flex items-center gap-2 mb-2">
                <span className="px-1.5 py-0.5 text-[10px] font-medium rounded bg-[var(--color-surface-container-high)] text-[var(--color-text-tertiary)] leading-none">
                  {q.header}
                </span>
                <span className="text-sm text-[var(--color-text-primary)]">{q.question}</span>
              </div>
              <div className="flex flex-col gap-1.5">
                {q.options.map((opt) => {
                  const sel = selections[q.question];
                  const isSelected = Array.isArray(sel)
                    ? sel.includes(opt.label)
                    : sel === opt.label;
                  return (
                    <button
                      key={opt.label}
                      onClick={() => handleSelect(q.question, opt.label, q.multiSelect === true)}
                      className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-left transition-colors ${
                        isSelected
                          ? 'border-[var(--color-brand)] bg-[var(--color-brand)]/5'
                          : 'border-[var(--color-border)] hover:bg-[var(--color-surface-hover)]'
                      }`}
                    >
                      <span
                        className={`mt-0.5 flex-shrink-0 w-4 h-4 rounded ${q.multiSelect ? 'rounded' : 'rounded-full'} border-2 flex items-center justify-center ${
                          isSelected
                            ? 'border-[var(--color-brand)] bg-[var(--color-brand)]'
                            : 'border-[var(--color-border)]'
                        }`}
                      >
                        {isSelected && (
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        )}
                      </span>
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-[var(--color-text-primary)]">{opt.label}</div>
                        <div className="text-xs text-[var(--color-text-tertiary)] mt-0.5">{opt.description}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <button
            onClick={handleSubmit}
            disabled={!allAnswered}
            className="px-4 py-1.5 text-xs font-semibold rounded-lg text-[var(--color-btn-primary-fg)] transition-all hover:brightness-105 disabled:opacity-30"
            style={{ background: 'var(--gradient-btn-primary)' }}
          >
            {t('tool.submit')}
          </button>
        </div>
      </div>
    </div>
  );
}
