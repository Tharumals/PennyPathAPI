-- Clerk userIds are opaque strings ("user_..."), so user id columns move from uuid to text.
-- The FK must be dropped first: Postgres refuses to alter a column type that is referenced.
ALTER TABLE "tasks" DROP CONSTRAINT "tasks_user_id_profiles_id_fk";--> statement-breakpoint
ALTER TABLE "profiles" ALTER COLUMN "id" TYPE text USING "id"::text;--> statement-breakpoint
ALTER TABLE "tasks" ALTER COLUMN "user_id" TYPE text USING "user_id"::text;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;