import { Paper } from "./ExamPaper.model";

const createExamPaper = async (question) => {
  const exampPaper = await Paper.create(question);
};

export const examPaperService = {
  createExamPaper,
};
