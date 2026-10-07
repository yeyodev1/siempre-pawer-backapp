import { Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env";
import { User } from "../models/user.model";
import { AuthRequest, JwtPayload } from "../types/AuthRequest";

/**
 * Auth opcional para rutas públicas (catálogo y pedidos): si llega un Bearer
 * válido de una cuenta activa deja req.user; si no, se atiende como invitado.
 * Se consulta la cuenta para que un distribuidor desactivado deje de ver sus
 * precios aunque su token siga vigente.
 */
export async function optionalAuthMiddleware(req: AuthRequest, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (header?.startsWith("Bearer ")) {
    try {
      const decoded = jwt.verify(header.slice(7), env.JWT_SECRET) as JwtPayload;
      const user = await User.findById(decoded.userId).select("accountType isActive").lean<any>();
      if (user?.isActive) req.user = { ...decoded, accountType: user.accountType };
    } catch {
      // Token inválido o vencido: se sigue como invitado.
    }
  }
  next();
}
