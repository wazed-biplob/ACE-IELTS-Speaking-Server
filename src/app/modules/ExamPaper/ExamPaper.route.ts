import exporess from "express";
import { ExamPaperController } from "./ExamPaper.controller";

const router = exporess.Router();

router.post("/examp-paper", () => ExamPaperController.createExamPaper);

export const userRoutes = router;
