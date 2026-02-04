import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getOpenClawClient } from '@/lib/openclaw/client';

// Planning session prefix for OpenClaw
const PLANNING_SESSION_PREFIX = 'planning:';

// GET /api/tasks/[id]/planning - Get planning state
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: taskId } = await params;

  try {
    // Get task
    const task = getDb().prepare('SELECT * FROM tasks WHERE id = ?').get(taskId) as {
      id: string;
      title: string;
      description: string;
      status: string;
      planning_session_key?: string;
      planning_messages?: string;
      planning_complete?: number;
      planning_spec?: string;
      planning_agents?: string;
    } | undefined;
    
    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    // Parse planning messages from JSON
    const messages = task.planning_messages ? JSON.parse(task.planning_messages) : [];
    
    // Find the latest question (last assistant message with question structure)
    const lastAssistantMessage = [...messages].reverse().find((m: { role: string }) => m.role === 'assistant');
    let currentQuestion = null;
    
    if (lastAssistantMessage) {
      try {
        // Try to parse as structured planning response
        const parsed = JSON.parse(lastAssistantMessage.content);
        if (parsed.question) {
          currentQuestion = parsed;
        }
      } catch {
        // Not JSON, might be a plain message
      }
    }

    return NextResponse.json({
      taskId,
      sessionKey: task.planning_session_key,
      messages,
      currentQuestion,
      isComplete: !!task.planning_complete,
      spec: task.planning_spec ? JSON.parse(task.planning_spec) : null,
      agents: task.planning_agents ? JSON.parse(task.planning_agents) : null,
      isStarted: messages.length > 0,
    });
  } catch (error) {
    console.error('Failed to get planning state:', error);
    return NextResponse.json({ error: 'Failed to get planning state' }, { status: 500 });
  }
}

// POST /api/tasks/[id]/planning - Start planning session
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: taskId } = await params;

  try {
    // Get task
    const task = getDb().prepare('SELECT * FROM tasks WHERE id = ?').get(taskId) as {
      id: string;
      title: string;
      description: string;
      status: string;
      planning_session_key?: string;
      planning_messages?: string;
    } | undefined;
    
    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    // Check if planning already started
    if (task.planning_session_key) {
      return NextResponse.json({ error: 'Planning already started', sessionKey: task.planning_session_key }, { status: 400 });
    }

    // Create session key for this planning task
    const sessionKey = `${PLANNING_SESSION_PREFIX}${taskId}`;

    // Build the initial planning prompt
    const planningPrompt = `PLANNING REQUEST

Task Title: ${task.title}
Task Description: ${task.description || 'No description provided'}

You are starting a planning session for this task. Read PLANNING.md for your protocol.

Generate your FIRST question to understand what the user needs. Remember:
- Questions must be multiple choice
- Include an "Other" option
- Be specific to THIS task, not generic

Respond with ONLY valid JSON in this format:
{
  "question": "Your question here?",
  "options": [
    {"id": "A", "label": "First option"},
    {"id": "B", "label": "Second option"},
    {"id": "C", "label": "Third option"},
    {"id": "other", "label": "Other"}
  ]
}`;

    // Connect to OpenClaw and send the planning request
    const client = getOpenClawClient();
    if (!client.isConnected()) {
      await client.connect();
    }

    // Send planning request to the main session with a special marker
    // The message will be processed by Charlie who will respond with questions
    await client.call('chat.send', {
      sessionKey: sessionKey,
      message: planningPrompt,
    });

    // Store the session key and initial message
    const messages = [{ role: 'user', content: planningPrompt, timestamp: Date.now() }];
    
    getDb().prepare(`
      UPDATE tasks 
      SET planning_session_key = ?, planning_messages = ?, status = 'planning'
      WHERE id = ?
    `).run(sessionKey, JSON.stringify(messages), taskId);

    // Poll for response (give OpenClaw time to process)
    // In production, this would be better handled with webhooks or SSE
    let response = null;
    for (let i = 0; i < 30; i++) { // Poll for up to 30 seconds
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      try {
        const history = await client.call<{ messages: Array<{ role: string; content: string }> }>('chat.history', {
          sessionKey: sessionKey,
          limit: 10,
        });
        
        if (history && history.messages) {
          const assistantMessage = history.messages.find((m: { role: string }) => m.role === 'assistant');
          if (assistantMessage) {
            response = assistantMessage.content;
            break;
          }
        }
      } catch (err) {
        console.log('Polling for response...', err);
      }
    }

    if (response) {
      // Parse and store the response
      try {
        const parsed = JSON.parse(response);
        messages.push({ role: 'assistant', content: response, timestamp: Date.now() });
        
        getDb().prepare(`
          UPDATE tasks SET planning_messages = ? WHERE id = ?
        `).run(JSON.stringify(messages), taskId);

        return NextResponse.json({
          success: true,
          sessionKey,
          currentQuestion: parsed,
          messages,
        });
      } catch {
        // Response wasn't valid JSON, store it anyway
        messages.push({ role: 'assistant', content: response, timestamp: Date.now() });
        getDb().prepare(`
          UPDATE tasks SET planning_messages = ? WHERE id = ?
        `).run(JSON.stringify(messages), taskId);

        return NextResponse.json({
          success: true,
          sessionKey,
          rawResponse: response,
          messages,
        });
      }
    }

    return NextResponse.json({
      success: true,
      sessionKey,
      messages,
      note: 'Planning started, waiting for response. Poll GET endpoint for updates.',
    });
  } catch (error) {
    console.error('Failed to start planning:', error);
    return NextResponse.json({ error: 'Failed to start planning: ' + (error as Error).message }, { status: 500 });
  }
}
