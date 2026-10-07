import { isValidObjectId } from "mongoose";
import { CustomError } from "../errors/customError.error";
import { Category } from "../models/category.model";
import { Product } from "../models/product.model";
import { slugify } from "../utils/slugify";
import { escapeRegex, paginated, parsePagination, text, toCents } from "../utils/query";

const CATEGORY_FIELDS = "name slug";

/** El precio de distribuidor solo viaja a distribuidores con sesión. */
export function serialize(product: any, isDistributor: boolean) {
  const obj = typeof product?.toObject === "function" ? product.toObject() : { ...product };
  delete obj.__v;
  if (!isDistributor) delete obj.distributorPrice;
  return obj;
}

const SORTS: Record<string, Record<string, 1 | -1>> = {
  newest: { createdAt: -1 },
  price_asc: { "prices.card": 1, createdAt: -1 },
  price_desc: { "prices.card": -1, createdAt: -1 },
};

export async function listPublic(query: any, isDistributor: boolean) {
  const { page, limit, skip } = parsePagination(query, 12, 60);
  const filter: Record<string, unknown> = { isPublished: true };

  const categorySlug = text(query?.category);
  if (categorySlug) {
    const category = await Category.findOne({ slug: categorySlug.toLowerCase() })
      .select("_id")
      .lean<any>();
    if (!category) return paginated([], 0, page, limit);
    filter.category = category._id;
  }
  const search = text(query?.search);
  if (search) {
    const rx = new RegExp(escapeRegex(search), "i");
    filter.$or = [{ name: rx }, { sku: rx }, { shortDescription: rx }];
  }
  if (text(query?.featured) === "true") filter.isFeatured = true;

  const sort = SORTS[text(query?.sort)] ?? { order: 1, createdAt: -1 };
  const [items, total] = await Promise.all([
    Product.find(filter)
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .populate("category", CATEGORY_FIELDS)
      .lean(),
    Product.countDocuments(filter),
  ]);
  return paginated(
    items.map((p: any) => serialize(p, isDistributor)),
    total,
    page,
    limit,
  );
}

export async function getBySlug(slug: string, isDistributor: boolean) {
  const product = await Product.findOne({ slug: slug.toLowerCase(), isPublished: true })
    .populate("category", CATEGORY_FIELDS)
    .lean<any>();
  if (!product) throw new CustomError("Producto no encontrado", 404);

  const related = product.category
    ? await Product.find({
        isPublished: true,
        category: product.category._id,
        _id: { $ne: product._id },
      })
        .sort({ order: 1, createdAt: -1 })
        .limit(4)
        .populate("category", CATEGORY_FIELDS)
        .lean()
    : [];

  return {
    ...serialize(product, isDistributor),
    related: related.map((p: any) => serialize(p, isDistributor)),
  };
}

// ─── Admin ────────────────────────────────────────────────────────────────

export async function listAdmin(query: any) {
  const { page, limit, skip } = parsePagination(query, 20, 100);
  const filter: Record<string, unknown> = {};
  const search = text(query?.search);
  if (search) {
    const rx = new RegExp(escapeRegex(search), "i");
    filter.$or = [{ name: rx }, { sku: rx }, { slug: rx }];
  }
  const category = text(query?.category);
  if (category) {
    if (isValidObjectId(category)) filter.category = category;
    else {
      const found = await Category.findOne({ slug: category.toLowerCase() })
        .select("_id")
        .lean<any>();
      filter.category = found?._id ?? null;
    }
  }
  const [items, total] = await Promise.all([
    Product.find(filter)
      .sort({ order: 1, createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("category", CATEGORY_FIELDS)
      .lean(),
    Product.countDocuments(filter),
  ]);
  return paginated(items, total, page, limit);
}

export async function getAdmin(id: string) {
  if (!isValidObjectId(id)) throw new CustomError("Producto no encontrado", 404);
  const product = await Product.findById(id).populate("category", CATEGORY_FIELDS).lean();
  if (!product) throw new CustomError("Producto no encontrado", 404);
  return product;
}

function optionalCents(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const cents = toCents(value);
  return cents > 0 ? cents : null;
}

async function parseInput(body: any, partial: boolean) {
  const data: Record<string, unknown> = {};
  const has = (key: string) => !partial || body?.[key] !== undefined;

  if (has("name")) {
    const name = text(body?.name);
    if (!name) throw new CustomError("Escribe el nombre del producto", 400);
    data.name = name;
  }
  if (!partial || body?.slug !== undefined) {
    const slug = slugify(text(body?.slug) || text(body?.name));
    if (!slug) throw new CustomError("El slug del producto no es válido", 400);
    data.slug = slug;
  }
  if (has("category")) {
    const category = text(body?.category?._id ?? body?.category);
    if (!category) data.category = null;
    else {
      if (!isValidObjectId(category) || !(await Category.exists({ _id: category }))) {
        throw new CustomError("La categoría no existe", 400);
      }
      data.category = category;
    }
  }
  if (has("prices")) {
    const prices = {
      card: toCents(body?.prices?.card),
      transfer: toCents(body?.prices?.transfer),
      cod: toCents(body?.prices?.cod),
    };
    if (!prices.card || !prices.transfer || !prices.cod) {
      throw new CustomError(
        "Escribe los tres precios (tarjeta, transferencia y contra entrega)",
        400,
      );
    }
    data.prices = prices;
  }
  for (const key of ["sku", "shortDescription", "description"]) {
    if (body?.[key] !== undefined) data[key] = text(body[key]);
  }
  if (body?.features !== undefined) {
    data.features = (Array.isArray(body.features) ? body.features : []).map(text).filter(Boolean);
  }
  if (body?.specs !== undefined) {
    data.specs = (Array.isArray(body.specs) ? body.specs : [])
      .map((s: any) => ({ label: text(s?.label), value: text(s?.value) }))
      .filter((s: any) => s.label || s.value);
  }
  if (body?.images !== undefined) {
    data.images = (Array.isArray(body.images) ? body.images : []).map(text).filter(Boolean);
  }
  if (body?.compareAtPrice !== undefined) data.compareAtPrice = optionalCents(body.compareAtPrice);
  if (body?.distributorPrice !== undefined)
    data.distributorPrice = optionalCents(body.distributorPrice);
  if (body?.volumeTiers !== undefined) {
    data.volumeTiers = (Array.isArray(body.volumeTiers) ? body.volumeTiers : [])
      .map((t: any) => ({
        minQty: Math.floor(Number(t?.minQty)),
        unitPrice: toCents(t?.unitPrice),
      }))
      .filter((t: any) => t.minQty >= 1 && t.unitPrice > 0)
      .sort((a: any, b: any) => a.minQty - b.minQty);
  }
  if (body?.stock !== undefined) data.stock = Math.max(0, Math.floor(Number(body.stock)) || 0);
  if (body?.isPublished !== undefined) data.isPublished = Boolean(body.isPublished);
  if (body?.isFeatured !== undefined) data.isFeatured = Boolean(body.isFeatured);
  if (body?.order !== undefined) data.order = Number(body.order) || 0;
  return data;
}

export async function create(body: any) {
  const product = await Product.create(await parseInput(body, false));
  return getAdmin(String(product._id));
}

export async function update(id: string, body: any) {
  if (!isValidObjectId(id)) throw new CustomError("Producto no encontrado", 404);
  const updated = await Product.findByIdAndUpdate(
    id,
    { $set: await parseInput(body, true) },
    {
      new: true,
      runValidators: true,
    },
  );
  if (!updated) throw new CustomError("Producto no encontrado", 404);
  return getAdmin(id);
}

export async function remove(id: string) {
  if (!isValidObjectId(id)) throw new CustomError("Producto no encontrado", 404);
  const deleted = await Product.findByIdAndDelete(id);
  if (!deleted) throw new CustomError("Producto no encontrado", 404);
  return { ok: true };
}
