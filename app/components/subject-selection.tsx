"use client";

import { useEffect, useMemo, useState } from 'react';
import { createPublicSupabaseClient } from '../../lib/supabase';
import { useSession } from '../../lib/session-bootstrap';

type SubjectOption = { id: string; name: string; exam_type: string };
type ExamType = 'jamb' | 'waec';
type SubjectSelectionProps = {
  onComplete?: () => void;
  initialExamType?: ExamType;
};

type SelectionBuckets = Record<ExamType, string[]>;

const JAMB_ELECTIVE_OPTIONS = ['Mathematics', 'Physics', 'Chemistry', 'Biology', 'Economics', 'Government', 'Literature', 'History', 'Geography', 'Commerce', 'Agricultural Science'];
const WAEC_SUBJECT_OPTIONS = ['English', 'Mathematics', 'Physics', 'Chemistry', 'Biology', 'Economics', 'Government', 'Literature', 'History', 'Geography', 'Commerce', 'Agricultural Science', 'French', 'Computer Studies', 'Civic Education'];

export function SubjectSelection({ onComplete, initialExamType = 'jamb' }: SubjectSelectionProps) {
  const { user, accessToken } = useSession();
  const [subjects, setSubjects] = useState<SubjectOption[]>([]);
  const [examType, setExamType] = useState<ExamType>(initialExamType);
  const [selectedByExamType, setSelectedByExamType] = useState<SelectionBuckets>({ jamb: [], waec: [] });
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
        const englishSubject = subjects.find((subject) => subject.name === 'English' && subject.exam_type === 'jamb');
        setSelectedByExamType({ jamb: englishSubject ? [englishSubject.id] : [], waec: [] });
        return;
      }

      const nextSelection: SelectionBuckets = { jamb: [], waec: [] };
      for (const selection of selections as Array<{ subject_id: string; exam_type: string }>) {
        const subject = subjects.find((item) => item.id === selection.subject_id);
        if (!subject) {
          continue;
        }

        if (selection.exam_type === 'jamb') {
          nextSelection.jamb.push(subject.id);
        } else if (selection.exam_type === 'waec') {
          nextSelection.waec.push(subject.id);
        }
      }

      setSelectedByExamType(nextSelection);

      const examKinds = Array.from(new Set(selections.map((selection: { exam_type: string }) => selection.exam_type)));
      if (examKinds.includes('jamb') && examKinds.includes('waec')) {
        setExamType('jamb');
      } else if (examKinds.includes('jamb')) {
        setExamType('jamb');
      } else if (examKinds.includes('waec')) {
        setExamType('waec');
      }
    };

    void loadSelection();
  }, [accessToken, subjects, user]);

  const selectedSubjectIds = useMemo(() => selectedByExamType[examType], [examType, selectedByExamType]);

  const availableOptions = useMemo(() => {
    const base = subjects.filter((subject) => {
      if (examType === 'jamb') {
        return subject.name === 'English' || JAMB_ELECTIVE_OPTIONS.includes(subject.name);
      }
      return WAEC_SUBJECT_OPTIONS.includes(subject.name);
    });

    const selectedIds = new Set(selectedSubjectIds);
    return base.filter((subject) => !selectedIds.has(subject.id));
  }, [examType, selectedSubjectIds, subjects]);

  const selectedSubjectNames = useMemo(() => {
    const selectedIds = new Set(selectedSubjectIds);
    return subjects
      .filter((subject) => selectedIds.has(subject.id))
      .map((subject) => subject.name);
  }, [selectedSubjectIds, subjects]);

  const selectedSubjectPayload = useMemo(() => {
    const payload: Array<{ subject_id: string; exam_type: 'jamb' | 'waec' }> = [];
    const seen = new Set<string>();

    for (const [examKey, subjectIds] of Object.entries(selectedByExamType) as Array<[ExamType, string[]]>) {
      for (const subjectId of subjectIds) {
        const payloadKey = `${subjectId}:${examKey}`;
        if (seen.has(payloadKey)) {
          continue;
        }

        seen.add(payloadKey);
        payload.push({ subject_id: subjectId, exam_type: examKey });
      }
    }

    return payload;
  }, [selectedByExamType]);

  const canSubmit = useMemo(() => {
    if (examType === 'jamb') {
      return selectedSubjectIds.length === 4 && selectedSubjectIds.some((id) => subjects.find((subject) => subject.id === id)?.name === 'English');
    }

    return selectedSubjectIds.length >= 7 && selectedSubjectIds.length <= 9;
  }, [examType, selectedSubjectIds, subjects]);

  const toggleSubject = (subject: SubjectOption) => {
    setSelectedByExamType((current) => {
      const bucket = examType;
      const currentSelection = current[bucket];

      if (currentSelection.includes(subject.id)) {
        if (bucket === 'jamb' && subject.name === 'English') {
          return current;
        }

        return {
          ...current,
          [bucket]: currentSelection.filter((value) => value !== subject.id),
        };
      }

      if (bucket === 'jamb' && currentSelection.length >= 4) {
        return current;
      }

      return {
        ...current,
        [bucket]: [...currentSelection, subject.id],
      };
    });
  };

  const handleSubmit = async () => {
    if (!user || !accessToken || !canSubmit) {
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      const payload = selectedSubjectPayload;
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
            const next = event.target.value as ExamType;
            setExamType(next);
          }} className="option">
            <option value="jamb">JAMB</option>
            <option value="waec">WAEC</option>
          </select>
        </label>
      </div>

      <p className="meta">{selectionHelpText}</p>

      {isReady ? (
        <div className="subject-chip-grid">
          {availableOptions.map((subject) => {
            const isLocked = examType === 'jamb' && subject.name === 'English';
            const isSelected = selectedSubjectIds.includes(subject.id);
            return (
              <button key={subject.id} type="button" className={`chip ${isSelected ? 'selected' : ''}`} onClick={() => toggleSubject(subject)} disabled={isLocked}>
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
