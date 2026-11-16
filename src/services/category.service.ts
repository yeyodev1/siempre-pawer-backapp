import { isValidObjectId } from "mongoose";
import { CustomError } from "../errors/customError.error";
import { Category } from "../models/category.model";
import { Product } from "../models/product.model";
import { slugify } from "../utils/slugify";
import { text } from "../utils/query";

/**
 * Solo categorías con productos publicados, y de sus subcategorías solo las
 * que tienen productos (en el orden del mapa; las sueltas van al final).
 */
export async function listPublic() {
  const [categories, groups] = await Promise.all([
    Category.find({ isActive: true }).sort({ order: 1, name: 1 }).lean<any[]>(),
    Product.aggregate<{ _id: { category: unknown; sub: string }; count: number }>([
      { $match: { isPublished: true, category: { $ne: null } } },
      { $group: { _id: { category: "$category", sub: "$subcategory" }, count: { $sum: 1 } } },
    ]),
  ]);
  return categories
    .map((c) => {
      const mine = groups.filter((g) => String(g._id.category) === String(c._id));
      const used = new Set(mine.map((g) => g._id.sub).filter(Boolean));
      const ordered = (c.subcategories ?? []).filter((s: string) => used.has(s));
      return {
        ...c,
        subcategories: [...ordered, ...[...used].filter((s) => !ordered.includes(s))],
        productCount: mine.reduce((sum, g) => sum + g.count, 0),
      };
    })
    .filter((c) => c.productCount > 0);
}

export async function listAdmin() {
  return Category.find().sort({ order: 1, name: 1 }).lean();
}

function parseInput(body: any, partial: boolean) {
  const data: Record<string, unknown> = {};
  if (!partial || body?.name !== undefined) {
    const name = text(body?.name);
    if (!name) throw new CustomError("Escribe el nombre de la categoría", 400);
    data.name = name;
  }
  if (body?.slug !== undefined || !partial) {
    const slug = slugify(text(body?.slug) || text(body?.name));
    if (!slug) throw new CustomError("El slug de la categoría no es válido", 400);
    data.slug = slug;
  }
  if (body?.description !== undefined) data.description = text(body.description);
  if (body?.image !== undefined) data.image = text(body.image);
  if (body?.subcategories !== undefined) {
    data.subcategories = (Array.isArray(body.subcategories) ? body.subcategories : [])
      .map(text)
      .filter(Boolean);
  }
  if (body?.order !== undefined) data.order = Number(body.order) || 0;
  if (body?.isActive !== undefined) data.isActive = Boolean(body.isActive);
  return data;
}

export async function create(body: any) {
  const category = await Category.create(parseInput(body, false));
  return category.toObject();
}

export async function update(id: string, body: any) {
  if (!isValidObjectId(id)) throw new CustomError("Categoría no encontrada", 404);
  const category = await Category.findByIdAndUpdate(
    id,
    { $set: parseInput(body, true) },
    {
      new: true,
      runValidators: true,
    },
  ).lean();
  if (!category) throw new CustomError("Categoría no encontrada", 404);
  return category;
}

export async function remove(id: string) {
  if (!isValidObjectId(id)) throw new CustomError("Categoría no encontrada", 404);
  const inUse = await Product.countDocuments({ category: id });
  if (inUse > 0) {
    throw new CustomError(
      `La categoría tiene ${inUse} producto(s). Muévelos a otra categoría antes de eliminarla`,
      409,
    );
  }
  const deleted = await Category.findByIdAndDelete(id);
  if (!deleted) throw new CustomError("Categoría no encontrada", 404);
  return { ok: true };
}
