"use client";

import { useMemo, useState } from 'react';

const initialQuestions = [
  {
    id: '1',
    topic: 'Algebra',
    question: 'If 2x + 3 = 11, what is x?',
    options: ['A. 4', 'B. 5', 'C. 6', 'D. 8'],
    answer: 'B. 5',
    explanation: 'Subtract 3 from both sides, then divide by 2.',
  },
  {
    id: '2',
    topic: 'Grammar',
    question: 'Choose the correct sentence.',
    options: ['A. She don’t know.', 'B. She doesn’t know.', 'C. She not know.', 'D. She no know.'],
    answer: 'B. She doesn’t know.',
    explanation: 'The correct third-person singular form is “doesn’t”.',
  },
];

export default function PracticePage() {
  const [index, setIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);

  const question = initialQuestions[index];
  const progress = useMemo(() => ((index + 1) / initialQuestions.length) * 100, [index]);

  const handleAnswer = (option: string) => {
    setSelected(option);
    if (option === question.answer) {
      setScore((value) => value + 1);
    }
  };

  const nextQuestion = () => {
    if (index < initialQuestions.length - 1) {
      setIndex((value) => value + 1);
      setSelected(null);
    }
  };

  return (
    <main className="shell">
      <section className="hero">
        <p className="eyebrow">Practice mode</p>
        <h1>Work one question at a time.</h1>
        <p className="lead">Daily practice, instant feedback, and clear explanations keep your momentum high.</p>
        <div className="progress-track" aria-label="practice progress">
          <div className="progress-fill" style={{ width: `${progress}%` }} />
        </div>
        <p className="meta">Score: {score}/{index + 1}</p>
      </section>

      <section className="panel">
        <div className="panel-header">
          <h2>{question.topic}</h2>
          <span>{index + 1}/{initialQuestions.length}</span>
        </div>
        <p className="question-text">{question.question}</p>
        <div className="options-list">
          {question.options.map((option) => (
            <button key={option} className="option" onClick={() => handleAnswer(option)}>
              {option}
            </button>
          ))}
        </div>
        {selected ? (
          <div className="feedback">
            <p>{selected === question.answer ? 'Correct — nice work.' : `Not quite. The correct answer is ${question.answer}.`}</p>
            <p>{question.explanation}</p>
            <button className="button primary" onClick={nextQuestion}>Next</button>
          </div>
        ) : null}
      </section>
    </main>
  );
}
