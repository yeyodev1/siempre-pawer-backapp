import { Request, Response } from "express";
import { CustomError } from "../errors/customError.error";
import * as statsService from "../services/stats.service";
import * as cloudinaryService from "../services/cloudinary.service";

const UPLOAD_FOLDER = "siempre-pawer";

/** GET /api/admin/stats */
export async function stats(_req: Request, res: Response) {
  res.json(await statsService.getStats());
}

/** POST /api/admin/uploads — multipart "file" → { url } */
export async function upload(req: Request, res: Response) {
  const file = req.file;
  if (!file?.buffer?.length) throw new CustomError("Adjunta una imagen", 400);
  if (!file.mimetype.startsWith("image/"))
    throw new CustomError("El archivo debe ser una imagen", 400);
  const { url } = await cloudinaryService.uploadBuffer(file.buffer, UPLOAD_FOLDER);
  res.status(201).json({ url });
}
