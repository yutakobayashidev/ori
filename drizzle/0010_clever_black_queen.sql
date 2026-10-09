CREATE TABLE `activity_time` (
	`activity_id` text PRIMARY KEY NOT NULL,
	`remaining_estimate` text,
	`remaining_override` text,
	`estimate_updated_at` integer,
	`user_estimate_updated_at` integer,
	`initial_estimated_minutes` integer,
	`initial_captured` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`activity_id`) REFERENCES `activities`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `day_selections` (
	`activity_id` text NOT NULL,
	`date` text NOT NULL,
	`time_zone` text NOT NULL,
	`section` text NOT NULL,
	`rank` integer NOT NULL,
	`origin` text NOT NULL,
	`reason` text,
	`user_adjusted_at` integer,
	`excluded` integer DEFAULT false NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`date`, `activity_id`),
	FOREIGN KEY (`activity_id`) REFERENCES `activities`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `focus_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`activity_id` text NOT NULL,
	`budget_seconds` integer NOT NULL,
	`time_zone` text NOT NULL,
	`state` text NOT NULL,
	`started_at` integer NOT NULL,
	`running_since` integer,
	`elapsed_active_seconds` integer NOT NULL,
	`ended_at` integer,
	FOREIGN KEY (`activity_id`) REFERENCES `activities`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `focus_single_unfinished` ON `focus_sessions` ((1)) WHERE "focus_sessions"."state" != 'ended';--> statement-breakpoint
CREATE TABLE `work_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`activity_id` text NOT NULL,
	`duration_seconds` integer NOT NULL,
	`occurred_on` text NOT NULL,
	`source` text NOT NULL,
	`focus_session_id` text,
	`started_at` integer,
	`ended_at` integer,
	`note` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`activity_id`) REFERENCES `activities`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`focus_session_id`) REFERENCES `focus_sessions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `work_logs_focus_session_id_unique` ON `work_logs` (`focus_session_id`);