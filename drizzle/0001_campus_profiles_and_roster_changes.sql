ALTER TABLE `entries` ADD `proposedRoster` text;--> statement-breakpoint
ALTER TABLE `entries` ADD `proposedNote` text;--> statement-breakpoint
ALTER TABLE `entries` ADD `rosterRevision` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `profiles` ADD `dept` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `profiles` ADD `skillLevel` text DEFAULT '' NOT NULL;