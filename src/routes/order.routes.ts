import { Router } from "express";
import { optionalAuthMiddleware } from "../middlewares/optionalAuth.middleware";
import { uploadMiddleware } from "../middlewares/upload.middleware";
import * as orderController from "../controllers/order.controller";

const router = Router();

// Con Bearer de distribuidor se cotiza con distributorPrice y se fuerza transferencia.
router.post("/quote", optionalAuthMiddleware, orderController.quote);
router.post("/", optionalAuthMiddleware, orderController.create);
router.post("/confirm", orderController.confirm);
router.get("/track/:number", orderController.track);
router.post(
  "/track/:number/receipt",
  uploadMiddleware.single("file"),
  orderController.uploadReceipt,
);

export default router;
