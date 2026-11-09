import { Router } from "express";
import * as controller from "../controllers/lists.controller.js";
const router = Router();
router.post("/admin/lists/:kind", controller.postList);
router.patch("/admin/lists/:kind/:id", controller.patchList);
router.put("/kits", controller.putKit);
router.delete("/kits/:id", controller.deleteKit);
export default router;
