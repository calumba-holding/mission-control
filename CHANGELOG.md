# Changelog

All notable changes to Mission Control will be documented in this file. 

## [Unreleased]

### Added - Cross-Machine Orchestration & Bug Fixes (2026-01-31)

**🌐 Cross-Machine File Delivery**
- **File Upload API** (`POST /api/files/upload`): Remote agents (e.g., on development machine) can now upload files to Mission Control server (production server Mac) via HTTP
- Files saved to `$PROJECTS_PATH/{relativePath}`
- Path traversal security protection
- Returns full path for deliverable registration

**🛠️ Bug Fixes**
- **Task Deletion**: Fixed foreign key constraint errors when deleting tasks
  - Now properly cleans up: `openclaw_sessions`, `events`, `conversations`
  - Cascading deletes handle `task_activities` and `task_deliverables`
- **Agent Deletion**: Fixed foreign key constraint errors when deleting agents
  - Cleans up: `openclaw_sessions`, `events`, `messages`, `conversation_participants`
  - Nullifies references in `tasks` table
- **Task Status Changes**: Users can now move tasks to DONE from the UI
  - Master agent approval only required for agent-initiated moves
  - User-initiated moves (no agent ID) are allowed
- **Task Auto-Revert Fix**: Agent completion webhook no longer overwrites `review` or `done` status
  - Prevents Charlie's completion signals from reverting user-approved tasks

**🗑️ Session Management**
- **Delete Sessions**: Can now delete stuck/unwanted sub-agent sessions via UI
- **Mark Complete**: Can manually mark active sessions as complete via UI
- `DELETE /api/openclaw/sessions/[id]` endpoint
- `PATCH /api/openclaw/sessions/[id]` updates agent status to 'idle' on completion

**💾 Database Management**
- `npm run db:backup` - Checkpoint and backup current database state
- `npm run db:restore` - Restore from backup
- `npm run db:reset` - Full reset with seeds

**📚 Documentation**
- **HEARTBEAT.md**: Instructions for orchestrating LLMs (Charlie) to call Mission Control APIs
- **ORCHESTRATION.md**: Updated with all new endpoints and file upload workflow
- Cross-machine architecture notes (development machine ↔ production server setup)

**🔧 Type System**
- Added `task_deleted` SSE event type
- Updated payload types for deletion events

---

### Added - Production-Ready Refactor (2026-01-31)

**🔒 Security & Configuration**
- **Configuration Management System**: New `@/lib/config` module for centralized config
- **Settings UI**: `/settings` page for user-configurable paths and URLs
- **Environment Variable Support**: All sensitive values now use env vars
- **No Hardcoded Secrets**: Removed all hardcoded IP addresses, paths, and URLs from codebase
- **Project-Specific Folders**: Each project gets its own directory in configurable projects path

**🎯 Configuration Options**
- Workspace base path (default: `~/Documents/Shared`)
- Projects path (default: `~/Documents/Shared/projects`)
- Mission Control URL (auto-detected or manual)
- Default project name (customizable per project)

**🔧 Fixed**
- **Real-Time Updates**: Fixed SSE → Zustand integration - cards now move in real-time without refresh
- **Task Updates**: API endpoints now broadcast full task objects with joined agent data
- **Deliverables Button**: Arrow button now copies file path to clipboard
- **Auto-Dispatch**: Uses configured Mission Control URL instead of hardcoded localhost

**📚 Documentation**
- New `PRODUCTION_SETUP.md` with comprehensive setup guide
- Updated README with configuration section
- Enhanced `.env.example` with all available options
- Security notes and best practices

**🏗️ Infrastructure**
- Settings button in Header (top-right gear icon)
- localStorage-based user preferences
- Environment variable precedence over UI settings
- Path expansion utilities (`~` → home directory)

### Changed
- All hardcoded paths removed (now uses environment variables)
- All hardcoded IPs removed (previously: `localhost`)
- `charlie-orchestration.ts` now uses config system
- Task API routes broadcast full task objects with joins
- `.env.example` expanded with all configuration options

### Added - Real-Time Integration (2026-01-31)
- **Server-Sent Events (SSE)**: Real-time updates without page refresh
  - `/api/events/stream` endpoint for SSE connection
  - Auto-reconnection with 5-second retry
  - Broadcasts task updates, activities, deliverables, and agent events
- **Task Activities Tracking**: Complete activity log for each task
  - `task_activities` table with activity types: spawned, updated, completed, file_created, status_changed
  - `/api/tasks/[id]/activities` endpoints (GET/POST)
  - ActivityLog component with chronological timeline
- **Task Deliverables**: Track outputs and artifacts
  - `task_deliverables` table for files, URLs, and artifacts
  - `/api/tasks/[id]/deliverables` endpoints (GET/POST)
  - DeliverablesList component with file paths and descriptions
- **Sub-Agent Sessions**: Track spawned sub-agents per task
  - Enhanced `openclaw_sessions` table with `session_type` and `task_id`
  - `/api/tasks/[id]/subagent` endpoints (GET/POST)
  - SessionsList component showing active sub-agents
  - Active sub-agent counter in sidebar
- **Enhanced Task Modal**: Tabbed interface with Overview, Activity, Deliverables, and Sessions tabs
- **SSE Event Broadcasting**: All task/activity/deliverable changes broadcast to connected clients
- **useSSE Hook**: React hook for managing SSE connection lifecycle

### Changed
- Task updates now broadcast via SSE to all connected clients
- Task creation triggers real-time notification
- OpenClaw sessions API supports filtering by `session_type` and `status`
- TaskModal redesigned with wider layout and tabbed interface

### Technical Details
- SSE connection with keep-alive pings every 30 seconds
- All database operations broadcast events to SSE clients
- Activity metadata stored as JSON for extensibility
- Sub-agent sessions automatically linked to tasks
- Real-time agent counter polls every 10 seconds

### Previous Features
- **Task Auto-Dispatch**: Tasks automatically dispatch to agent's OpenClaw session when moved to ASSIGNED status
- **Agent Completion Detection**: Agents can report completion via TASK_COMPLETE message, auto-moves to REVIEW
- **Review Workflow Enforcement**: Only master agent (Charlie) can move tasks from REVIEW to DONE
- **Task Dispatch API** (`POST /api/tasks/[id]/dispatch`): Manually trigger task dispatch to agent
- **Agent Completion Webhook** (`POST /api/webhooks/agent-completion`): Receive completion notifications from agents

---

## [1.0.0] - 2026-01-31

### Initial Release
- Agent management with personality files (SOUL.md, USER.md, AGENTS.md)
- Mission Queue Kanban board (INBOX → ASSIGNED → IN PROGRESS → REVIEW → DONE)
- Agent-to-agent chat and conversations
- Live event feed
- OpenClaw Gateway WebSocket integration
- SQLite database with full schema
- Next.js 14 web interface
