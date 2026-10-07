import { env } from "../config/env";
import { sendEmail, layout, button, escapeHtml as e } from "./email.service";
import { getSettings } from "./settings.service";

/**
 * Correos de pedidos. Ninguna función lanza: un correo fallido no debe
 * deshacer un pedido ya guardado.
 */

const PAYMENT_LABELS: Record<string, string> = {
  card: "Tarjeta (Payphone)",
  transfer: "Transferencia bancaria",
  cod: "Pago contra entrega",
};

const STATUS_LABELS: Record<string, string> = {
  pending_payment: "Pendiente de pago",
  paid: "Pago confirmado",
  preparing: "En preparación",
  shipped: "Enviado",
  delivered: "Entregado",
  cancelled: "Cancelado",
};

const STATUS_MESSAGES: Record<string, string> = {
  pending_payment: "Tu pedido está registrado y espera la confirmación del pago.",
  paid: "Confirmamos tu pago. Ya estamos preparando tu pedido.",
  preparing: "Estamos preparando tu pedido.",
  shipped: "Tu pedido va en camino con Servientrega.",
  delivered: "Tu pedido fue entregado. Gracias por confiar en Siempre Pawer.",
  cancelled: "Tu pedido fue cancelado. Si tienes dudas, escríbenos por WhatsApp.",
};

export function money(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export function trackingPageUrl(order: any): string {
  return `${env.FRONTEND_URL}/pedido/${order.number}?email=${encodeURIComponent(order.customer.email)}`;
}

function summary(order: any): string {
  const rows = order.items
    .map(
      (i: any) => `<tr>
        <td style="padding:8px 0;border-bottom:1px solid #eee">${e(i.name)} x ${i.qty}</td>
        <td style="padding:8px 0;border-bottom:1px solid #eee;text-align:right">${money(i.lineTotal)}</td>
      </tr>`,
    )
    .join("");
  const line = (label: string, value: string, bold = false) =>
    `<tr><td style="padding:4px 0${bold ? ";font-weight:bold" : ""}">${label}</td><td style="padding:4px 0;text-align:right${bold ? ";font-weight:bold" : ""}">${value}</td></tr>`;
  return `<table width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;margin:16px 0">
    ${rows}
    ${line("Subtotal", money(order.subtotal))}
    ${order.discount ? line(`Descuento (${e(order.couponCode)})`, `-${money(order.discount)}`) : ""}
    ${line("Envío", order.shippingCost ? money(order.shippingCost) : "Gratis")}
    ${line("Total", money(order.total), true)}
  </table>`;
}

function deliveryBlock(order: any, pickupAddress: string): string {
  if (order.shipping.method === "pickup") {
    return `<p><strong>Retiro en tienda:</strong> ${e(pickupAddress)}. Te avisaremos cuando esté listo.</p>`;
  }
  const s = order.shipping;
  return `<p><strong>Envío a:</strong> ${e(s.receiverName)}, ${e(s.address)}, ${e(s.city)}, ${e(s.province)}${
    s.reference ? ` (${e(s.reference)})` : ""
  }. Teléfono: ${e(s.receiverPhone)}.</p>`;
}

function bankBlock(accounts: any[]): string {
  if (!accounts.length) {
    return "<p>Te enviaremos los datos bancarios por WhatsApp.</p>";
  }
  return accounts
    .map(
      (
        a,
      ) => `<p style="background:#fafafa;border-left:4px solid #F5B800;padding:12px 16px;margin:8px 0">
        <strong>${e(a.bank)}</strong><br>
        Cuenta ${e(a.type)}: ${e(a.number)}<br>
        Titular: ${e(a.holder)}${a.documentId ? `<br>C.I./RUC: ${e(a.documentId)}` : ""}
      </p>`,
    )
    .join("");
}

function paymentBlock(order: any, accounts: any[]): string {
  if (order.paymentMethod === "transfer" && order.status === "pending_payment") {
    return `<h2 style="font-size:17px;margin:24px 0 8px">Cómo pagar</h2>
      <p>Transfiere <strong>${money(order.total)}</strong> a una de estas cuentas y sube tu comprobante desde la página de tu pedido. Usa <strong>${e(order.number)}</strong> como referencia.</p>
      ${bankBlock(accounts)}`;
  }
  if (order.paymentMethod === "cod") {
    return `<p>Pagas <strong>${money(order.total)}</strong> al recibir tu pedido.</p>`;
  }
  return "";
}

/** Pedido recibido: al cliente y copia interna. */
export async function sendOrderPlaced(order: any): Promise<void> {
  try {
    const settings = await getSettings();
    const body = `
      <p>Hola ${e(order.customer.firstName)}, recibimos tu pedido <strong>${e(order.number)}</strong>.</p>
      <p><strong>Método de pago:</strong> ${PAYMENT_LABELS[order.paymentMethod]}<br>
      <strong>Estado:</strong> ${STATUS_LABELS[order.status]}</p>
      ${summary(order)}
      ${paymentBlock(order, settings.bankAccounts)}
      ${deliveryBlock(order, settings.pickupAddress)}
      ${button(trackingPageUrl(order), "Ver mi pedido")}
      <p style="color:#71717a;font-size:13px">Dudas: WhatsApp +${e(settings.whatsapp)}</p>`;
    await sendEmail(
      order.customer.email,
      `Recibimos tu pedido ${order.number}`,
      layout("Gracias por tu compra", body),
    );
    await sendInternalNewOrder(order);
  } catch (error) {
    console.error("[orderEmail] pedido recibido:", error);
  }
}

/** Copia interna de cada pedido nuevo. */
async function sendInternalNewOrder(order: any): Promise<void> {
  if (!env.ORDERS_NOTIFY_EMAIL) return;
  const c = order.customer;
  const invoice = order.invoice?.required
    ? `<p><strong>Factura:</strong> ${e(order.invoice.name)} · ${e(order.invoice.documentId)} · ${e(order.invoice.email)} · ${e(order.invoice.address)}</p>`
    : "<p>Sin factura.</p>";
  const body = `
    <p><strong>${e(order.number)}</strong> · ${PAYMENT_LABELS[order.paymentMethod]} · ${STATUS_LABELS[order.status]}${
      order.isDistributor ? " · <strong>Distribuidor</strong>" : ""
    }</p>
    <p><strong>Cliente:</strong> ${e(c.firstName)} ${e(c.lastName)} · ${e(c.email)} · ${e(c.phone)}${
      c.documentId ? ` · C.I. ${e(c.documentId)}` : ""
    }</p>
    ${summary(order)}
    <p><strong>Entrega:</strong> ${order.shipping.method === "pickup" ? "Retiro en tienda" : `${e(order.shipping.receiverName)}, ${e(order.shipping.address)}, ${e(order.shipping.city)}, ${e(order.shipping.province)}`}</p>
    ${invoice}`;
  await sendEmail(
    env.ORDERS_NOTIFY_EMAIL,
    `Nuevo pedido ${order.number} (${money(order.total)})`,
    layout("Nuevo pedido", body),
  );
}

/** Cambio de estado al cliente. */
export async function sendStatusChanged(order: any): Promise<void> {
  try {
    const settings = await getSettings();
    let extra = "";
    if (order.status === "shipped") {
      extra = `${order.trackingNumber ? `<p><strong>Guía Servientrega:</strong> ${e(order.trackingNumber)}</p>` : ""}${
        order.trackingUrl ? button(e(order.trackingUrl), "Rastrear mi envío") : ""
      }`;
    }
    if (order.status === "preparing" && order.shipping.method === "pickup") {
      extra = `<p>Puedes retirarlo en ${e(settings.pickupAddress)} cuando te confirmemos que está listo.</p>`;
    }
    const body = `
      <p>Hola ${e(order.customer.firstName)}, tu pedido <strong>${e(order.number)}</strong> cambió de estado.</p>
      <p style="font-size:18px"><strong style="color:#0a0a0a;background:#F5B800;padding:4px 10px;border-radius:6px">${STATUS_LABELS[order.status]}</strong></p>
      <p>${STATUS_MESSAGES[order.status]}</p>
      ${extra}
      <p><a href="${trackingPageUrl(order)}" style="color:#0a0a0a">Ver el detalle de mi pedido</a></p>
      <p style="color:#71717a;font-size:13px">Dudas: WhatsApp +${e(settings.whatsapp)}</p>`;
    await sendEmail(
      order.customer.email,
      `Pedido ${order.number}: ${STATUS_LABELS[order.status]}`,
      layout(STATUS_LABELS[order.status], body),
    );
  } catch (error) {
    console.error("[orderEmail] cambio de estado:", error);
  }
}

/** Aviso interno: el cliente subió el comprobante de transferencia. */
export async function sendReceiptUploaded(order: any): Promise<void> {
  try {
    if (!env.ORDERS_NOTIFY_EMAIL) return;
    const body = `
      <p>El cliente ${e(order.customer.firstName)} ${e(order.customer.lastName)} subió el comprobante del pedido <strong>${e(order.number)}</strong> por ${money(order.total)}.</p>
      ${button(e(order.transferReceiptUrl), "Ver comprobante")}
      <p>Revísalo y marca el pedido como pagado desde el panel.</p>`;
    await sendEmail(
      env.ORDERS_NOTIFY_EMAIL,
      `Comprobante recibido ${order.number}`,
      layout("Comprobante de transferencia", body),
    );
  } catch (error) {
    console.error("[orderEmail] comprobante:", error);
  }
}
