CREATE TABLE `purchase_list_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`list_id` integer NOT NULL,
	`bead_id` integer NOT NULL,
	`qty` integer DEFAULT 0 NOT NULL,
	`source` text DEFAULT 'manual' NOT NULL,
	`note` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`list_id`) REFERENCES `purchase_lists`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`bead_id`) REFERENCES `beads`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `purchase_list_items_list_idx` ON `purchase_list_items` (`list_id`);--> statement-breakpoint
CREATE INDEX `purchase_list_items_bead_idx` ON `purchase_list_items` (`bead_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `purchase_list_items_uq` ON `purchase_list_items` (`list_id`,`bead_id`);--> statement-breakpoint
CREATE TABLE `purchase_lists` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`note` text,
	`status` text DEFAULT 'draft' NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `purchase_lists_status_idx` ON `purchase_lists` (`status`);