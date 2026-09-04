ALTER TABLE "shopping_item" ALTER COLUMN "product_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "shopping_item" ADD COLUMN "label" text;--> statement-breakpoint
ALTER TABLE "shopping_item" ADD COLUMN "source" text DEFAULT 'solver' NOT NULL;