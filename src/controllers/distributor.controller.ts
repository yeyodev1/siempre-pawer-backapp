import { Request, Response } from "express";
import * as distributorService from "../services/distributor.service";

/** GET /api/admin/distributors */
export async function list(req: Request, res: Response) {
  res.json(await distributorService.list(req.query));
}

/** POST /api/admin/distributors */
export async function create(req: Request, res: Response) {
  res.status(201).json(await distributorService.create(req.body));
}

/** PUT /api/admin/distributors/:id */
export async function update(req: Request, res: Response) {
  res.json(await distributorService.update(String(req.params.id), req.body));
}

/** DELETE /api/admin/distributors/:id */
export async function remove(req: Request, res: Response) {
  res.json(await distributorService.remove(String(req.params.id)));
}
