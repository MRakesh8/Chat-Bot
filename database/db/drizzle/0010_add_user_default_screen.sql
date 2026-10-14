ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "default_screen" varchar(100) DEFAULT '/projects' NOT NULL;
