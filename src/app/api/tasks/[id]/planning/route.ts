import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import type { PlanningQuestion, PlanningSpec, PlanningState, PlanningCategory } from '@/lib/types';

// Question templates by category
const QUESTION_TEMPLATES: Record<PlanningCategory, { question: string; options?: string[] }[]> = {
  goal: [
    {
      question: 'What is the primary outcome or goal of this task?',
      options: ['Generate leads/sales', 'Provide information', 'Collect user data', 'Build brand awareness', 'Other']
    },
    {
      question: 'How will you measure success?',
      options: ['Conversion rate', 'Page views/traffic', 'Form submissions', 'User engagement', 'Other']
    }
  ],
  audience: [
    {
      question: 'Who is the primary target audience?',
      options: ['B2B professionals', 'B2C consumers', 'Existing customers', 'New prospects', 'Other']
    },
    {
      question: 'What problem does your audience face that this addresses?',
    }
  ],
  scope: [
    {
      question: 'What is included in this task?',
    },
    {
      question: 'What is explicitly NOT included (out of scope)?',
    }
  ],
  design: [
    {
      question: 'Are there any reference sites or designs to follow?',
    },
    {
      question: 'What is the visual style/tone?',
      options: ['Professional/Corporate', 'Modern/Minimal', 'Bold/Creative', 'Friendly/Casual', 'Other']
    },
    {
      question: 'Do you have brand colors or assets to use?',
      options: ['Yes, I will provide them', 'No, use your best judgment', 'Use existing brand from website', 'Other']
    }
  ],
  content: [
    {
      question: 'Do you have the content/copy ready?',
      options: ['Yes, I will provide it', 'No, please write it', 'I have rough notes to expand', 'Other']
    },
    {
      question: 'Are there specific messages or points that must be included?',
    }
  ],
  technical: [
    {
      question: 'What technology/platform should be used?',
      options: ['Static HTML/CSS', 'React/Next.js', 'WordPress', 'No preference', 'Other']
    },
    {
      question: 'Are there any integrations needed?',
      options: ['Form submission to email', 'CRM integration', 'Analytics tracking', 'None needed', 'Other']
    }
  ],
  timeline: [
    {
      question: 'When do you need this completed?',
      options: ['ASAP (within 24 hours)', 'This week', 'Next week', 'No rush', 'Specific date']
    }
  ],
  constraints: [
    {
      question: 'Are there any specific constraints or requirements?',
    },
    {
      question: 'Is there a budget or resource limit?',
      options: ['No budget limit', 'Keep it simple/minimal', 'Medium complexity okay', 'Other']
    }
  ]
};

// GET /api/tasks/[id]/planning - Get planning state
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: taskId } = await params;

  try {
    // Get task
    const task = getDb().prepare('SELECT * FROM tasks WHERE id = ?').get(taskId);
    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    // Get questions
    const questions = getDb().prepare(
      'SELECT * FROM planning_questions WHERE task_id = ? ORDER BY sort_order'
    ).all(taskId) as PlanningQuestion[];

    // Parse options JSON for each question
    const parsedQuestions = questions.map(q => ({
      ...q,
      options: q.options ? JSON.parse(q.options as unknown as string) : undefined
    }));

    // Get spec if exists
    const spec = getDb().prepare(
      'SELECT * FROM planning_specs WHERE task_id = ?'
    ).get(taskId) as PlanningSpec | undefined;

    // Calculate progress
    const answered = parsedQuestions.filter(q => q.answer).length;
    const total = parsedQuestions.length;

    const state: PlanningState = {
      questions: parsedQuestions,
      spec,
      progress: {
        total,
        answered,
        percentage: total > 0 ? Math.round((answered / total) * 100) : 0
      },
      isLocked: !!spec
    };

    return NextResponse.json(state);
  } catch (error) {
    console.error('Failed to get planning state:', error);
    return NextResponse.json({ error: 'Failed to get planning state' }, { status: 500 });
  }
}

// POST /api/tasks/[id]/planning - Generate questions for a task
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: taskId } = await params;

  try {
    // Get task
    const task = getDb().prepare('SELECT * FROM tasks WHERE id = ?').get(taskId) as { id: string; status: string } | undefined;
    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    // Check if questions already exist
    const existingQuestions = getDb().prepare(
      'SELECT COUNT(*) as count FROM planning_questions WHERE task_id = ?'
    ).get(taskId) as { count: number };

    if (existingQuestions.count > 0) {
      return NextResponse.json({ error: 'Questions already generated' }, { status: 400 });
    }

    // Update task status to planning
    getDb().prepare('UPDATE tasks SET status = ? WHERE id = ?').run('planning', taskId);

    // Generate questions from templates
    const insertQuestion = getDb().prepare(`
      INSERT INTO planning_questions (id, task_id, category, question, question_type, options, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    let sortOrder = 0;
    const categories: PlanningCategory[] = ['goal', 'audience', 'scope', 'design', 'content', 'technical', 'timeline', 'constraints'];

    for (const category of categories) {
      const templates = QUESTION_TEMPLATES[category];
      for (const template of templates) {
        const id = crypto.randomUUID();
        const questionType = template.options ? 'multiple_choice' : 'text';
        const options = template.options 
          ? JSON.stringify(template.options.map((label, idx) => ({ id: String.fromCharCode(65 + idx), label })))
          : null;

        insertQuestion.run(id, taskId, category, template.question, questionType, options, sortOrder++);
      }
    }

    // Return the new planning state
    const questions = getDb().prepare(
      'SELECT * FROM planning_questions WHERE task_id = ? ORDER BY sort_order'
    ).all(taskId) as PlanningQuestion[];

    const parsedQuestions = questions.map(q => ({
      ...q,
      options: q.options ? JSON.parse(q.options as unknown as string) : undefined
    }));

    const state: PlanningState = {
      questions: parsedQuestions,
      progress: {
        total: parsedQuestions.length,
        answered: 0,
        percentage: 0
      },
      isLocked: false
    };

    return NextResponse.json(state);
  } catch (error) {
    console.error('Failed to generate questions:', error);
    return NextResponse.json({ error: 'Failed to generate questions' }, { status: 500 });
  }
}
