import crypto from "crypto";
import axios from "axios";
import { env } from "../config/env";
import { CustomError } from "../errors/customError.error";

const CONFIRM_URL = "https://paymentbox.payphonetodoesposible.com/api/confirm";

export const PAYPHONE_APPROVED = 3;
export const PAYPHONE_CANCELLED = 2;

/** Sin token o sin storeId la tienda vende solo por transferencia y contra entrega. */
export function isPayphoneEnabled(): boolean {
  return Boolean(env.PAYPHONE_TOKEN && env.PAYPHONE_STORE_ID);
}

/** Único por intento y de máximo 50 caracteres (límite de Payphone). */
export function newClientTransactionId(orderNumber: string): string {
  return `${orderNumber}-${Date.now().toString(36)}-${crypto.randomBytes(3).toString("hex")}`.slice(
    0,
    50,
  );
}

/** Payphone pide el celular en formato internacional. */
function toInternationalPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("593")) return `+${digits}`;
  if (digits.startsWith("0")) return `+593${digits.slice(1)}`;
  return `+593${digits}`;
}

/**
 * Configuración de la Cajita para el front. El token viaja al navegador por
 * diseño de Payphone; se entrega desde aquí para poder rotarlo sin redeploy.
 * Los datos del comprador son los reales de cada pedido (Payphone bloquea
 * cuentas con datos quemados).
 */
export function buildCheckout(order: any) {
  return {
    token: env.PAYPHONE_TOKEN,
    storeId: env.PAYPHONE_STORE_ID,
    clientTransactionId: order.payphone.clientTransactionId,
    amount: order.total,
    // Sin desglose de IVA: amount = amountWithoutTax.
    amountWithoutTax: order.total,
    currency: "USD" as const,
    reference: `Pedido ${order.number} - Siempre Pawer`.slice(0, 100),
    email: order.customer.email,
    phoneNumber: toInternationalPhone(order.customer.phone),
    documentId: order.customer.documentId,
  };
}

/** Consulta la transacción en Payphone. Lanza CustomError si no responde. */
export async function confirmTransaction(
  id: number,
  clientTxId: string,
): Promise<Record<string, any>> {
  try {
    const { data } = await axios.post(
      CONFIRM_URL,
      { id, clientTxId },
      {
        headers: {
          Authorization: `Bearer ${env.PAYPHONE_TOKEN}`,
          "Content-Type": "application/json",
        },
        timeout: 20000,
      },
    );
    return data ?? {};
  } catch (error: any) {
    const status = error?.response?.status;
    const detail = error?.response?.data?.message;
    console.error("[payphone] confirm falló:", status, error?.response?.data ?? error?.message);
    if (status && status < 500) {
      throw new CustomError(
        detail
          ? `Payphone no pudo confirmar el pago: ${detail}`
          : "Payphone no reconoce esta transacción",
        400,
      );
    }
    throw new CustomError(
      "No pudimos comunicarnos con Payphone. Intenta de nuevo en un momento",
      502,
    );
  }
}
