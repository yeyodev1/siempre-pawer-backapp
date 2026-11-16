import { isValidObjectId } from "mongoose";
import { CustomError } from "../errors/customError.error";
import { Product } from "../models/product.model";
import {
  PAYMENT_METHODS,
  PaymentMethod,
  SHIPPING_METHODS,
  ShippingMethod,
} from "../models/order.model";
import { findActive } from "./coupon.service";
import { getSettings } from "./settings.service";
import { isPayphoneEnabled } from "./payphone.service";

/**
 * Único cálculo de precios de la tienda. POST /orders/quote y POST /orders
 * llaman a priceCart con los mismos datos, así lo que el cliente ve en el
 * checkout es exactamente lo que se cobra. Todo en centavos.
 */

const MAX_QTY = 999;

export interface QuoteItem {
  productId: string;
  name: string;
  image: string;
  variant: string;
  qty: number;
  unitPrice: number;
  lineTotal: number;
}

export interface PricedLine extends QuoteItem {
  slug: string;
}

export interface PricingInput {
  items: unknown;
  paymentMethod: unknown;
  couponCode?: unknown;
  shippingMethod: unknown;
  isDistributor?: boolean;
}

export interface PricingResult {
  paymentMethod: PaymentMethod;
  shippingMethod: ShippingMethod;
  lines: PricedLine[];
  subtotal: number;
  discount: number;
  couponCode: string;
  shippingCost: number;
  total: number;
}

/**
 * Precio unitario de un producto.
 * - Distribuidor: distributorPrice (o el de transferencia si no tiene), sin tiers.
 * - Público: tier con mayor minQty <= qty (referido a tarjeta) más la diferencia
 *   del método contra tarjeta; sin tier, el precio del método.
 */
export function unitPriceFor(
  product: any,
  method: PaymentMethod,
  qty: number,
  isDistributor: boolean,
): number {
  if (isDistributor) return product.distributorPrice || product.prices.transfer;

  const methodPrice = product.prices[method];
  const tier = [...(product.volumeTiers ?? [])]
    .filter((t: any) => t.minQty <= qty)
    .sort((a: any, b: any) => b.minQty - a.minQty)[0];
  if (!tier) return methodPrice;
  return tier.unitPrice + (methodPrice - product.prices.card);
}

interface WantedLine {
  productId: string;
  variant: string;
  qty: number;
}

export function variantLabel(size: string, color: string): string {
  return [size, color].filter(Boolean).join(" · ");
}

/** Combinaciones válidas de un producto; vacío = el producto no tiene variantes. */
export function variantOptions(product: any): string[] {
  return (product.variants ?? []).flatMap((v: any) =>
    v.colors?.length ? v.colors.map((c: string) => variantLabel(v.size, c)) : [variantLabel(v.size, "")],
  );
}

function parseItems(raw: unknown): WantedLine[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new CustomError("Tu carrito está vacío", 400);
  }
  // Una línea por producto + variante; stock y tiers se validan sobre el total del producto.
  const merged = new Map<string, WantedLine>();
  for (const item of raw) {
    const productId = String((item as any)?.productId ?? "");
    const variant = String((item as any)?.variant ?? "").trim();
    const qty = Math.floor(Number((item as any)?.qty));
    if (!isValidObjectId(productId))
      throw new CustomError("Hay un producto inválido en el carrito", 400);
    if (!Number.isFinite(qty) || qty < 1)
      throw new CustomError("La cantidad debe ser al menos 1", 400);
    const key = `${productId}|${variant}`;
    const prev = merged.get(key);
    merged.set(key, { productId, variant, qty: (prev?.qty ?? 0) + qty });
  }
  return [...merged.values()];
}

export async function priceCart(input: PricingInput): Promise<PricingResult> {
  const isDistributor = Boolean(input.isDistributor);
  const settings = await getSettings();

  // Los distribuidores pagan solo por transferencia.
  const paymentMethod = (
    isDistributor ? "transfer" : String(input.paymentMethod ?? "")
  ) as PaymentMethod;
  if (!PAYMENT_METHODS.includes(paymentMethod)) {
    throw new CustomError("Escoge un método de pago válido", 400);
  }
  if (paymentMethod === "card" && !isPayphoneEnabled()) {
    throw new CustomError("El pago con tarjeta aún no está disponible", 400);
  }
  if (paymentMethod === "transfer" && !settings.transferEnabled && !isDistributor) {
    throw new CustomError("El pago por transferencia no está disponible por ahora", 400);
  }
  if (paymentMethod === "cod" && !settings.codEnabled) {
    throw new CustomError("El pago contra entrega no está disponible por ahora", 400);
  }

  const shippingMethod = String(input.shippingMethod || "delivery") as ShippingMethod;
  if (!SHIPPING_METHODS.includes(shippingMethod)) {
    throw new CustomError("Escoge un método de envío válido", 400);
  }

  const wanted = parseItems(input.items);
  const products = await Product.find({
    _id: { $in: wanted.map((w) => w.productId) },
    isPublished: true,
  }).lean<any[]>();
  const byId = new Map(products.map((p) => [String(p._id), p]));
  const qtyByProduct = new Map<string, number>();
  for (const w of wanted) qtyByProduct.set(w.productId, (qtyByProduct.get(w.productId) ?? 0) + w.qty);

  const lines: PricedLine[] = wanted.map(({ productId, variant, qty }) => {
    const product = byId.get(productId);
    if (!product)
      throw new CustomError("Uno de los productos de tu carrito ya no está disponible", 404);
    const totalQty = qtyByProduct.get(productId)!;
    if (totalQty > MAX_QTY)
      throw new CustomError(`La cantidad máxima por producto es ${MAX_QTY}`, 400);
    if (totalQty > product.stock) {
      throw new CustomError(
        product.stock > 0
          ? `Solo quedan ${product.stock} unidad(es) de "${product.name}"`
          : `"${product.name}" está agotado`,
        409,
      );
    }
    const options = variantOptions(product);
    if (options.length && !options.includes(variant)) {
      throw new CustomError(`Escoge talla y color de "${product.name}"`, 400);
    }
    const unitPrice = unitPriceFor(product, paymentMethod, totalQty, isDistributor);
    return {
      productId,
      name: product.name,
      slug: product.slug,
      image: product.images?.[0] ?? "",
      variant: options.length ? variant : "",
      qty,
      unitPrice,
      lineTotal: unitPrice * qty,
    };
  });

  const subtotal = lines.reduce((sum, line) => sum + line.lineTotal, 0);

  // A los distribuidores no se les aplican cupones.
  let discount = 0;
  let couponCode = "";
  if (!isDistributor && input.couponCode) {
    const coupon = await findActive(input.couponCode);
    if (!coupon) throw new CustomError("Cupón no válido", 404);
    couponCode = coupon.code;
    discount = Math.round((subtotal * coupon.discountPct) / 100);
  }

  let shippingCost = 0;
  if (shippingMethod === "delivery") {
    const free = settings.freeShippingFrom > 0 && subtotal >= settings.freeShippingFrom;
    shippingCost = free ? 0 : settings.shippingCost;
  }

  return {
    paymentMethod,
    shippingMethod,
    lines,
    subtotal,
    discount,
    couponCode,
    shippingCost,
    total: subtotal - discount + shippingCost,
  };
}

/** Forma pública del cálculo (respuesta de POST /orders/quote). */
export function toQuote(result: PricingResult) {
  return {
    items: result.lines.map(({ slug: _slug, ...item }) => item),
    subtotal: result.subtotal,
    discount: result.discount,
    couponCode: result.couponCode,
    shippingCost: result.shippingCost,
    total: result.total,
  };
}
