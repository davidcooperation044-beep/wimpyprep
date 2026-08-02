"use client";

import { useEffect, useMemo, useState } from 'react';

const mockQuestions = Array.from({ length: 10 }, (_, index) => ({
  id: `${index + 1}`,
  question: `Mock question ${index + 1}: What is ${index + 1} + ${index + 2}?`,
  options: ['A. 3', 'B. 4', 'C. 5', 'D. 6'],
  answer: 'C. 5',
}));

export default function MockPage() {
  const [index, setIndex] = useState(0);
  const [timeLeft, setTimeLeft] = useState(90);
  const [score, setScore] = useState(0);

  useEffect(() => {
    if (timeLeft <= 0) {
      return;
    }
    const timer = window.setInterval(() => setTimeLeft((value) => value - 1), 1000);
    return () => window.clearInterval(timer);
  }, [timeLeft]);

  const question = mockQuestions[index];
  const progress = useMemo(() => ((index + 1) / mockQuestions.length) * 100, [index]);

  const handleAnswer = (option: string) => {
    if (option === question.answer) {
      setScore((value) => value + 1);
    }
    if (index < mockQuestions.length - 1) {
      setIndex((value) => value + 1);
    }
  };

  return (
    <main className="shell">
      <section className="hero">
        <p className="eyebrow">Mock exam mode</p>
        <h1>Feel the real CBT pressure without the surprise.</h1>
        <p className="lead">A timed simulation with a visible countdown and auto-submit pacing.</p>
        <div className="timer-row">
          <span className={`timer ${timeLeft < 20 ? 'danger' : ''}`}>⏱ {timeLeft}s</span>
          <span className="meta">Score {score}/{index + 1}</span>
        </div>
        <div className="progress-track" aria-label="mock exam progress">
          <div className="progress-fill" style={{ width: `${progress}%` }} />
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <h2>Question {index + 1}</h2>
          <span>{question.question}</span>
        </div>
        <div className="options-list">
          {question.options.map((option) => (
            <button key={option} className="option" onClick={() => handleAnswer(option)}>
              {option}
            </button>
          ))}
        </div>
      </section>
    </main>
  );
}
