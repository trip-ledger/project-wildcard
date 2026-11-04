import { formatBest, formatTime } from './session.js';
import { GAME_TITLE } from './title.js';

/** Plain-text summary of one daily route. Copied locally. Nothing is sent. */
export function shareSummary(result) {
  return [
    `${GAME_TITLE} — daily route ${result.date}`,
    `Score ${result.score}`,
    `Time ${formatTime(result.elapsed)}`,
    `Gates ${result.hits}/${result.total}`,
    `Smooth +${result.smooth}`,
    `Today ${formatBest(result.bestToday)} · All-time ${formatBest(result.bestAll)}`,
  ].join('\n');
}
