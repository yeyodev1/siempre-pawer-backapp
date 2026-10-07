import { Request, Response } from "express";
import { AuthRequest } from "../types/AuthRequest";
import * as orderService from "../services/order.service";

/** POST /api/orders/quote */
export async function quote(req: AuthRequest, res: Response) {
  res.json(await orderService.quote(req.body, req.user));
}

/** POST /api/orders */
export async function create(req: AuthRequest, res: Response) {
  res.status(201).json(await orderService.createOrder(req.body, req.user));
}

/** POST /api/orders/confirm — body: { id, clientTransactionId } */
export async function confirm(req: Request, res: Response) {
  res.json(await orderService.confirmPayment(req.body));
}

/** GET /api/orders/track/:number?email= */
export async function track(req: Request, res: Response) {
  res.json(await orderService.track(String(req.params.number), req.query.email));
}

/** POST /api/orders/track/:number/receipt?email= — multipart "file" */
export async function uploadReceipt(req: Request, res: Response) {
  res.json(await orderService.uploadReceipt(String(req.params.number), req.query.email, req.file));
}

/** GET /api/admin/orders */
export async function listAdmin(req: Request, res: Response) {
  res.json(await orderService.listAdmin(req.query));
}

/** GET /api/admin/orders/:id */
export async function getAdmin(req: Request, res: Response) {
  res.json(await orderService.getAdmin(String(req.params.id)));
}

/** PATCH /api/admin/orders/:id */
export async function updateAdmin(req: Request, res: Response) {
  res.json(await orderService.updateAdmin(String(req.params.id), req.body));
}
