-- The hub no longer has a Create schedules task. Remove those rows and
-- their subtasks. Leave every other task. Also drop notices that point
-- at a removed row.
UPDATE "WorkspaceStore"
SET
  "data" = jsonb_set(
    jsonb_set(
      "data",
      '{tasks}',
      COALESCE(
        (
          SELECT jsonb_agg(task ORDER BY ord)
          FROM jsonb_array_elements("data"->'tasks') WITH ORDINALITY AS rows(task, ord)
          WHERE NOT (
            jsonb_typeof(task) = 'object'
            AND (
              task->>'catalogKey' = 'create_schedules'
              OR (
                COALESCE(task->>'parentId', '') <> ''
                AND task->>'parentId' IN (
                  SELECT parent->>'id'
                  FROM jsonb_array_elements("data"->'tasks') AS parent
                  WHERE jsonb_typeof(parent) = 'object'
                    AND parent->>'catalogKey' = 'create_schedules'
                )
              )
            )
          )
        ),
        '[]'::jsonb
      )
    ),
    '{notifications}',
    CASE
      WHEN jsonb_typeof("data"->'notifications') = 'array' THEN COALESCE(
        (
          SELECT jsonb_agg(notice ORDER BY ord)
          FROM jsonb_array_elements("data"->'notifications') WITH ORDINALITY AS rows(notice, ord)
          WHERE NOT (
            jsonb_typeof(notice) = 'object'
            AND COALESCE(notice->>'taskId', '') <> ''
            AND notice->>'taskId' IN (
              SELECT task->>'id'
              FROM jsonb_array_elements("data"->'tasks') AS task
              WHERE jsonb_typeof(task) = 'object'
                AND (
                  task->>'catalogKey' = 'create_schedules'
                  OR (
                    COALESCE(task->>'parentId', '') <> ''
                    AND task->>'parentId' IN (
                      SELECT parent->>'id'
                      FROM jsonb_array_elements("data"->'tasks') AS parent
                      WHERE jsonb_typeof(parent) = 'object'
                        AND parent->>'catalogKey' = 'create_schedules'
                    )
                  )
                )
            )
          )
        ),
        '[]'::jsonb
      )
      ELSE COALESCE("data"->'notifications', '[]'::jsonb)
    END
  ),
  "updatedAt" = CURRENT_TIMESTAMP
WHERE jsonb_typeof("data"->'tasks') = 'array'
  AND EXISTS (
    SELECT 1
    FROM jsonb_array_elements("data"->'tasks') AS task
    WHERE jsonb_typeof(task) = 'object'
      AND task->>'catalogKey' = 'create_schedules'
  );
