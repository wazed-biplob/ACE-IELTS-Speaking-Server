import { examPaperService } from "./ExamPaper.service";

const createExamPaper = async (req: Request, res: Response) => {
  const question = req.body;

  const result = await examPaperService.createExamPaper(question);
};

export const ExamPaperController = {
  createExamPaper,
};
