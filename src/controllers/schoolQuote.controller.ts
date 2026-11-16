import { Request, Response } from "express";
import * as schoolQuoteService from "../services/schoolQuote.service";

/** POST /api/school-quotes — multipart, "file" opcional */
export async function create(req: Request, res: Response) {
  res.status(201).json(await schoolQuoteService.create(req.body, req.file));
}

/** GET /api/admin/school-quotes */
export async function list(req: Request, res: Response) {
  res.json(await schoolQuoteService.list(req.query));
}

/** PATCH /api/admin/school-quotes/:id — body: { status } */
export async function setStatus(req: Request, res: Response) {
  res.json(await schoolQuoteService.setStatus(String(req.params.id), req.body?.status));
}
