CREATE TABLE `activities` (
	`id` text PRIMARY KEY NOT NULL,
	`proposal` text NOT NULL,
	`user_state` text NOT NULL,
	`user_overrides` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `activity_receipts` (
	`request_id` text PRIMARY KEY NOT NULL,
	`input_hash` text NOT NULL,
	`result` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `activity_revision` (
	`id` integer PRIMARY KEY NOT NULL,
	`revision` integer NOT NULL,
	CONSTRAINT "activity_revision_singleton" CHECK("activity_revision"."id" = 1),
	CONSTRAINT "activity_revision_nonnegative" CHECK("activity_revision"."revision" >= 0)
);
