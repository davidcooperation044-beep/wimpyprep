"use client";

import { useEffect, useMemo, useState } from 'react';
import { createPublicSupabaseClient } from '../../lib/supabase';
import { useSession } from '../../lib/session-bootstrap';

type SubjectOption = { id: string; name: string; exam_type: string };
type SubjectSelectionProps = {
  onComplete?: () => void;
  initialExamType?: 'jamb' | 'waec' | 'both';
};

const JAMB_REQUIRED_SUBJECTS = ['English'];
const JAMB_ELECTIVE_OPTIONS = ['Mathematics', 'Physics', 'Chemistry', 'Biology', 'Economics', 'Government', 'Literature', 'History', 'Geography', 'Commerce', 'Agricultural Science'];
const WAEC_SUBJECT_OPTIONS = ['English', 'Mathematics', 'Physics', 'Chemistry', 'Biology', 'Economics', 'Government', 'Literature', 'History', 'Geography', 'Commerce', 'Agricultural Science', 'French', 'Computer Studies', 'Civic Education'];

export function SubjectSelection({ onComplete, initialExamType = 'both' }: SubjectSelectionProps) {
  const { user, accessToken } = useSession();
  const [subjects, setSubjects] = useState<SubjectOption[]>([]);
  const [examType, setExamType] = useState<'jamb' | 'waec' | 'both'>(initialExamType);
  const [selected, setSelected] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const supabase = createPublicSupabaseClient();
    if (!supabase) {
      return;
    }

    supabase
      .from('wp_subjects')
      .select('id,name,exam_type')
      .order('name', { ascending: true })
      .then(({ data }) => {
        if (data) {
          setSubjects(data as SubjectOption[]);
          setIsReady(true);
        }
      });
  }, []);

  useEffect(() => {
    if (!accessToken || !user || !subjects.length) {
      return;
    }

    const loadSelection = async () => {
      const response = await fetch('/api/user-subjects', {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (!response.ok) {
        return;
      }

      const data = await response.json().catch(() => ({ selections: [] }));
      const selections = Array.isArray(data?.selections) ? data.selections : [];
      if (!selections.length) {
        setSelected(examType === 'jamb' ? ['English'] : []);
        return;
      }

      const nextSelection = selections.map((selection: { subject_id: string; exam_type: string }) => {
        const subject = subjects.find((item) => item.id === selection.subject_id);
        return subject?.name ?? null;
      }).filter(Boolean) as string[];

      if (nextSelection.length) {
        setSelected(nextSelection);
      }

      const examKinds = Array.from(new Set(selections.map((selection: { exam_type: string }) => selection.exam_type)));
      if (examKinds.includes('jamb') && examKinds.includes('waec')) {
        setExamType('both');
      } else if (examKinds.includes('jamb')) {
        setExamType('jamb');
      } else if (examKinds.includes('waec')) {
        setExamType('waec');
      }
    };

    void loadSelection();
  }, [accessToken, examType, subjects, user]);

  const availableOptions = useMemo(() => {
    const base = subjects.filter((subject) => {
      if (examType === 'jamb') {
        return subject.name === 'English' || JAMB_ELECTIVE_OPTIONS.includes(subject.name);
      }
      if (examType === 'waec') {
        return WAEC_SUBJECT_OPTIONS.includes(subject.name);
      }
      return true;
    });

    const selectedNames = new Set(selected);
    return base.filter((subject) => !selectedNames.has(subject.name));
  }, [examType, selected, subjects]);

  const selectedSubjectNames = useMemo(() => {
    return subjects.filter((subject) => selected.includes(subject.name)).map((subject) => subject.name);
  }, [selected, subjects]);

  const canSubmit = useMemo(() => {
    if (examType === 'jamb') {
      return selected.length === 4 && selected.includes('English');
    }

    if (examType === 'waec') {
      return selected.length >= 7 && selected.length <= 9;
    }

    return selected.length >= 7 && selected.length <= 9;
  }, [examType, selected]);

  const toggleSubject = (subjectName: string) => {
    if (examType === 'jamb' && subjectName === 'English') {
      return;
    }

    setSelected((current) => {
      if (current.includes(subjectName)) {
        if (examType === 'jamb' && subjectName === 'English') {
          return current;
        }
        return current.filter((value) => value !== subjectName);
      }

      if (examType === 'jamb') {
        if (current.length >= 4) {
          return current;
        }
        return [...current, subjectName];
      }

      return [...current, subjectName];
    });
  };

  const handleSubmit = async () => {
    if (!user || !accessToken || !canSubmit) {
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      const selectedIds = subjects
        .filter((subject) => selected.includes(subject.name))
        .map((subject) => subject.id);

      const payload = selectedIds.flatMap((subjectId) => {
        const subject = subjects.find((item) => item.id === subjectId);
        if (!subject) {
          return [];
        }

        if (examType === 'jamb') {
          return [{ subject_id: subjectId, exam_type: 'jamb' }];
        }

        if (examType === 'waec') {
          return [{ subject_id: subjectId, exam_type: 'waec' }];
        }

        return [
          { subject_id: subjectId, exam_type: 'jamb' },
          { subject_id: subjectId, exam_type: 'waec' },
        ];
      });

      const response = await fetch('/api/user-subjects', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ selections: payload }),
      });

      if (!response.ok) {
        throw new Error('Unable to save your subject selection.');
      }

      onComplete?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save your subject selection.');
    } finally {
      setIsSaving(false);
    }
  };

  const selectionHelpText = useMemo(() => {
    if (examType === 'jamb') {
      return 'JAMB requires English plus exactly 3 electives.';
    }
    return 'WAEC prep usually includes 7 to 9 subjects.';
  }, [examType]);

  return (
    <section className="panel">
      <p className="eyebrow">Choose your subjects</p>
      <h2>Pick the subjects you’re preparing for</h2>
      <p className="lead">This helps WimpyPrep personalize practice, mock exams, and your dashboard.</p>

      <div className="subject-picker-row">
        <label className="subject-picker-label">
          <span>Exam focus</span>
          <select value={examType} onChange={(event) => {
            const next = event.target.value as 'jamb' | 'waec' | 'both';
            setExamType(next);
            setSelected(next === 'jamb' ? ['English'] : []);
          }} className="option">
            <option value="both">JAMB + WAEC</option>
            <option value="jamb">JAMB only</option>
            <option value="waec">WAEC only</option>
          </select>
        </label>
      </div>

      <p className="meta">{selectionHelpText}</p>

      {isReady ? (
        <div className="subject-chip-grid">
          {availableOptions.map((subject) => {
            const isLocked = examType === 'jamb' && subject.name === 'English';
            return (
              <button key={subject.id} type="button" className={`chip ${selected.includes(subject.name) ? 'selected' : ''}`} onClick={() => toggleSubject(subject.name)} disabled={isLocked}>
                {subject.name}
              </button>
            );
          })}
        </div>
      ) : (
        <p className="meta">Loading subjects…</p>
      )}

      <div className="selected-subjects">
        <h3>Selected subjects</h3>
        {selectedSubjectNames.length ? (
          <div className="subject-chip-grid">
            {selectedSubjectNames.map((subjectName) => (
              <span key={subjectName} className="chip selected">{subjectName}</span>
            ))}
          </div>
        ) : (
          <p className="meta">Choose your subjects to continue.</p>
        )}
      </div>

      {error ? <p className="meta alert-text">{error}</p> : null}
      <div className="modal-actions">
        <button className="button primary" onClick={() => void handleSubmit()} disabled={isSaving || !canSubmit} type="button">
          {isSaving ? 'Saving…' : 'Save my subject selection'}
        </button>
      </div>
    </section>
  );
}
