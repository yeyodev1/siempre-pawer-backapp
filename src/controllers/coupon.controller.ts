import { Request, Response } from "express";
import * as couponService from "../services/coupon.service";

/** POST /api/coupons/validate — body: { code } */
export async function validate(req: Request, res: Response) {
  res.json(await couponService.validate(req.body?.code));
}

/** GET /api/admin/coupons */
export async function list(_req: Request, res: Response) {
  res.json(await couponService.list());
}

/** POST /api/admin/coupons */
export async function create(req: Request, res: Response) {
  res.status(201).json(await couponService.create(req.body));
}

/** PUT /api/admin/coupons/:id */
export async function update(req: Request, res: Response) {
  res.json(await couponService.update(String(req.params.id), req.body));
}

/** DELETE /api/admin/coupons/:id */
export async function remove(req: Request, res: Response) {
  res.json(await couponService.remove(String(req.params.id)));
}
