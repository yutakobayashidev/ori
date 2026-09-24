CREATE TABLE `research_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`status` text NOT NULL,
	`updated_at` integer NOT NULL,
	`snapshot` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `research_state` (
	`id` integer PRIMARY KEY NOT NULL,
	`active_session_id` text,
	FOREIGN KEY (`active_session_id`) REFERENCES `research_sessions`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "research_state_singleton" CHECK("research_state"."id" = 1)
);
