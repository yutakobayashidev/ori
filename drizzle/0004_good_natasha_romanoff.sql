CREATE TABLE `auth_sessions` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`owner_id` integer NOT NULL,
	`expires_at` integer NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `workspace_owner`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `auth_throttle` (
	`id` integer PRIMARY KEY NOT NULL,
	`attempts` integer NOT NULL,
	`reset_at` integer NOT NULL,
	CONSTRAINT "auth_throttle_singleton" CHECK("auth_throttle"."id" = 1)
);
--> statement-breakpoint
CREATE TABLE `workspace_owner` (
	`id` integer PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`name` text NOT NULL,
	`password_hash` text NOT NULL,
	`onboarding_completed_at` integer,
	`created_at` integer NOT NULL,
	CONSTRAINT "workspace_owner_singleton" CHECK("workspace_owner"."id" = 1)
);
