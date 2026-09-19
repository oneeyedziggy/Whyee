import { createCorrelationTask } from './correlationTask';
import type {
  CorrelationBatchListener,
  CorrelationRequest,
  CorrelationTask,
} from '../types/correlation';

export const runCorrelation = (
  request: CorrelationRequest,
  onBatch?: CorrelationBatchListener,
): CorrelationTask => createCorrelationTask(request, onBatch);
