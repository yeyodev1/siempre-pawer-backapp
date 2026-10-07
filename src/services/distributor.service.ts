import { isValidObjectId } from "mongoose";
import { CustomError } from "../errors/customError.error";
import { User } from "../models/user.model";
import { escapeRegex, text } from "../utils/query";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function sanitize(user: any) {
  return {
    _id: user._id,
    id: String(user._id),
    name: user.name,
    email: user.email,
    phone: user.phone,
    company: user.company ?? "",
    ruc: user.ruc ?? "",
    city: user.city ?? "",
    accountType: user.accountType,
    isActive: user.isActive,
    lastLoginAt: user.lastLoginAt ?? null,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

export async function list(query: any) {
  const filter: Record<string, unknown> = { accountType: "distributor" };
  const search = text(query?.search);
  if (search) {
    const rx = new RegExp(escapeRegex(search), "i");
    filter.$or = [{ name: rx }, { email: rx }, { company: rx }, { ruc: rx }, { city: rx }];
  }
  const users = await User.find(filter).sort({ createdAt: -1 }).lean();
  return users.map(sanitize);
}

function applyProfile(user: any, body: any) {
  for (const key of ["name", "phone", "company", "ruc", "city"]) {
    if (body?.[key] !== undefined) user[key] = text(body[key]);
  }
  if (body?.isActive !== undefined) user.isActive = Boolean(body.isActive);
}

export async function create(body: any) {
  const email = text(body?.email).toLowerCase();
  const password = String(body?.password ?? "");
  if (!text(body?.name)) throw new CustomError("Escribe el nombre del distribuidor", 400);
  if (!EMAIL.test(email)) throw new CustomError("Correo inválido", 400);
  if (password.length < 8)
    throw new CustomError("La contraseña debe tener al menos 8 caracteres", 400);
  if (await User.exists({ email }))
    throw new CustomError("Ya existe una cuenta con ese correo", 409);

  // El hash lo hace el pre("save") del modelo, igual que el resto de cuentas.
  const user = new User({ email, password, accountType: "distributor" });
  applyProfile(user, body);
  await user.save();
  return sanitize(user);
}

async function findDistributor(id: string) {
  if (!isValidObjectId(id)) throw new CustomError("Distribuidor no encontrado", 404);
  const user = await User.findOne({ _id: id, accountType: "distributor" }).select("+password");
  if (!user) throw new CustomError("Distribuidor no encontrado", 404);
  return user;
}

export async function update(id: string, body: any) {
  const user = await findDistributor(id);
  applyProfile(user, body);
  if (body?.email !== undefined) {
    const email = text(body.email).toLowerCase();
    if (!EMAIL.test(email)) throw new CustomError("Correo inválido", 400);
    user.email = email;
  }
  if (body?.password) {
    const password = String(body.password);
    if (password.length < 8)
      throw new CustomError("La contraseña debe tener al menos 8 caracteres", 400);
    user.password = password;
  }
  await user.save();
  return sanitize(user);
}

export async function remove(id: string) {
  const user = await findDistributor(id);
  await user.deleteOne();
  return { ok: true };
}
