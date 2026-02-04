import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getOpenClawClient } from '@/lib/openclaw/client';

// POST /api/tasks/[id]/planning/answer - Submit an answer and get next question
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: taskId } = await params;

  try {
    const body = await request.json();
    const { answer, otherText } = body;

    if (!answer) {
      return NextResponse.json({ error: 'Answer is required' }, { status: 400 });
    }

    // Get task
    const task = getDb().prepare('SELECT * FROM tasks WHERE id = ?').get(taskId) as {
      id: string;
      title: string;
      description: string;
      planning_session_key?: string;
      planning_messages?: string;
    } | undefined;

    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    if (!task.planning_session_key) {
      return NextResponse.json({ error: 'Planning not started' }, { status: 400 });
    }

    // Build the answer message
    const answerText = answer === 'other' && otherText 
      ? `Other: ${otherText}`
      : answer;

    const answerPrompt = `User's answer: ${answerText}

Based on this answer and the conversation so far, either:
1. Ask your next question (if you need more information)
2. Complete the planning (if you have enough information)

For another question, respond with JSON:
{
  "question": "Your next question?",
  "options": [
    {"id": "A", "label": "Option A"},
    {"id": "B", "label": "Option B"},
    {"id": "other", "label": "Other"}
  ]
}

If planning is complete, respond with JSON:
{
  "status": "complete",
  "spec": {
    "title": "Task title",
    "summary": "Summary of what needs to be done",
    "deliverables": ["List of deliverables"],
    "success_criteria": ["How we know it's done"],
    "constraints": {}
  },
  "agents": [
    {
      "name": "Agent Name",
      "role": "Agent role",
      "avatar_emoji": "🎯",
      "soul_md": "Agent personality...",
      "instructions": "Specific instructions..."
    }
  ],
  "execution_plan": {
    "approach": "How to execute",
    "steps": ["Step 1", "Step 2"]
  }
}`;

    // Parse existing messages
    const messages = task.planning_messages ? JSON.parse(task.planning_messages) : [];
    messages.push({ role: 'user', content: answerText, timestamp: Date.now() });

    // Connect to OpenClaw and send the answer
    const client = getOpenClawClient();
    if (!client.isConnected()) {
      await client.connect();
    }

    await client.call('chat.send', {
      sessionKey: task.planning_session_key,
      message: answerPrompt,
    });

    // Update messages in DB
    getDb().prepare(`
      UPDATE tasks SET planning_messages = ? WHERE id = ?
    `).run(JSON.stringify(messages), taskId);

    // Poll for response
    let response = null;
    for (let i = 0; i < 30; i++) {
      await new Promise(resolve => setTimeout(resolve, 1000));

      try {
        const history = await client.call<{ messages: Array<{ role: string; content: string }> }>('chat.history', {
          sessionKey: task.planning_session_key,
          limit: 50,
        });

        if (history && history.messages) {
          // Find the latest assistant message after our user message
          const allMessages = history.messages;
          const lastUserIdx = allMessages.map((m: { role: string }) => m.role).lastIndexOf('user');
          const assistantAfterUser = allMessages.slice(lastUserIdx + 1).find((m: { role: string }) => m.role === 'assistant');
          
          if (assistantAfterUser) {
            response = assistantAfterUser.content;
            break;
          }
        }
      } catch (err) {
        console.log('Polling for response...', err);
      }
    }

    if (response) {
      messages.push({ role: 'assistant', content: response, timestamp: Date.now() });

      try {
        const parsed = JSON.parse(response);

        // Check if planning is complete
        if (parsed.status === 'complete') {
          getDb().prepare(`
            UPDATE tasks 
            SET planning_messages = ?, 
                planning_complete = 1,
                planning_spec = ?,
                planning_agents = ?,
                status = 'inbox'
            WHERE id = ?
          `).run(
            JSON.stringify(messages),
            JSON.stringify(parsed.spec),
            JSON.stringify(parsed.agents),
            taskId
          );

          // Create the agents in the workspace
          if (parsed.agents && parsed.agents.length > 0) {
            const insertAgent = getDb().prepare(`
              INSERT INTO agents (id, workspace_id, name, role, description, avatar_emoji, status, soul_md, created_at, updated_at)
              VALUES (?, (SELECT workspace_id FROM tasks WHERE id = ?), ?, ?, ?, ?, 'standby', ?, datetime('now'), datetime('now'))
            `);

            for (const agent of parsed.agents) {
              const agentId = crypto.randomUUID();
              insertAgent.run(
                agentId,
                taskId,
                agent.name,
                agent.role,
                agent.instructions || '',
                agent.avatar_emoji || '🤖',
                agent.soul_md || ''
              );
            }
          }

          return NextResponse.json({
            complete: true,
            spec: parsed.spec,
            agents: parsed.agents,
            executionPlan: parsed.execution_plan,
            messages,
          });
        }

        // Not complete, return next question
        getDb().prepare(`
          UPDATE tasks SET planning_messages = ? WHERE id = ?
        `).run(JSON.stringify(messages), taskId);

        return NextResponse.json({
          complete: false,
          currentQuestion: parsed,
          messages,
        });
      } catch {
        // Response wasn't valid JSON
        getDb().prepare(`
          UPDATE tasks SET planning_messages = ? WHERE id = ?
        `).run(JSON.stringify(messages), taskId);

        return NextResponse.json({
          complete: false,
          rawResponse: response,
          messages,
        });
      }
    }

    return NextResponse.json({
      complete: false,
      messages,
      note: 'Answer submitted, waiting for response.',
    });
  } catch (error) {
    console.error('Failed to submit answer:', error);
    return NextResponse.json({ error: 'Failed to submit answer: ' + (error as Error).message }, { status: 500 });
  }
}
