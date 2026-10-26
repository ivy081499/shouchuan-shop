ALTER TABLE `purchase_items` ADD `received_at` integer;--> statement-breakpoint
CREATE INDEX `purchase_items_received_idx` ON `purchase_items` (`received_at`);