import mongoose, { isValidObjectId } from "mongoose";
import { CustomError } from "../errors/customError.error";
import { Counter } from "../models/counter.model";
import { Order, ORDER_STATUSES, OrderStatus } from "../models/order.model";
import { Product } from "../models/product.model";
import { JwtPayload } from "../types/AuthRequest";
import { escapeRegex, paginated, parsePagination, text } from "../utils/query";
import { priceCart, toQuote } from "./pricing.service";
import { syncCouponMetrics } from "./coupon.service";
import * as payphoneService from "./payphone.service";
import * as orderEmail from "./orderEmail.service";
import { uploadBuffer } from "./cloudinary.service";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const FIRST_ORDER_NUMBER = 1000;
// Payphone reversa el cobro a los 5 minutos sin confirmar; pasado este margen
// el pedido con tarjeta ya no se va a pagar y se libera su stock.
const CARD_PENDING_TTL_MS = 30 * 60 * 1000;

function isDistributor(user?: JwtPayload): boolean {
  return user?.accountType === "distributor";
}

function historyEntry(status: string, note: string) {
  return { status, note, at: new Date() };
}

/** Vista pública: sin notas internas, respuesta cruda de Payphone ni métricas. */
export function toPublic(order: any) {
  const obj = typeof order?.toObject === "function" ? order.toObject() : { ...order };
  delete obj.__v;
  delete obj.notes;
  delete obj.couponMetrics;
  delete obj.distributor;
  if (obj.payphone) {
    obj.payphone = {
      clientTransactionId: obj.payphone.clientTransactionId,
      transactionId: obj.payphone.transactionId,
      statusCode: obj.payphone.statusCode,
    };
  }
  return obj;
}

async function restock(order: any): Promise<void> {
  await Promise.all(
    order.items.map((item: any) =>
      Product.updateOne({ _id: item.product }, { $inc: { stock: item.qty } }),
    ),
  );
}

/**
 * Cancela un pedido una sola vez: la transición es condicional al estado
 * actual, así dos llamadas simultáneas no reponen el stock dos veces.
 */
async function cancelOrder(order: any, note: string, extraSet: Record<string, unknown> = {}) {
  const updated = await Order.findOneAndUpdate(
    { _id: order._id, status: order.status },
    {
      $set: { ...extraSet, status: "cancelled" },
      $push: { history: historyEntry("cancelled", note) },
    },
    { new: true },
  );
  if (!updated) return null;
  await restock(updated);
  await syncCouponMetrics(updated._id);
  return updated;
}

/**
 * Pedidos con tarjeta que nunca se confirmaron. Se llama de forma perezosa al
 * crear y listar pedidos porque en Vercel no hay procesos de fondo.
 */
export async function releaseExpiredCardOrders(): Promise<void> {
  try {
    const limit = new Date(Date.now() - CARD_PENDING_TTL_MS);
    const expired = await Order.find({
      paymentMethod: "card",
      status: "pending_payment",
      createdAt: { $lt: limit },
    });
    for (const order of expired) {
      await cancelOrder(order, "Pago con tarjeta no confirmado a tiempo");
    }
  } catch (error) {
    console.error("[order] no se pudieron liberar pedidos vencidos:", error);
  }
}

// ─── Validación de datos del checkout ───────────────────────────────────────

function parseCustomer(raw: any) {
  const customer = {
    firstName: text(raw?.firstName),
    lastName: text(raw?.lastName),
    email: text(raw?.email).toLowerCase(),
    phone: text(raw?.phone),
    documentId: text(raw?.documentId),
  };
  if (!customer.firstName) throw new CustomError("Escribe tu nombre", 400);
  if (!customer.lastName) throw new CustomError("Escribe tu apellido", 400);
  if (!EMAIL.test(customer.email)) throw new CustomError("Escribe un correo válido", 400);
  if (customer.phone.replace(/\D/g, "").length < 7)
    throw new CustomError("Escribe un teléfono válido", 400);
  return customer;
}

function parseShipping(
  raw: any,
  fallbackMethod: unknown,
  customer: ReturnType<typeof parseCustomer>,
) {
  const method = text(raw?.method || fallbackMethod || "delivery");
  const shipping = {
    method,
    receiverName: text(raw?.receiverName) || `${customer.firstName} ${customer.lastName}`,
    receiverPhone: text(raw?.receiverPhone) || customer.phone,
    province: text(raw?.province),
    city: text(raw?.city),
    address: text(raw?.address),
    reference: text(raw?.reference),
  };
  if (method === "delivery") {
    if (!shipping.province) throw new CustomError("Escoge la provincia de entrega", 400);
    if (!shipping.city) throw new CustomError("Escribe la ciudad de entrega", 400);
    if (!shipping.address) throw new CustomError("Escribe la dirección de entrega", 400);
  }
  return shipping;
}

function parseInvoice(raw: any, customer: ReturnType<typeof parseCustomer>) {
  if (!raw?.required) return { required: false, name: "", documentId: "", email: "", address: "" };
  const invoice = {
    required: true,
    name: text(raw?.name),
    documentId: text(raw?.documentId),
    email: text(raw?.email).toLowerCase() || customer.email,
    address: text(raw?.address),
  };
  if (!invoice.name) throw new CustomError("Escribe la razón social o nombre para la factura", 400);
  if (!/^\d{10}(\d{3})?$/.test(invoice.documentId)) {
    throw new CustomError(
      "La cédula (10 dígitos) o RUC (13 dígitos) de la factura no es válido",
      400,
    );
  }
  if (!EMAIL.test(invoice.email))
    throw new CustomError("El correo de la factura no es válido", 400);
  if (!invoice.address) throw new CustomError("Escribe la dirección de facturación", 400);
  return invoice;
}

// ─── Público ────────────────────────────────────────────────────────────────

export async function quote(body: any, user?: JwtPayload) {
  const result = await priceCart({
    items: body?.items,
    paymentMethod: body?.paymentMethod,
    couponCode: body?.couponCode,
    shippingMethod: body?.shippingMethod,
    isDistributor: isDistributor(user),
  });
  return toQuote(result);
}

export async function createOrder(body: any, user?: JwtPayload) {
  const distributor = isDistributor(user);
  const customer = parseCustomer(body?.customer);
  const shipping = parseShipping(body?.shipping, body?.shippingMethod, customer);
  const invoice = parseInvoice(body?.invoice, customer);

  await releaseExpiredCardOrders();

  // Mismo cálculo que /orders/quote.
  const priced = await priceCart({
    items: body?.items,
    paymentMethod: body?.paymentMethod,
    couponCode: body?.couponCode,
    shippingMethod: shipping.method,
    isDistributor: distributor,
  });

  if (priced.paymentMethod === "card" && !customer.documentId) {
    throw new CustomError("Escribe tu cédula para pagar con tarjeta", 400);
  }

  // Contra entrega no requiere pago previo; tarjeta y transferencia esperan el pago.
  const status: OrderStatus = priced.paymentMethod === "cod" ? "preparing" : "pending_payment";

  const session = await mongoose.startSession();
  let orderId: unknown;
  try {
    await session.withTransaction(async () => {
      for (const line of priced.lines) {
        const updated = await Product.findOneAndUpdate(
          { _id: line.productId, stock: { $gte: line.qty } },
          { $inc: { stock: -line.qty } },
          { session, new: true },
        );
        if (!updated) {
          const current = await Product.findById(line.productId)
            .select("stock")
            .session(session)
            .lean<any>();
          const available = current?.stock ?? 0;
          throw new CustomError(
            available > 0
              ? `Solo quedan ${available} unidad(es) de "${line.name}"`
              : `"${line.name}" se acaba de agotar`,
            409,
          );
        }
      }

      const counter = await Counter.findOneAndUpdate(
        { _id: "order" },
        { $inc: { seq: 1 } },
        { upsert: true, new: true, session },
      );
      const number = `PW-${FIRST_ORDER_NUMBER + counter.seq}`;

      const [order] = await Order.create(
        [
          {
            number,
            customer,
            shipping,
            invoice,
            items: priced.lines.map((l) => ({
              product: l.productId,
              name: l.name,
              slug: l.slug,
              image: l.image,
              qty: l.qty,
              unitPrice: l.unitPrice,
              lineTotal: l.lineTotal,
            })),
            paymentMethod: priced.paymentMethod,
            subtotal: priced.subtotal,
            discount: priced.discount,
            couponCode: priced.couponCode,
            shippingCost: priced.shippingCost,
            total: priced.total,
            status,
            payphone: {
              clientTransactionId:
                priced.paymentMethod === "card"
                  ? payphoneService.newClientTransactionId(number)
                  : "",
            },
            isDistributor: distributor,
            distributor: distributor ? user!.userId : null,
            history: [
              historyEntry(
                status,
                status === "preparing"
                  ? "Pedido contra entrega recibido"
                  : "Pedido creado, esperando el pago",
              ),
            ],
          },
        ],
        { session },
      );
      orderId = order._id;
    });
  } finally {
    await session.endSession();
  }

  const order = await Order.findById(orderId);
  if (!order) throw new CustomError("No se pudo crear el pedido", 500);

  if (order.paymentMethod === "card") {
    // El correo de "pedido recibido" sale cuando Payphone confirma el pago.
    return { order: toPublic(order), payphone: payphoneService.buildCheckout(order) };
  }

  await syncCouponMetrics(order._id);
  await orderEmail.sendOrderPlaced(order);
  return { order: toPublic(order) };
}

/**
 * Confirmación de la Cajita de Pagos. Idempotente: si el pedido ya salió de
 * pending_payment se devuelve tal cual sin volver a Payphone (el cliente
 * recarga la página de respuesta).
 */
export async function confirmPayment(body: any) {
  const id = Number(body?.id);
  const clientTransactionId = text(body?.clientTransactionId);
  if (!clientTransactionId || !Number.isInteger(id) || id <= 0) {
    throw new CustomError("Faltan los datos de la transacción", 400);
  }

  const order = await Order.findOne({ "payphone.clientTransactionId": clientTransactionId });
  if (!order) throw new CustomError("No encontramos el pedido de este pago", 404);
  if (order.status !== "pending_payment") return toPublic(order);
  if (!payphoneService.isPayphoneEnabled()) {
    throw new CustomError("El pago con tarjeta aún no está disponible", 400);
  }

  const response = await payphoneService.confirmTransaction(id, clientTransactionId);
  const statusCode = Number(response.statusCode);
  const payphoneSet = {
    "payphone.transactionId": String(response.transactionId ?? id),
    "payphone.statusCode": Number.isFinite(statusCode) ? statusCode : null,
    "payphone.response": response,
  };

  if (statusCode === payphoneService.PAYPHONE_APPROVED && Number(response.amount) === order.total) {
    const updated = await Order.findOneAndUpdate(
      { _id: order._id, status: "pending_payment" },
      {
        $set: { ...payphoneSet, status: "paid" },
        $push: {
          history: historyEntry(
            "paid",
            `Pago con tarjeta aprobado (autorización ${response.authorizationCode ?? "-"})`,
          ),
        },
      },
      { new: true },
    );
    if (!updated) return toPublic(await Order.findById(order._id));
    await syncCouponMetrics(updated._id);
    await orderEmail.sendOrderPlaced(updated);
    return toPublic(updated);
  }

  if (statusCode === payphoneService.PAYPHONE_APPROVED) {
    // Aprobado con otro monto: no se marca pagado, lo revisa una persona.
    const updated = await Order.findOneAndUpdate(
      { _id: order._id, status: "pending_payment" },
      {
        $set: payphoneSet,
        $push: {
          history: historyEntry(
            "pending_payment",
            `Payphone aprobó ${response.amount} centavos pero el pedido es de ${order.total}. Revisar.`,
          ),
        },
      },
      { new: true },
    );
    return toPublic(updated ?? order);
  }

  if (statusCode === payphoneService.PAYPHONE_CANCELLED) {
    const cancelled = await cancelOrder(
      order,
      response.message
        ? `Pago rechazado en Payphone: ${response.message}`
        : "Pago rechazado o cancelado en Payphone",
      payphoneSet,
    );
    if (cancelled) await orderEmail.sendStatusChanged(cancelled);
    return toPublic(cancelled ?? (await Order.findById(order._id)));
  }

  await Order.updateOne({ _id: order._id }, { $set: payphoneSet });
  return toPublic(await Order.findById(order._id));
}

async function findForCustomer(number: string, email: unknown) {
  const normalizedEmail = text(email).toLowerCase();
  const normalizedNumber = text(number).toUpperCase();
  if (!normalizedEmail || !normalizedNumber) {
    throw new CustomError("No encontramos un pedido con esos datos", 404);
  }
  const order = await Order.findOne({
    number: normalizedNumber,
    "customer.email": normalizedEmail,
  });
  if (!order) throw new CustomError("No encontramos un pedido con esos datos", 404);
  return order;
}

export async function track(number: string, email: unknown) {
  return toPublic(await findForCustomer(number, email));
}

const RECEIPT_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "application/pdf",
];

export async function uploadReceipt(number: string, email: unknown, file?: Express.Multer.File) {
  const order = await findForCustomer(number, email);
  if (order.paymentMethod !== "transfer") {
    throw new CustomError("Este pedido no se paga por transferencia", 400);
  }
  if (order.status === "cancelled") throw new CustomError("Este pedido está cancelado", 400);
  if (!file?.buffer?.length) throw new CustomError("Adjunta la foto o PDF del comprobante", 400);
  if (!RECEIPT_TYPES.includes(file.mimetype)) {
    throw new CustomError("El comprobante debe ser una imagen (JPG, PNG, WEBP) o un PDF", 400);
  }

  const { url } = await uploadBuffer(file.buffer, "siempre-pawer/comprobantes");
  const updated = await Order.findByIdAndUpdate(
    order._id,
    {
      $set: { transferReceiptUrl: url },
      $push: {
        history: historyEntry(order.status, "El cliente subió el comprobante de transferencia"),
      },
    },
    { new: true },
  );
  await orderEmail.sendReceiptUploaded(updated);
  return toPublic(updated);
}

// ─── Admin ──────────────────────────────────────────────────────────────────

export async function listAdmin(query: any) {
  await releaseExpiredCardOrders();
  const { page, limit, skip } = parsePagination(query, 20, 100);
  const filter: Record<string, unknown> = {};
  const status = text(query?.status);
  if (status) filter.status = status;
  const search = text(query?.search);
  if (search) {
    const rx = new RegExp(escapeRegex(search), "i");
    filter.$or = [
      { number: rx },
      { "customer.email": rx },
      { "customer.firstName": rx },
      { "customer.lastName": rx },
      { "customer.phone": rx },
      { trackingNumber: rx },
    ];
  }
  const [items, total] = await Promise.all([
    Order.find(filter)
      .select("-payphone.response")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Order.countDocuments(filter),
  ]);
  return paginated(items, total, page, limit);
}

export async function getAdmin(id: string) {
  if (!isValidObjectId(id)) throw new CustomError("Pedido no encontrado", 404);
  const order = await Order.findById(id)
    .populate("distributor", "name email company ruc city phone")
    .lean();
  if (!order) throw new CustomError("Pedido no encontrado", 404);
  return order;
}

/** PATCH /admin/orders/:id — { status?, trackingNumber?, trackingUrl?, notes?, note? } */
export async function updateAdmin(id: string, body: any) {
  if (!isValidObjectId(id)) throw new CustomError("Pedido no encontrado", 404);
  const order = await Order.findById(id);
  if (!order) throw new CustomError("Pedido no encontrado", 404);

  const set: Record<string, unknown> = {};
  if (body?.trackingNumber !== undefined) set.trackingNumber = text(body.trackingNumber);
  if (body?.trackingUrl !== undefined) set.trackingUrl = text(body.trackingUrl);
  if (body?.notes !== undefined) set.notes = text(body.notes);

  const nextStatus = body?.status === undefined ? order.status : text(body.status);
  if (!ORDER_STATUSES.includes(nextStatus as OrderStatus)) {
    throw new CustomError("Estado de pedido no válido", 400);
  }

  if (nextStatus === order.status) {
    if (Object.keys(set).length) await Order.updateOne({ _id: order._id }, { $set: set });
    return getAdmin(id);
  }

  if (order.status === "cancelled") {
    throw new CustomError("Este pedido está cancelado y no se puede reabrir", 400);
  }

  const note = text(body?.note);
  let updated: any;
  if (nextStatus === "cancelled") {
    updated = await cancelOrder(order, note || "Cancelado desde el panel", set);
  } else {
    updated = await Order.findOneAndUpdate(
      { _id: order._id, status: order.status },
      { $set: { ...set, status: nextStatus }, $push: { history: historyEntry(nextStatus, note) } },
      { new: true },
    );
    if (updated) await syncCouponMetrics(updated._id);
  }
  if (!updated) {
    throw new CustomError("El pedido cambió mientras lo editabas. Recarga e intenta de nuevo", 409);
  }

  await orderEmail.sendStatusChanged(updated);
  return getAdmin(id);
}
