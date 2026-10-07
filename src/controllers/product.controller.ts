import { Request, Response } from "express";
import { AuthRequest } from "../types/AuthRequest";
import * as productService from "../services/product.service";

const isDistributor = (req: AuthRequest) => req.user?.accountType === "distributor";

/** GET /api/products */
export async function listPublic(req: AuthRequest, res: Response) {
  res.json(await productService.listPublic(req.query, isDistributor(req)));
}

/** GET /api/products/:slug */
export async function getBySlug(req: AuthRequest, res: Response) {
  res.json(await productService.getBySlug(String(req.params.slug), isDistributor(req)));
}

/** GET /api/admin/products */
export async function listAdmin(req: Request, res: Response) {
  res.json(await productService.listAdmin(req.query));
}

/** GET /api/admin/products/:id */
export async function getAdmin(req: Request, res: Response) {
  res.json(await productService.getAdmin(String(req.params.id)));
}

/** POST /api/admin/products */
export async function create(req: Request, res: Response) {
  res.status(201).json(await productService.create(req.body));
}

/** PUT /api/admin/products/:id */
export async function update(req: Request, res: Response) {
  res.json(await productService.update(String(req.params.id), req.body));
}

/** DELETE /api/admin/products/:id */
export async function remove(req: Request, res: Response) {
  res.json(await productService.remove(String(req.params.id)));
}
