import { modelInfo } from '@/lib/ai';

export default function handler(req, res) {
  res.status(200).json(modelInfo());
}
