import { useDayRollover } from '@/hooks/use-day-rollover';
import { useSignalBootstrap } from '@/hooks/use-signal-bootstrap';

export function SignalBootstrap() {
  useSignalBootstrap();
  useDayRollover();
  return null;
}
