CREATE TABLE `vacancy_subscriptions` (
	`id` text PRIMARY KEY NOT NULL,
	`matchId` text NOT NULL,
	`userId` text NOT NULL,
	FOREIGN KEY (`matchId`) REFERENCES `matches`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`userId`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `vacancy_match_user` ON `vacancy_subscriptions` (`matchId`,`userId`);