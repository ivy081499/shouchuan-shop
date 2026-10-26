ALTER TABLE `beads` ADD `color_family` text;--> statement-breakpoint
ALTER TABLE `product_images` ADD `audience` text DEFAULT 'customer' NOT NULL;--> statement-breakpoint
ALTER TABLE `product_images` ADD `deleted_at` integer;--> statement-breakpoint
CREATE INDEX `product_images_audience_idx` ON `product_images` (`product_id`,`audience`);--> statement-breakpoint
ALTER TABLE `products` ADD `deleted_at` integer;--> statement-breakpoint
CREATE INDEX `products_deleted_idx` ON `products` (`deleted_at`);--> statement-breakpoint
ALTER TABLE `recipes` ADD `deleted_at` integer;