import { Request, Response } from "express";
import * as settingsService from "../services/settings.service";

/** GET /api/settings/public */
export async function getPublic(_req: Request, res: Response) {
  res.json(await settingsService.getPublicSettings());
}

/** GET /api/admin/settings */
export async function getAdmin(_req: Request, res: Response) {
  res.json(await settingsService.getSettings());
}

/** PUT /api/admin/settings */
export async function update(req: Request, res: Response) {
  res.json(await settingsService.updateSettings(req.body));
}
