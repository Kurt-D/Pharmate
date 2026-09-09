import { api } from '../api.js';

// Bound the entire read, including session renewal, not only the initial fetch.
export async function adminRead(path) {
  const controller = new AbortController();
  let timer;
  try {
    return await Promise.race([
      api(path, { signal: controller.signal }),
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          reject(
            new Error('The server took too long to respond. Check your connection and try again.')
          );
          controller.abort();
        }, 15000);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
