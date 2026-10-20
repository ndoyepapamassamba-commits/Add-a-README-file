import { credits, getKey } from './llm';
import { useStore } from './store';

/** Refreshes the credits gauge (after each run and periodically). */
export async function refreshCredits(): Promise<void> {
  if (!getKey()) return;
  try {
    useStore.setState({ credits: await credits() });
  } catch {
    /* offline */
  }
}
