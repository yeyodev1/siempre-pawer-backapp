import { isValidObjectId } from "mongoose";
import { CustomError } from "../errors/customError.error";
import { Coupon } from "../models/coupon.model";
import { Order, OrderStatus } from "../models/order.model";
import { text } from "../utils/query";

// Estados en los que la venta ya cuenta para el influencer: pagada (card/transfer)
// o en preparación en adelante (contra entrega arranca ahí).
const COUNTED_STATUSES: OrderStatus[] = ["paid", "preparing", "shipped", "delivered"];

export function normalizeCode(code: unknown): string {
  return text(code).toUpperCase().replace(/\s+/g, "");
}

export async function findActive(code: unknown) {
  const normalized = normalizeCode(code);
  if (!normalized) return null;
  return Coupon.findOne({ code: normalized, isActive: true }).lean<any>();
}

export async function validate(code: unknown) {
  const coupon = await findActive(code);
  if (!coupon) throw new CustomError("Cupón no válido", 404);
  return { code: coupon.code, discountPct: coupon.discountPct };
}

/**
 * Único lugar que mueve uses/salesTotal/commissionTotal. Se llama después de
 * cada cambio de estado; es idempotente porque el pedido guarda si ya sumó
 * (couponMetrics.counted) y el cambio de esa bandera es atómico.
 */
export async function syncCouponMetrics(orderId: unknown): Promise<void> {
  try {
    const order = await Order.findById(orderId).lean<any>();
    if (!order?.couponCode) return;
    const counted = Boolean(order.couponMetrics?.counted);

    if (COUNTED_STATUSES.includes(order.status) && !counted) {
      const coupon = await Coupon.findOne({ code: order.couponCode }).lean<any>();
      if (!coupon) return;
      const sale = order.subtotal - order.discount;
      const commission = Math.round((sale * (coupon.commissionPct || 0)) / 100);
      const claimed = await Order.findOneAndUpdate(
        { _id: order._id, "couponMetrics.counted": { $ne: true } },
        { $set: { couponMetrics: { counted: true, sale, commission } } },
      );
      if (!claimed) return;
      await Coupon.updateOne(
        { _id: coupon._id },
        { $inc: { uses: 1, salesTotal: sale, commissionTotal: commission } },
      );
      return;
    }

    if (order.status === "cancelled" && counted) {
      const claimed = await Order.findOneAndUpdate(
        { _id: order._id, "couponMetrics.counted": true },
        { $set: { "couponMetrics.counted": false } },
      );
      if (!claimed) return;
      const { sale, commission } = order.couponMetrics;
      await Coupon.updateOne(
        { code: order.couponCode },
        { $inc: { uses: -1, salesTotal: -sale, commissionTotal: -commission } },
      );
    }
  } catch (error) {
    // Las métricas no deben tumbar un cambio de estado ya guardado.
    console.error("[coupon] no se pudieron actualizar las métricas:", error);
  }
}

// ─── Admin ────────────────────────────────────────────────────────────────

export async function list() {
  return Coupon.find().sort({ createdAt: -1 }).lean();
}

function pct(value: unknown, label: string): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > 100) {
    throw new CustomError(`El ${label} debe estar entre 0 y 100`, 400);
  }
  return n;
}

function parseInput(body: any, partial: boolean) {
  const data: Record<string, unknown> = {};
  if (!partial || body?.code !== undefined) {
    const code = normalizeCode(body?.code);
    if (!code) throw new CustomError("Escribe el código del cupón", 400);
    if (!/^[A-Z0-9_-]+$/.test(code)) {
      throw new CustomError(
        "El código solo puede tener letras, números, guiones y guiones bajos",
        400,
      );
    }
    data.code = code;
  }
  if (!partial || body?.discountPct !== undefined)
    data.discountPct = pct(body?.discountPct ?? 0, "descuento");
  if (!partial || body?.commissionPct !== undefined) {
    data.commissionPct = pct(body?.commissionPct ?? 0, "porcentaje de comisión");
  }
  for (const key of ["influencerName", "influencerEmail", "influencerInstagram", "notes"]) {
    if (body?.[key] !== undefined) data[key] = text(body[key]);
  }
  if (body?.isActive !== undefined) data.isActive = Boolean(body.isActive);
  return data;
}

export async function create(body: any) {
  const coupon = await Coupon.create(parseInput(body, false));
  return coupon.toObject();
}

export async function update(id: string, body: any) {
  if (!isValidObjectId(id)) throw new CustomError("Cupón no encontrado", 404);
  const coupon = await Coupon.findByIdAndUpdate(
    id,
    { $set: parseInput(body, true) },
    {
      new: true,
      runValidators: true,
    },
  ).lean();
  if (!coupon) throw new CustomError("Cupón no encontrado", 404);
  return coupon;
}

export async function remove(id: string) {
  if (!isValidObjectId(id)) throw new CustomError("Cupón no encontrado", 404);
  const deleted = await Coupon.findByIdAndDelete(id);
  if (!deleted) throw new CustomError("Cupón no encontrado", 404);
  return { ok: true };
}
