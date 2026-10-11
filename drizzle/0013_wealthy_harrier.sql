CREATE TABLE `activity_audit` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`activity_id` text NOT NULL,
	`operation` text NOT NULL,
	`actor` text NOT NULL,
	`channel` text NOT NULL,
	`request_id` text NOT NULL,
	`revision` integer NOT NULL,
	`occurred_at` integer NOT NULL,
	`before` text,
	`after` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `activity_audit_request_activity` ON `activity_audit` (`request_id`,`activity_id`);--> statement-breakpoint
CREATE INDEX `activity_audit_activity_id` ON `activity_audit` (`activity_id`,`id`);--> statement-breakpoint
CREATE TABLE `activity_number_sequence` (
	`id` integer PRIMARY KEY NOT NULL,
	`last_number` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `communication_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`kind` text NOT NULL,
	`direction` text NOT NULL,
	`name` text NOT NULL,
	`occurred_at` integer NOT NULL,
	`duration_ms` integer NOT NULL,
	`outcome` text NOT NULL,
	`status` integer,
	`request_id` text,
	`event_id` text,
	`subscription_id` text,
	`attempt` integer,
	`activity_ids` text NOT NULL,
	`request` text,
	`response` text
);
--> statement-breakpoint
CREATE INDEX `communication_logs_time` ON `communication_logs` (`occurred_at`);--> statement-breakpoint
ALTER TABLE `activities` ADD `number` integer NOT NULL DEFAULT 0;
--> statement-breakpoint
WITH numbered AS (SELECT id, ROW_NUMBER() OVER (ORDER BY created_at, id) AS number FROM activities)
UPDATE activities SET number = (SELECT number FROM numbered WHERE numbered.id = activities.id);
--> statement-breakpoint
INSERT INTO activity_number_sequence (id, last_number) SELECT 1, COALESCE(MAX(number), 0) FROM activities;--> statement-breakpoint
CREATE UNIQUE INDEX `activities_number_unique` ON `activities` (`number`);