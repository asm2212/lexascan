import express from "express";
import { isAuthenticated } from "../middleware/auth";
import { analyzeContract, detectAndConfirmContractType, uploadMiddleware } from "../controllers/contractController";
import { handleErrors } from "../middleware/error";


const router = express.Router();

router.post(
  "/detect-type",
  isAuthenticated,
  uploadMiddleware,
  handleErrors(detectAndConfirmContractType)
);

router.post(
  "/analyze",
  isAuthenticated,
  uploadMiddleware,
  handleErrors(analyzeContract)
);



export default router;