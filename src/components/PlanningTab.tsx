'use client';

import { useState, useEffect } from 'react';
import { CheckCircle, Circle, Lock, AlertCircle, ChevronRight } from 'lucide-react';
import type { PlanningState, PlanningQuestion, PlanningQuestionOption } from '@/lib/types';

interface PlanningTabProps {
  taskId: string;
  onSpecLocked?: () => void;
}

const categoryLabels: Record<string, string> = {
  goal: '🎯 Goal',
  audience: '👥 Audience',
  scope: '📋 Scope',
  design: '🎨 Design',
  content: '📝 Content',
  technical: '⚙️ Technical',
  timeline: '📅 Timeline',
  constraints: '⚠️ Constraints'
};

export function PlanningTab({ taskId, onSpecLocked }: PlanningTabProps) {
  const [state, setState] = useState<PlanningState | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [approving, setApproving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [otherText, setOtherText] = useState<Record<string, string>>({});

  // Load planning state
  useEffect(() => {
    loadPlanningState();
  }, [taskId]);

  const loadPlanningState = async () => {
    try {
      const res = await fetch(`/api/tasks/${taskId}/planning`);
      if (res.ok) {
        const data = await res.json();
        setState(data);
        // Find first unanswered question
        const firstUnanswered = data.questions.findIndex((q: PlanningQuestion) => !q.answer);
        if (firstUnanswered >= 0) {
          setCurrentQuestionIndex(firstUnanswered);
        }
      }
    } catch (err) {
      console.error('Failed to load planning state:', err);
    } finally {
      setLoading(false);
    }
  };

  const generateQuestions = async () => {
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch(`/api/tasks/${taskId}/planning`, { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        setState(data);
      } else {
        const err = await res.json();
        setError(err.error || 'Failed to generate questions');
      }
    } catch (err) {
      setError('Failed to generate questions');
    } finally {
      setGenerating(false);
    }
  };

  const answerQuestion = async (questionId: string, answer: string) => {
    try {
      const res = await fetch(`/api/tasks/${taskId}/planning/answer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ questionId, answer })
      });

      if (res.ok) {
        // Reload state
        await loadPlanningState();
        // Move to next question
        if (state) {
          const nextUnanswered = state.questions.findIndex(
            (q, idx) => idx > currentQuestionIndex && !q.answer
          );
          if (nextUnanswered >= 0) {
            setCurrentQuestionIndex(nextUnanswered);
          } else {
            // Check if there are any unanswered before current
            const anyUnanswered = state.questions.findIndex(q => !q.answer);
            if (anyUnanswered >= 0) {
              setCurrentQuestionIndex(anyUnanswered);
            }
          }
        }
      }
    } catch (err) {
      console.error('Failed to answer question:', err);
    }
  };

  const approveSpec = async () => {
    setApproving(true);
    setError(null);
    try {
      const res = await fetch(`/api/tasks/${taskId}/planning/approve`, { method: 'POST' });
      if (res.ok) {
        await loadPlanningState();
        onSpecLocked?.();
      } else {
        const err = await res.json();
        setError(err.error || 'Failed to lock spec');
      }
    } catch (err) {
      setError('Failed to lock spec');
    } finally {
      setApproving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-pulse text-mc-text-secondary">Loading planning state...</div>
      </div>
    );
  }

  // No questions yet - show generate button
  if (!state || state.questions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-8 space-y-4">
        <div className="text-center">
          <h3 className="text-lg font-medium mb-2">Start Planning Mode</h3>
          <p className="text-mc-text-secondary text-sm max-w-md">
            Planning mode will ask you clarifying questions to ensure all details are captured 
            before work begins. No assumptions, no missed requirements.
          </p>
        </div>
        {error && (
          <div className="flex items-center gap-2 text-mc-accent-red text-sm">
            <AlertCircle className="w-4 h-4" />
            {error}
          </div>
        )}
        <button
          onClick={generateQuestions}
          disabled={generating}
          className="px-6 py-3 bg-mc-accent text-mc-bg rounded-lg font-medium hover:bg-mc-accent/90 disabled:opacity-50"
        >
          {generating ? 'Generating Questions...' : '📋 Start Planning'}
        </button>
      </div>
    );
  }

  // Spec is locked - show locked state
  if (state.isLocked && state.spec) {
    return (
      <div className="p-4 space-y-4">
        <div className="flex items-center gap-2 text-mc-accent-green">
          <Lock className="w-5 h-5" />
          <span className="font-medium">Spec Locked</span>
        </div>
        <div className="bg-mc-bg border border-mc-border rounded-lg p-4">
          <pre className="whitespace-pre-wrap text-sm font-mono text-mc-text-secondary">
            {state.spec.spec_markdown}
          </pre>
        </div>
      </div>
    );
  }

  // Show questions
  const currentQuestion = state.questions[currentQuestionIndex];
  const groupedByCategory = state.questions.reduce((acc, q, idx) => {
    if (!acc[q.category]) acc[q.category] = [];
    acc[q.category].push({ ...q, index: idx });
    return acc;
  }, {} as Record<string, (PlanningQuestion & { index: number })[]>);

  return (
    <div className="flex flex-col h-full">
      {/* Progress bar */}
      <div className="p-4 border-b border-mc-border">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium">
            {state.progress.answered} of {state.progress.total} questions answered
          </span>
          <span className="text-sm text-mc-text-secondary">
            {state.progress.percentage}%
          </span>
        </div>
        <div className="h-2 bg-mc-bg rounded-full overflow-hidden">
          <div 
            className="h-full bg-mc-accent transition-all"
            style={{ width: `${state.progress.percentage}%` }}
          />
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Question navigation sidebar */}
        <div className="w-48 border-r border-mc-border overflow-y-auto p-2">
          {Object.entries(groupedByCategory).map(([category, questions]) => (
            <div key={category} className="mb-3">
              <div className="text-xs font-medium text-mc-text-secondary mb-1 px-2">
                {categoryLabels[category] || category}
              </div>
              {questions.map((q) => (
                <button
                  key={q.id}
                  onClick={() => setCurrentQuestionIndex(q.index)}
                  className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-left text-sm transition-colors ${
                    currentQuestionIndex === q.index 
                      ? 'bg-mc-accent/20 text-mc-accent' 
                      : 'hover:bg-mc-bg-tertiary'
                  }`}
                >
                  {q.answer ? (
                    <CheckCircle className="w-4 h-4 text-mc-accent-green flex-shrink-0" />
                  ) : (
                    <Circle className="w-4 h-4 text-mc-text-secondary flex-shrink-0" />
                  )}
                  <span className="truncate">Q{q.index + 1}</span>
                </button>
              ))}
            </div>
          ))}
        </div>

        {/* Current question */}
        <div className="flex-1 p-6 overflow-y-auto">
          {currentQuestion && (
            <div className="max-w-xl mx-auto">
              <div className="text-xs text-mc-text-secondary mb-2">
                {categoryLabels[currentQuestion.category] || currentQuestion.category} • Question {currentQuestionIndex + 1} of {state.questions.length}
              </div>
              
              <h3 className="text-lg font-medium mb-6">
                {currentQuestion.question}
              </h3>

              {/* Multiple choice options */}
              {currentQuestion.question_type === 'multiple_choice' && currentQuestion.options && (
                <div className="space-y-3">
                  {(currentQuestion.options as PlanningQuestionOption[]).map((option) => {
                    const isSelected = currentQuestion.answer === option.label || 
                      (currentQuestion.answer?.startsWith('Other:') && option.label === 'Other');
                    const isOther = option.label === 'Other';

                    return (
                      <div key={option.id}>
                        <button
                          onClick={() => {
                            if (isOther) {
                              // Don't submit yet, show text input
                              if (!otherText[currentQuestion.id]) {
                                setOtherText({ ...otherText, [currentQuestion.id]: '' });
                              }
                            } else {
                              answerQuestion(currentQuestion.id, option.label);
                            }
                          }}
                          className={`w-full flex items-center gap-3 p-4 rounded-lg border transition-all text-left ${
                            isSelected
                              ? 'border-mc-accent bg-mc-accent/10'
                              : 'border-mc-border hover:border-mc-accent/50'
                          }`}
                        >
                          <span className={`w-8 h-8 rounded flex items-center justify-center text-sm font-bold ${
                            isSelected ? 'bg-mc-accent text-mc-bg' : 'bg-mc-bg-tertiary'
                          }`}>
                            {option.id}
                          </span>
                          <span className="flex-1">{option.label}</span>
                          {isSelected && <CheckCircle className="w-5 h-5 text-mc-accent" />}
                        </button>

                        {/* Other text input */}
                        {isOther && (otherText[currentQuestion.id] !== undefined || currentQuestion.answer?.startsWith('Other:')) && (
                          <div className="mt-2 ml-11">
                            <input
                              type="text"
                              value={otherText[currentQuestion.id] || currentQuestion.answer?.replace('Other: ', '') || ''}
                              onChange={(e) => setOtherText({ ...otherText, [currentQuestion.id]: e.target.value })}
                              placeholder="Please specify..."
                              className="w-full bg-mc-bg border border-mc-border rounded px-3 py-2 text-sm focus:outline-none focus:border-mc-accent"
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' && otherText[currentQuestion.id]) {
                                  answerQuestion(currentQuestion.id, `Other: ${otherText[currentQuestion.id]}`);
                                }
                              }}
                            />
                            <button
                              onClick={() => {
                                if (otherText[currentQuestion.id]) {
                                  answerQuestion(currentQuestion.id, `Other: ${otherText[currentQuestion.id]}`);
                                }
                              }}
                              disabled={!otherText[currentQuestion.id]}
                              className="mt-2 px-4 py-1.5 bg-mc-accent text-mc-bg rounded text-sm disabled:opacity-50"
                            >
                              Submit
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Text input for text questions */}
              {currentQuestion.question_type === 'text' && (
                <div>
                  <textarea
                    value={otherText[currentQuestion.id] || currentQuestion.answer || ''}
                    onChange={(e) => setOtherText({ ...otherText, [currentQuestion.id]: e.target.value })}
                    placeholder="Type your answer..."
                    rows={4}
                    className="w-full bg-mc-bg border border-mc-border rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-mc-accent resize-none"
                  />
                  <button
                    onClick={() => {
                      if (otherText[currentQuestion.id]) {
                        answerQuestion(currentQuestion.id, otherText[currentQuestion.id]);
                      }
                    }}
                    disabled={!otherText[currentQuestion.id]}
                    className="mt-3 px-6 py-2 bg-mc-accent text-mc-bg rounded font-medium disabled:opacity-50"
                  >
                    Save Answer
                  </button>
                </div>
              )}

              {/* Navigation */}
              <div className="flex items-center justify-between mt-8 pt-4 border-t border-mc-border">
                <button
                  onClick={() => setCurrentQuestionIndex(Math.max(0, currentQuestionIndex - 1))}
                  disabled={currentQuestionIndex === 0}
                  className="px-4 py-2 text-sm text-mc-text-secondary hover:text-mc-text disabled:opacity-50"
                >
                  ← Previous
                </button>
                
                {currentQuestionIndex < state.questions.length - 1 ? (
                  <button
                    onClick={() => setCurrentQuestionIndex(currentQuestionIndex + 1)}
                    className="flex items-center gap-2 px-4 py-2 text-sm text-mc-accent hover:text-mc-accent/80"
                  >
                    Next <ChevronRight className="w-4 h-4" />
                  </button>
                ) : (
                  <div />
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Lock spec button */}
      {state.progress.percentage === 100 && (
        <div className="p-4 border-t border-mc-border bg-mc-bg-secondary">
          {error && (
            <div className="flex items-center gap-2 text-mc-accent-red text-sm mb-3">
              <AlertCircle className="w-4 h-4" />
              {error}
            </div>
          )}
          <button
            onClick={approveSpec}
            disabled={approving}
            className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-mc-accent-green text-mc-bg rounded-lg font-medium hover:bg-mc-accent-green/90 disabled:opacity-50"
          >
            <Lock className="w-5 h-5" />
            {approving ? 'Locking Spec...' : 'Lock Spec & Start Execution'}
          </button>
        </div>
      )}
    </div>
  );
}
