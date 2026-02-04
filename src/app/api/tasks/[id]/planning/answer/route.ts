import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

// POST /api/tasks/[id]/planning/answer - Answer a planning question
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: taskId } = await params;

  try {
    const body = await request.json();
    const { questionId, answer } = body;

    if (!questionId || !answer) {
      return NextResponse.json({ error: 'questionId and answer are required' }, { status: 400 });
    }

    // Verify question belongs to this task
    const question = getDb().prepare(
      'SELECT * FROM planning_questions WHERE id = ? AND task_id = ?'
    ).get(questionId, taskId);

    if (!question) {
      return NextResponse.json({ error: 'Question not found' }, { status: 404 });
    }

    // Check if spec is already locked
    const spec = getDb().prepare(
      'SELECT * FROM planning_specs WHERE task_id = ?'
    ).get(taskId);

    if (spec) {
      return NextResponse.json({ error: 'Spec is locked, cannot modify answers' }, { status: 400 });
    }

    // Update the answer
    getDb().prepare(`
      UPDATE planning_questions 
      SET answer = ?, answered_at = datetime('now')
      WHERE id = ?
    `).run(answer, questionId);

    // Get updated question
    const updatedQuestion = getDb().prepare(
      'SELECT * FROM planning_questions WHERE id = ?'
    ).get(questionId) as Record<string, unknown> | undefined;

    if (!updatedQuestion) {
      return NextResponse.json({ error: 'Question not found after update' }, { status: 500 });
    }

    // Parse options if present
    const parsed = {
      ...updatedQuestion,
      options: typeof updatedQuestion.options === 'string'
        ? JSON.parse(updatedQuestion.options) 
        : undefined
    };

    return NextResponse.json(parsed);
  } catch (error) {
    console.error('Failed to answer question:', error);
    return NextResponse.json({ error: 'Failed to answer question' }, { status: 500 });
  }
}
