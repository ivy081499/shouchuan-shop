CREATE TABLE `beads` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`category` text,
	`size_mm` real,
	`color_hex` text,
	`supplier_id` integer,
	`source_url` text,
	`source_title` text,
	`source_spec` text,
	`unit_cost_cents` integer DEFAULT 0 NOT NULL,
	`stock_qty` integer DEFAULT 0 NOT NULL,
	`reorder_point` integer DEFAULT 0 NOT NULL,
	`is_archived` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`supplier_id`) REFERENCES `suppliers`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `beads_supplier_idx` ON `beads` (`supplier_id`);--> statement-breakpoint
CREATE INDEX `beads_category_idx` ON `beads` (`category`);--> statement-breakpoint
CREATE UNIQUE INDEX `beads_source_uq` ON `beads` (`source_url`,`source_spec`);--> statement-breakpoint
CREATE TABLE `order_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`order_id` integer NOT NULL,
	`product_id` integer,
	`product_name` text NOT NULL,
	`unit_price_cents` integer NOT NULL,
	`unit_cost_cents` integer DEFAULT 0 NOT NULL,
	`qty` integer NOT NULL,
	`available_at_order_time` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `order_items_order_idx` ON `order_items` (`order_id`);--> statement-breakpoint
CREATE INDEX `order_items_product_idx` ON `order_items` (`product_id`);--> statement-breakpoint
CREATE TABLE `orders` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`order_no` text NOT NULL,
	`customer_name` text NOT NULL,
	`customer_phone` text NOT NULL,
	`customer_email` text,
	`shipping_address` text NOT NULL,
	`customer_note` text,
	`subtotal_cents` integer NOT NULL,
	`shipping_fee_cents` integer DEFAULT 0 NOT NULL,
	`total_cents` integer NOT NULL,
	`cost_snapshot_cents` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'pending_payment' NOT NULL,
	`transfer_last5` text,
	`transfer_reported_at` integer,
	`paid_at` integer,
	`shipped_at` integer,
	`tracking_no` text,
	`cancelled_at` integer,
	`stock_deducted` integer DEFAULT false NOT NULL,
	`admin_note` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `orders_no_uq` ON `orders` (`order_no`);--> statement-breakpoint
CREATE INDEX `orders_status_idx` ON `orders` (`status`);--> statement-breakpoint
CREATE INDEX `orders_created_idx` ON `orders` (`created_at`);--> statement-breakpoint
CREATE TABLE `product_images` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`product_id` integer NOT NULL,
	`r2_key` text NOT NULL,
	`alt` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `product_images_product_idx` ON `product_images` (`product_id`);--> statement-breakpoint
CREATE TABLE `products` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`price_cents` integer NOT NULL,
	`wrist_size_cm` real,
	`manual_stock` integer,
	`status` text DEFAULT 'draft' NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `products_slug_uq` ON `products` (`slug`);--> statement-breakpoint
CREATE INDEX `products_status_idx` ON `products` (`status`);--> statement-breakpoint
CREATE TABLE `purchase_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`purchase_id` integer NOT NULL,
	`bead_id` integer,
	`raw_title` text NOT NULL,
	`raw_spec` text,
	`raw_url` text,
	`unit_price_cny_cents` integer NOT NULL,
	`quantity` integer NOT NULL,
	`beads_per_unit` integer,
	`count_source` text DEFAULT 'parsed' NOT NULL,
	`freight_share_cny_cents` integer DEFAULT 0 NOT NULL,
	`computed_unit_cost_cents` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`purchase_id`) REFERENCES `purchases`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`bead_id`) REFERENCES `beads`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `purchase_items_purchase_idx` ON `purchase_items` (`purchase_id`);--> statement-breakpoint
CREATE INDEX `purchase_items_bead_idx` ON `purchase_items` (`bead_id`);--> statement-breakpoint
CREATE TABLE `purchases` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`source_order_no` text,
	`supplier_id` integer,
	`ordered_at` integer,
	`fx_rate_x100` integer NOT NULL,
	`freight_cny_cents` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`note` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`supplier_id`) REFERENCES `suppliers`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `purchases_supplier_idx` ON `purchases` (`supplier_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `purchases_source_no_uq` ON `purchases` (`source_order_no`);--> statement-breakpoint
CREATE TABLE `recipes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`product_id` integer NOT NULL,
	`bead_id` integer NOT NULL,
	`qty` integer NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`bead_id`) REFERENCES `beads`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `recipes_product_idx` ON `recipes` (`product_id`);--> statement-breakpoint
CREATE INDEX `recipes_bead_idx` ON `recipes` (`bead_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `recipes_product_bead_uq` ON `recipes` (`product_id`,`bead_id`);--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`label` text,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `stock_ledger` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`bead_id` integer NOT NULL,
	`delta_qty` integer NOT NULL,
	`balance_after` integer NOT NULL,
	`reason` text NOT NULL,
	`ref_id` integer,
	`note` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`bead_id`) REFERENCES `beads`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `stock_ledger_bead_idx` ON `stock_ledger` (`bead_id`);--> statement-breakpoint
CREATE INDEX `stock_ledger_created_idx` ON `stock_ledger` (`created_at`);--> statement-breakpoint
CREATE TABLE `suppliers` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`note` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `suppliers_name_uq` ON `suppliers` (`name`);