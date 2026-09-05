ALTER TABLE "shopping_item" DROP CONSTRAINT "shopping_item_product_id_product_id_fk";
--> statement-breakpoint
ALTER TABLE "shopping_item" ADD CONSTRAINT "shopping_item_product_id_product_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."product"("id") ON DELETE set null ON UPDATE no action;