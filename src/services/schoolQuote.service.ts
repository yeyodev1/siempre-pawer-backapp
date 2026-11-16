import { isValidObjectId } from "mongoose";
import { env } from "../config/env";
import { CustomError } from "../errors/customError.error";
import { SchoolQuote } from "../models/schoolQuote.model";
import { paginated, parsePagination, text } from "../utils/query";
import { uploadBuffer } from "./cloudinary.service";
import { button, escapeHtml as e, layout, sendEmail } from "./email.service";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const FILE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
];
const MAX_ITEMS = 100;

function parseItems(raw: unknown) {
  // Multipart manda los campos como texto: la lista llega en JSON.
  let list: unknown = raw;
  if (typeof raw === "string") {
    try {
      list = JSON.parse(raw);
    } catch {
      throw new CustomError("La lista de productos no es válida", 400);
    }
  }
  if (!Array.isArray(list)) return [];
  return list
    .slice(0, MAX_ITEMS)
    .map((i: any) => ({
      product: isValidObjectId(i?.product) ? String(i.product) : "",
      name: text(i?.name).slice(0, 200),
      qty: Math.min(99999, Math.max(1, Math.floor(Number(i?.qty)) || 1)),
    }))
    .filter((i) => i.name);
}

export async function create(body: any, file?: Express.Multer.File) {
  const data = {
    name: text(body?.name),
    institution: text(body?.institution),
    email: text(body?.email).toLowerCase(),
    phone: text(body?.phone),
    city: text(body?.city),
    notes: text(body?.notes).slice(0, 2000),
    items: parseItems(body?.items),
    fileUrl: "",
  };
  if (!data.name) throw new CustomError("Escribe tu nombre", 400);
  if (!data.institution) throw new CustomError("Escribe el nombre del colegio o club", 400);
  if (data.email && !EMAIL.test(data.email)) throw new CustomError("Escribe un correo válido", 400);
  if (data.phone.replace(/\D/g, "").length < 7) throw new CustomError("Escribe un teléfono válido", 400);
  if (!data.items.length && !file?.buffer?.length) {
    throw new CustomError("Agrega productos a tu lista o adjunta tu archivo", 400);
  }
  if (file?.buffer?.length) {
    if (!FILE_TYPES.includes(file.mimetype)) {
      throw new CustomError("La lista debe ser PDF, Excel, Word o una foto", 400);
    }
    data.fileUrl = (await uploadBuffer(file.buffer, "siempre-pawer/cotizaciones", "auto")).url;
  }

  const quote = await SchoolQuote.create(data);
  await notify(quote);
  return { ok: true, id: quote._id };
}

async function notify(q: any) {
  if (!env.ORDERS_NOTIFY_EMAIL) return;
  const rows = q.items.map((i: any) => `<li>${e(i.name)} × ${i.qty}</li>`).join("");
  const body = `
    <p><strong>${e(q.name)}</strong> de <strong>${e(q.institution)}</strong> (${e(q.city)}) pidió una cotización.</p>
    <p>Teléfono: ${e(q.phone)}<br>Correo: ${e(q.email) || "—"}</p>
    ${rows ? `<ul>${rows}</ul>` : ""}
    ${q.notes ? `<p>Observaciones: ${e(q.notes)}</p>` : ""}
    ${q.fileUrl ? button(e(q.fileUrl), "Ver lista adjunta") : ""}
    ${button(`${env.FRONTEND_URL}/admin/cotizaciones`, "Abrir en el panel")}`;
  await sendEmail(env.ORDERS_NOTIFY_EMAIL, `Cotización: ${q.institution}`, layout("Nueva cotización", body));
}

export async function list(query: any) {
  const { page, limit, skip } = parsePagination(query, 20, 100);
  const filter: Record<string, unknown> = {};
  const status = text(query?.status);
  if (status) filter.status = status;
  const [items, total] = await Promise.all([
    SchoolQuote.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    SchoolQuote.countDocuments(filter),
  ]);
  return paginated(items, total, page, limit);
}

export async function setStatus(id: string, status: unknown) {
  if (!isValidObjectId(id)) throw new CustomError("Cotización no encontrada", 404);
  if (status !== "new" && status !== "answered") throw new CustomError("Estado no válido", 400);
  const updated = await SchoolQuote.findByIdAndUpdate(id, { $set: { status } }, { new: true }).lean();
  if (!updated) throw new CustomError("Cotización no encontrada", 404);
  return updated;
}
