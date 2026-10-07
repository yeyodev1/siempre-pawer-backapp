import { Request, Response } from "express";
import * as categoryService from "../services/category.service";

/** GET /api/categories */
export async function listPublic(_req: Request, res: Response) {
  res.json(await categoryService.listPublic());
}

/** GET /api/admin/categories */
export async function listAdmin(_req: Request, res: Response) {
  res.json(await categoryService.listAdmin());
}

/** POST /api/admin/categories */
export async function create(req: Request, res: Response) {
  res.status(201).json(await categoryService.create(req.body));
}

/** PUT /api/admin/categories/:id */
export async function update(req: Request, res: Response) {
  res.json(await categoryService.update(String(req.params.id), req.body));
}

/** DELETE /api/admin/categories/:id */
export async function remove(req: Request, res: Response) {
  res.json(await categoryService.remove(String(req.params.id)));
}
