import mongoose from "mongoose";
import { ExamPaper } from "./ExamPaper.interface";

const ExamPaperSchema = new mongoose.Schema<ExamPaper>({
  question: String,
  answer: String,
  createdAt: { type: Date, default: Date.now },
});

export const Paper = mongoose.model("ExamPaper", ExamPaperSchema);
