// ponytail: the app has no realtime subscriptions (no .channel(), no .subscribe()),
// but SupabaseClient's constructor builds a RealtimeClient unconditionally, which
// drags phoenix + a websocket stack into the root layout — on every page. This
// satisfies the constructor and nothing else. Delete the alias in vite.config.ts
// the day a `.channel()` appears.
export class RealtimeClient {
  constructor(..._args: unknown[]) {}
  setAuth() {}
  connect() {}
  disconnect() {}
  channel() {
    throw new Error('realtime is stubbed out — see src/lib/data/supabase/realtimeStub.ts');
  }
  removeChannel() {}
  removeAllChannels() {}
  getChannels() {
    return [];
  }
}
