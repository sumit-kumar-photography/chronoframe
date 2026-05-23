CREATE TABLE `youtube_videos` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`youtube_id` text NOT NULL,
	`url` text NOT NULL,
	`title` text,
	`thumbnail_url` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_youtube_videos_youtube_id` ON `youtube_videos` (`youtube_id`);--> statement-breakpoint
CREATE TABLE `album_youtube_videos` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`album_id` integer NOT NULL,
	`youtube_video_id` integer NOT NULL,
	`position` real DEFAULT 1000000 NOT NULL,
	`added_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`album_id`) REFERENCES `albums`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`youtube_video_id`) REFERENCES `youtube_videos`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_album_youtube_videos_album_video` ON `album_youtube_videos` (`album_id`,`youtube_video_id`);
