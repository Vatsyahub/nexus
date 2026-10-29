-- Tasks no longer have a priority level. Clear it on every stored task,
-- including finished, deleted, and subtask rows, when this migration runs.
UPDATE "WorkspaceStore"
SET
  "data" = jsonb_set(
    "data",
    '{tasks}',
    COALESCE(
      (
        SELECT jsonb_agg(
          CASE
            WHEN jsonb_typeof(task) = 'object' THEN task - 'priority'
            ELSE task
          END
          ORDER BY ord
        )
        FROM jsonb_array_elements("data"->'tasks') WITH ORDINALITY AS rows(task, ord)
      ),
      '[]'::jsonb
    )
  ),
  "updatedAt" = CURRENT_TIMESTAMP
WHERE jsonb_typeof("data"->'tasks') = 'array';
