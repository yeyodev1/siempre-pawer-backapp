/**
 * Carga el catálogo inicial desde src/scripts/data/catalogo-inicial.json.
 * Uso: pnpm seed:catalog
 *
 * Idempotente: upsert por slug. El stock solo se escribe al crear el producto
 * y las imágenes solo si el JSON trae alguna, para no pisar lo que el cliente
 * ya ajustó desde el panel al volver a correrlo.
 */
import "dotenv/config";
import fs from "fs";
import path from "path";
import mongoose from "mongoose";
import { dbConnect } from "../config/mongo";
import { Category } from "../models/category.model";
import { Product } from "../models/product.model";

const DATA_FILE = path.resolve(__dirname, "data", "catalogo-inicial.json");

const cents = (value: unknown) => Math.max(0, Math.round(Number(value) || 0));

async function main() {
  if (!fs.existsSync(DATA_FILE)) {
    console.error(`No existe ${DATA_FILE}`);
    process.exit(1);
  }
  const data = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  const categories: any[] = data.categories ?? [];
  const products: any[] = data.products ?? [];

  await dbConnect();

  const categoryIds = new Map<string, unknown>();
  for (const c of categories) {
    const slug = String(c.slug).toLowerCase();
    const doc = await Category.findOneAndUpdate(
      { slug },
      {
        $set: {
          name: c.name,
          description: c.description ?? "",
          order: Number(c.order) || 0,
        },
        $setOnInsert: { slug, isActive: true },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
    categoryIds.set(slug, doc._id);
  }
  console.log(`Categorías: ${categories.length}`);

  let created = 0;
  let updated = 0;
  for (const p of products) {
    const slug = String(p.slug).toLowerCase();
    const categorySlug = String(p.categorySlug ?? "").toLowerCase();
    let category = categoryIds.get(categorySlug);
    if (!category && categorySlug) {
      category = (await Category.findOne({ slug: categorySlug }).select("_id").lean<any>())?._id;
    }
    if (!category) console.warn(`  Sin categoría "${categorySlug}" para ${slug}`);

    const set: Record<string, unknown> = {
      name: p.name,
      sku: p.sku ?? "",
      category: category ?? null,
      shortDescription: p.shortDescription ?? "",
      description: p.description ?? "",
      features: p.features ?? [],
      specs: p.specs ?? [],
      prices: {
        card: cents(p.prices?.card),
        transfer: cents(p.prices?.transfer),
        cod: cents(p.prices?.cod),
      },
      compareAtPrice: p.compareAtPrice ? cents(p.compareAtPrice) : null,
      distributorPrice: p.distributorPrice ? cents(p.distributorPrice) : null,
      volumeTiers: (p.volumeTiers ?? []).map((t: any) => ({
        minQty: Number(t.minQty),
        unitPrice: cents(t.unitPrice),
      })),
      isPublished: p.isPublished ?? true,
      isFeatured: p.isFeatured ?? false,
      order: Number(p.order) || 0,
    };
    if (Array.isArray(p.images) && p.images.length) set.images = p.images;

    const result = await Product.updateOne(
      { slug },
      { $set: set, $setOnInsert: { slug, stock: Math.max(0, Math.floor(Number(p.stock) || 0)) } },
      { upsert: true, setDefaultsOnInsert: true },
    );
    if (result.upsertedCount) created++;
    else updated++;
  }
  console.log(`Productos: ${created} creados, ${updated} actualizados`);

  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error("Falló el seed del catálogo:", error);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
