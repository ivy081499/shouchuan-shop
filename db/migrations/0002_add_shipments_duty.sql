CREATE TABLE `shipments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`arrived_at` integer,
	`duty_twd_cents` integer DEFAULT 0 NOT NULL,
	`note` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `shipments_arrived_idx` ON `shipments` (`arrived_at`);--> statement-breakpoint
ALTER TABLE `purchase_items` ADD `duty_share_twd_cents` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `purchases` ADD `shipment_id` integer REFERENCES shipments(id);