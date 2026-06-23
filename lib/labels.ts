import type { Rating, TraderProposal } from './schemas';

const RATING_LABELS: Record<Rating, string> = {
  Buy: '买入',
  Overweight: '增持',
  Hold: '持有',
  Underweight: '减持',
  Sell: '卖出',
};

const NO_POSITION_RATING_LABELS: Record<Rating, string> = {
  Buy: '适合建仓',
  Overweight: '可分批建仓',
  Hold: '等待建仓',
  Underweight: '暂不建仓',
  Sell: '不建议建仓',
};

const ACTION_LABELS: Record<TraderProposal['action'], string> = {
  Buy: '买入',
  Hold: '持有',
  Sell: '卖出',
};

export function ratingLabel(rating: Rating | string) {
  return RATING_LABELS[rating as Rating] || rating;
}

export function ratingLabelForPosition(rating: Rating | string, hasPosition = true) {
  const labels = hasPosition ? RATING_LABELS : NO_POSITION_RATING_LABELS;
  return labels[rating as Rating] || rating;
}

export function actionLabel(action: TraderProposal['action'] | string) {
  return ACTION_LABELS[action as TraderProposal['action']] || action;
}

export function bilingualRating(rating: Rating | string) {
  const label = ratingLabel(rating);
  return label === rating ? rating : `${label}（${rating}）`;
}

export function bilingualRatingForPosition(rating: Rating | string, hasPosition = true) {
  const label = ratingLabelForPosition(rating, hasPosition);
  return label === rating ? rating : `${label}（${rating}）`;
}

export function bilingualAction(action: TraderProposal['action'] | string) {
  const label = actionLabel(action);
  return label === action ? action : `${label}（${action}）`;
}
