ALTER TABLE `activities` ADD `completed_at` integer;--> statement-breakpoint
-- Recover only recorded transitions into completion; unrelated later edits are not completion dates.
UPDATE activities
SET completed_at = (
  SELECT occurred_at FROM activity_audit
  WHERE activity_id = activities.id
    AND json_extract("after", '$.userState') = 'completed'
    AND json_extract("before", '$.userState') IS NOT 'completed'
  ORDER BY id DESC LIMIT 1
)
WHERE user_state = 'completed';
