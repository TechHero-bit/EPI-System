import { Router } from "express";
import * as controller from "../controllers/employee.controller.js";
const router = Router();
router.post("/employees", controller.postemployees);
router.patch("/employees/:id", controller.patchemployeesId);
router.delete("/employees/:id", controller.deleteemployeesId);
router.post(
  "/employees/:id/send-verification",
  controller.postemployeesIdSendVerification,
);
router.post("/verify-email", controller.postverifyEmail);
export default router;
