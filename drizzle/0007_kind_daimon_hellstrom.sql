CREATE TABLE `beeper_chat_checkpoints` (
	`target_id` text NOT NULL,
	`chat_id` text NOT NULL,
	`cursor` text,
	`anchor_message_id` text,
	`pending_anchor_message_id` text,
	`started_at` text NOT NULL,
	PRIMARY KEY(`target_id`, `chat_id`)
);
--> statement-breakpoint
CREATE TABLE `beeper_seen_messages` (
	`target_id` text NOT NULL,
	`chat_id` text NOT NULL,
	`message_id` text NOT NULL,
	`observed_at` text NOT NULL,
	PRIMARY KEY(`target_id`, `chat_id`, `message_id`)
);
--> statement-breakpoint
CREATE TABLE `mcp_event_outbox` (
	`id` text PRIMARY KEY NOT NULL,
	`subscription_id` text NOT NULL,
	`event_id` text NOT NULL,
	`body` text NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`next_attempt_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`delivered_at` integer,
	`failed_at` integer,
	`last_error` text,
	FOREIGN KEY (`subscription_id`) REFERENCES `mcp_event_subscriptions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `mcp_event_outbox_identity` ON `mcp_event_outbox` (`subscription_id`,`event_id`);--> statement-breakpoint
CREATE INDEX `mcp_event_outbox_due` ON `mcp_event_outbox` (`next_attempt_at`);--> statement-breakpoint
CREATE TABLE `mcp_event_subscriptions` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`name` text NOT NULL,
	`arguments_json` text NOT NULL,
	`callback_url` text NOT NULL,
	`secret_ciphertext` text NOT NULL,
	`previous_secret_ciphertext` text,
	`rotation_expires_at` integer,
	`verified_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
