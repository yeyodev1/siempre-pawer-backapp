/**
 * Aplica el "Mapa de categorías" del cliente (hoja de Google del 2026-11-11).
 * Uso: pnpm seed:categories
 *
 * Idempotente: upsert por slug. Solo toca nombre, orden y subcategorías de la
 * categoría, y la subcategoría de los productos que aún no tienen una.
 */
import "dotenv/config";
import mongoose from "mongoose";
import { dbConnect } from "../config/mongo";
import { Category } from "../models/category.model";
import { Product } from "../models/product.model";

const BALL_EXTRAS = [
  "Rodilleras", "Medias antideslizantes", "Polines precortados", "Canilleras", "Portacanilleras",
  "Cobán", "Kinesiológico", "Linimento olímpico", "Guantes de arquero", "Cintas de capitán",
  "Tableros tácticos", "Tulas", "Chalecos",
];

const MAP: { slug: string; name: string; subcategories: string[] }[] = [
  {
    slug: "futbol",
    name: "Fútbol",
    subcategories: [
      "Balones N5", "Balones N4", "Balones N3", "Medias antideslizantes", "Polines precortados",
      "Canilleras", "Portacanilleras", "Cobán", "Kinesiológico", "Linimento olímpico",
      "Guantes de arquero", "Cintas de capitán", "Tableros tácticos", "Tulas", "Chalecos", "Infladores",
    ],
  },
  { slug: "futsal", name: "Futsal", subcategories: ["Balones N4", ...BALL_EXTRAS] },
  { slug: "indoor", name: "Indoor", subcategories: ["Balones N3", ...BALL_EXTRAS] },
  {
    slug: "voley",
    name: "Vóley",
    subcategories: [
      "Balones", "Medias", "Rodilleras", "Rodilleras rehab", "Mangas", "Cintillos", "Plantillas",
      "Red de vóley", "Antenas", "Marcador",
    ],
  },
  {
    slug: "ecuavoley",
    name: "Ecuavóley",
    subcategories: ["Balones", "Medias", "Rodilleras rehab", "Mangas", "Plantillas", "Red de ecuavóley"],
  },
  { slug: "basket", name: "Básquet", subcategories: ["Balones", "Medias", "Red de básquet", "Tableros tácticos"] },
  {
    slug: "implementos",
    name: "Implementos",
    subcategories: [
      "Vallas", "Conos", "Discos", "Maniquís", "Silbatos", "Tarjetas", "Cintas de capitán",
      "Tableros tácticos", "Tulas", "Chalecos", "Infladores",
    ],
  },
  {
    slug: "rehab",
    name: "Rehab",
    subcategories: [
      "Rodilleras", "Tobilleras", "Bosu", "Mini bosu", "Banda rotuliana", "Cobán", "Kinesiológico",
      "Linimento olímpico", "Roller foam",
    ],
  },
  { slug: "uniformes", name: "Uniformes", subcategories: ["Camisetas", "Básico", "Competición", "Semi pro", "Pro", "Chalecos"] },
  { slug: "bolsos", name: "Bolsos", subcategories: ["Premium", "Premium porta", "Todo terreno", "Sport bags"] },
  { slug: "publicitarios", name: "Publicitarios", subcategories: ["Gorras", "Termos", "Sport bags"] },
];

// Subcategoría inicial de los productos que ya existen.
const PRODUCT_SUBCATEGORY: Record<string, string> = {
  "balon-pawer-n5": "Balones N5",
  "balon-pawer-t90-n5": "Balones N5",
  "balon-pawer-liga-pro-n5": "Balones N5",
  "balon-pawer-tt5-n5": "Balones N5",
  "balon-pawer-5000-n5": "Balones N5",
  "balon-pawer-tt4": "Balones N4",
  "balon-pawer-ninos-n4": "Balones N4",
  "balon-futsal-pawer-n4": "Balones N4",
  "balon-futsal-pawer-t90": "Balones N4",
  "balon-pawer-indoor-n3": "Balones N3",
  "balon-mikasa-v200w": "Balones",
  "balon-mikasa-v330w": "Balones",
};

async function main() {
  await dbConnect();
  for (const [i, c] of MAP.entries()) {
    await Category.updateOne(
      { slug: c.slug },
      { $set: { name: c.name, order: i + 1, subcategories: c.subcategories }, $setOnInsert: { slug: c.slug, isActive: true } },
      { upsert: true },
    );
  }
  // Las categorías fuera del mapa (ej. Escolar) quedan al final, sin ocultarse.
  await Category.updateMany({ slug: { $nin: MAP.map((c) => c.slug) } }, { $set: { order: 99 } });
  for (const [slug, subcategory] of Object.entries(PRODUCT_SUBCATEGORY)) {
    await Product.updateOne({ slug, subcategory: { $in: ["", null] } }, { $set: { subcategory } });
  }
  console.log(`Categorías: ${MAP.length}`);
  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error("Falló el mapa de categorías:", error);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
