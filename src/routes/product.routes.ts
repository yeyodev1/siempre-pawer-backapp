import { Router } from "express";
import { optionalAuthMiddleware } from "../middlewares/optionalAuth.middleware";
import * as productController from "../controllers/product.controller";

const router = Router();

// Con Bearer de distribuidor se incluye distributorPrice.
router.use(optionalAuthMiddleware);

router.get("/", productController.listPublic);
router.get("/:slug", productController.getBySlug);

export default router;
