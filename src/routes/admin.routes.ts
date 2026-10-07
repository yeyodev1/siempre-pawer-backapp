import { Router } from "express";
import { authMiddleware } from "../middlewares/auth.middleware";
import { adminMiddleware } from "../middlewares/admin.middleware";
import { uploadMiddleware } from "../middlewares/upload.middleware";
import * as adminController from "../controllers/admin.controller";
import * as productController from "../controllers/product.controller";
import * as categoryController from "../controllers/category.controller";
import * as orderController from "../controllers/order.controller";
import * as couponController from "../controllers/coupon.controller";
import * as distributorController from "../controllers/distributor.controller";
import * as settingsController from "../controllers/settings.controller";

const router = Router();

router.use(authMiddleware, adminMiddleware);

router.get("/stats", adminController.stats);
router.post("/uploads", uploadMiddleware.single("file"), adminController.upload);

router.get("/products", productController.listAdmin);
router.post("/products", productController.create);
router.get("/products/:id", productController.getAdmin);
router.put("/products/:id", productController.update);
router.delete("/products/:id", productController.remove);

router.get("/categories", categoryController.listAdmin);
router.post("/categories", categoryController.create);
router.put("/categories/:id", categoryController.update);
router.delete("/categories/:id", categoryController.remove);

router.get("/orders", orderController.listAdmin);
router.get("/orders/:id", orderController.getAdmin);
router.patch("/orders/:id", orderController.updateAdmin);

router.get("/coupons", couponController.list);
router.post("/coupons", couponController.create);
router.put("/coupons/:id", couponController.update);
router.delete("/coupons/:id", couponController.remove);

router.get("/distributors", distributorController.list);
router.post("/distributors", distributorController.create);
router.put("/distributors/:id", distributorController.update);
router.delete("/distributors/:id", distributorController.remove);

router.get("/settings", settingsController.getAdmin);
router.put("/settings", settingsController.update);

export default router;
