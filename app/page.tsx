import Link from 'next/link';
import { ProgressRing } from './components/progress-ring';

const subjects = ['English', 'Mathematics', 'Physics', 'Biology'];

export default function HomePage() {
  return (
    <main className="shell">
      <section className="hero">
        <p className="eyebrow">The Sprint</p>
        <h1>Train like exam day is already ticking.</h1>
        <p className="lead">
          Practice faster, mock harder, and sharpen your weak areas with AI-guided prep built for JAMB and WAEC.
        </p>
        <div className="actions">
          <Link href="/practice" className="button primary">Start Practice</Link>
          <Link href="/mock" className="button secondary">Take Mock Exam</Link>
        </div>
        <ProgressRing value={74} label="session progress" />
      </section>

      <section className="panel">
        <div className="panel-header">
          <h2>Focus subjects</h2>
          <span>Mobile-first study sprint</span>
        </div>
        <div className="subject-grid">
          {subjects.map((subject) => (
            <div key={subject} className="chip">{subject}</div>
          ))}
        </div>
      </section>

      <section className="stats-grid">
        <article className="stat-card">
          <strong>4.8/5</strong>
          <span>Study flow satisfaction</span>
        </article>
        <article className="stat-card">
          <strong>3 weak spots</strong>
          <span>AI-generated focus list</span>
        </article>
        <article className="stat-card">
          <strong>24/7</strong>
          <span>Offline-ready practice</span>
        </article>
      </section>
    </main>
  );
}
