import { isValidObjectId } from "mongoose";
import { CustomError } from "../errors/customError.error";
import { Category } from "../models/category.model";
import { Product } from "../models/product.model";
import { slugify } from "../utils/slugify";
import { text } from "../utils/query";

export async function listPublic() {
  return Category.find({ isActive: true }).sort({ order: 1, name: 1 }).lean();
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
