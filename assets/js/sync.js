/*
 * World Cup Super Fun Time — sync layer
 * --------------------------------------------------------------------------
 * Provides a tiny "store" abstraction the app uses to load/save the live draft
 * and receive remote updates:
 *
 *     { mode, load(), save(snapshot), subscribe(onRemote) }
 *
 *   - CloudStore (Supabase): a single shared "draft" row that all phones read,
 *     update, and subscribe to via Supabase Realtime. Optimistic concurrency
 *     is enforced with a version column so a stale device can't clobber a pick.
 *   - LocalStore (localStorage): single-device fallback, also syncs across tabs
 *     on the same device via the `storage` event.
 *
 * window.WCSFT_createStore() picks CloudStore when config.js has Supabase
 * credentials, otherwise LocalStore. It always resolves to a working store.
 */
(function () {
  "use strict";

  const STORAGE_KEY = "wcsft-draft-state-v1";
  const ROW_ID = 1;
  const SUPABASE_ESM = "https://esm.sh/@supabase/supabase-js@2";

  // ---- shared localStorage helpers ----------------------------------------
  function readLocalDraft() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const d = JSON.parse(raw);
      return { draftOrder: d.draftOrder, picks: Array.isArray(d.picks) ? d.picks : [] };
    } catch (e) {
      return null;
    }
  }
  function writeLocalDraft(snap) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ draftOrder: snap.draftOrder, picks: snap.picks }));
    } catch (e) { /* storage unavailable; non-fatal */ }
  }
  window.WCSFT_readLocalDraft = readLocalDraft; // used by app for migration

  // ---- LocalStore ----------------------------------------------------------
  function LocalStore() {
    return {
      mode: "local",
      async load() { return readLocalDraft(); },
      async save(snap) { writeLocalDraft(snap); return { ok: true }; },
      subscribe(onRemote) {
        window.addEventListener("storage", (e) => {
          if (e.key !== STORAGE_KEY || !e.newValue) return;
          try {
            const d = JSON.parse(e.newValue);
            onRemote({ draftOrder: d.draftOrder, picks: d.picks || [] });
          } catch (_) {}
        });
      }
    };
  }

  // ---- CloudStore (Supabase) ----------------------------------------------
  function CloudStore(client) {
    let version = 0;

    async function ensureRow() {
      // Create the singleton row if the schema's seed insert didn't run.
      try {
        await client.from("draft").upsert({ id: ROW_ID }, { onConflict: "id", ignoreDuplicates: true });
      } catch (e) { /* table may not exist yet; load() will surface it */ }
    }

    return {
      mode: "cloud",
      ensureRow,
      async load() {
        const { data, error } = await client.from("draft").select("*").eq("id", ROW_ID).maybeSingle();
        if (error) { console.error("[WCSFT] Supabase load error:", error.message); return null; }
        if (!data) return null;
        version = data.version || 0;
        return { draftOrder: data.draft_order || [], picks: data.picks || [], version };
      },
      async save(snap) {
        const next = version + 1;
        const { data, error } = await client
          .from("draft")
          .update({ draft_order: snap.draftOrder, picks: snap.picks, version: next, updated_at: new Date().toISOString() })
          .eq("id", ROW_ID)
          .eq("version", version)
          .select();
        if (error) { console.error("[WCSFT] Supabase save error:", error.message); return { ok: false, error }; }
        if (!data || data.length === 0) return { ok: false, conflict: true }; // someone else wrote first
        version = next;
        return { ok: true };
      },
      subscribe(onRemote) {
        client
          .channel("wcsft-draft-room")
          .on("postgres_changes", { event: "*", schema: "public", table: "draft", filter: "id=eq." + ROW_ID }, (payload) => {
            const r = payload.new;
            if (!r) return;
            version = r.version || version;
            onRemote({ draftOrder: r.draft_order || [], picks: r.picks || [], version });
          })
          .subscribe();
      }
    };
  }

  // ---- factory -------------------------------------------------------------
  window.WCSFT_createStore = async function createStore() {
    const cfg = window.WCSFT_CONFIG || {};
    if (cfg.supabaseUrl && cfg.supabaseAnonKey) {
      try {
        const mod = await import(SUPABASE_ESM);
        const client = mod.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
          realtime: { params: { eventsPerSecond: 5 } }
        });
        const store = CloudStore(client);
        await store.ensureRow();
        console.info("[WCSFT] Cloud sync enabled (Supabase).");
        return store;
      } catch (e) {
        console.error("[WCSFT] Supabase unavailable, using local mode:", e);
      }
    }
    return LocalStore();
  };
})();
