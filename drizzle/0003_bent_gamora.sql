PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_baby` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text,
	`birthdate` integer,
	`default_window_days` integer DEFAULT 3 NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_baby`("id", "name", "birthdate", "default_window_days") SELECT "id", "name", "birthdate", "default_window_days" FROM `baby`;--> statement-breakpoint
DROP TABLE `baby`;--> statement-breakpoint
ALTER TABLE `__new_baby` RENAME TO `baby`;--> statement-breakpoint
PRAGMA foreign_keys=ON;