# Project Backlog

This folder contains all project tasks and documentation using a file-based management system.

## Structure
`backlog/`
- `tasks/` - Active task files (flat structure, zero-padded task numbers)
  - Task files: `task-001-name.md`, `task-042-name.md`
  - Log files: `task-001-log.md` (optional)
  - Doc files: `task-001-doc.md` (optional)
- `docs/` - Project documentation
  - `features/` - Feature specifications and overviews
  - `guides/` - Step-by-step how-tos, component usage, tutorials
  - `architecture/` - System design and architectural decisions
- `archive/` - Archived tasks and docs (preserves flat structure)

## Task Format

Tasks are stored as individual files with zero-padded numbers:
- `task-001-descriptive-name.md` - Main task file
- `task-001-log.md` - Work log (created by logging agent, optional)
- `task-001-doc.md` - Task-specific documentation (optional)

## Working with Tasks

**CRITICAL: Zero-Padded Task Numbers**
- All task numbers use 3-digit zero-padding: `task-001`, `task-042`, `task-251`
- When user says "task 6", interpret as `task-006`
- When user says "task-42", interpret as `task-042`
- Use: `printf "%03d" $task_num`

Tasks use descriptive naming with zero-padded numbers:
- `task-001-refactor-auth.md`
- `task-042-add-logging.md`
- `task-153-fix-bug.md`

### Creating Tasks
1. Find next task number: `ls backlog/tasks/task-*.md | sed 's/.*task-\([0-9]\+\)-.*/\1/' | sort -n | tail -1`
2. Zero-pad: `padded=$(printf "%03d" $((last_num + 1)))`
3. Copy template: `cp backlog/tasks/task-template.md backlog/tasks/task-${padded}-name.md`

### Archiving
Move completed task files to `archive/tasks/`:
```bash
mv backlog/tasks/task-001-*.md backlog/archive/tasks/
```

Tasks can be restored by moving back:
```bash
mv backlog/archive/tasks/task-001-*.md backlog/tasks/
```
