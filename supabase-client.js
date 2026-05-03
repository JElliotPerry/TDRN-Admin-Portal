/**
 * TDRN Supabase Client — supabase-client.js
 * Thrive Disaster Response Network — Database Integration Layer
 * Version: 2.0.0 | Drop-in replacement for tdrn-core.js mock data layer
 *
 * SETUP INSTRUCTIONS:
 * 1. Go to https://supabase.com and create a project
 * 2. Navigate to: Project → Settings → API
 * 3. Copy your Project URL and anon/public key
 * 4. Replace the placeholder values below
 * 5. Run the SQL schema at the bottom of this file in Supabase SQL Editor
 * 6. Enable Row Level Security (RLS) policies as noted in schema comments
 * 7. Include this file BEFORE tdrn-core.js in your HTML
 *    <script src="supabase-client.js"></script>
 *    <script src="tdrn-core.js"></script>
 */

// =============================================================================
// 1. CONFIGURATION
// =============================================================================

const SUPABASE_URL  = 'https://YOUR_PROJECT_ID.supabase.co'; // ← Replace this
const SUPABASE_ANON_KEY = 'YOUR_ANON_PUBLIC_KEY_HERE';        // ← Replace this

// Runtime configuration — override at startup if needed:
// TDRNdb.configure('https://xyz.supabase.co', 'your-anon-key');

// Load Supabase JS SDK (UMD build from CDN)
// If already included in <head>, comment out this dynamic loader:
(function loadSupabaseSDK() {
  if (window.supabase) return; // already loaded
  const s = document.createElement('script');
  s.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js';
  s.onload = () => TDRNdb._init();
  document.head.appendChild(s);
})();

// =============================================================================
// 2. MAIN TDRNdb OBJECT
// =============================================================================

const TDRNdb = {
  _client: null,
  _county: 'warren_county', // default county scope
  _subscriptions: {},

  /** Initialize Supabase client */
  _init() {
    if (!window.supabase) {
      console.error('[TDRNdb] Supabase SDK not loaded.');
      return;
    }
    this._client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    console.log('[TDRNdb] Supabase client initialized.');
    // Flush any offline queue entries now that we're online
    window.addEventListener('online', () => this.queue.flush());
    this.queue.flush(); // attempt flush on load
  },

  /** Override config at runtime */
  configure(url, anonKey, county = 'warren_county') {
    SUPABASE_URL = url;
    SUPABASE_ANON_KEY = anonKey;
    this._county = county;
    this._init();
  },

  _db() {
    if (!this._client) throw new Error('[TDRNdb] Client not initialized. Call TDRNdb._init() first.');
    return this._client;
  },

  _wrap: async (promise) => {
    try {
      const { data, error } = await promise;
      if (error) return { success: false, data: null, error: error.message };
      return { success: true, data, error: null };
    } catch (e) {
      return { success: false, data: null, error: e.message };
    }
  },

  // ===========================================================================
  // MEMBERS
  // ===========================================================================
  members: {
    /** Get all members with optional filters: { status, role, skill, search } */
    async getAll(filters = {}) {
      let query = TDRNdb._db()
        .from('members')
        .select('*, member_certifications(cert_type_id, issued_date, expiry_date), team_members(team_id)')
        .eq('county', TDRNdb._county)
        .order('last_name', { ascending: true });
      if (filters.status)  query = query.eq('status', filters.status);
      if (filters.role)    query = query.eq('role', filters.role);
      if (filters.skill)   query = query.contains('skills', [filters.skill]);
      if (filters.search)  query = query.ilike('full_name', `%${filters.search}%`);
      return TDRNdb._wrap(query);
    },

    async getById(id) {
      return TDRNdb._wrap(
        TDRNdb._db().from('members').select('*').eq('id', id).single()
      );
    },

    async create(data) {
      return TDRNdb._wrap(
        TDRNdb._db().from('members').insert({ ...data, county: TDRNdb._county }).select().single()
      );
    },

    async update(id, data) {
      return TDRNdb._wrap(
        TDRNdb._db().from('members').update(data).eq('id', id).select().single()
      );
    },

    async delete(id) {
      return TDRNdb._wrap(
        TDRNdb._db().from('members').delete().eq('id', id)
      );
    },

    async search(query) {
      return TDRNdb._wrap(
        TDRNdb._db().from('members')
          .select('id, full_name, role, status, phone')
          .eq('county', TDRNdb._county)
          .or(`full_name.ilike.%${query}%,email.ilike.%${query}%`)
          .limit(20)
      );
    }
  },

  // ===========================================================================
  // TEAMS
  // ===========================================================================
  teams: {
    async getAll() {
      return TDRNdb._wrap(
        TDRNdb._db().from('teams')
          .select('*, team_members(member_id, members(full_name, role, status))')
          .eq('county', TDRNdb._county)
          .order('name')
      );
    },

    async getById(id) {
      return TDRNdb._wrap(
        TDRNdb._db().from('teams').select('*').eq('id', id).single()
      );
    },

    async create(data) {
      return TDRNdb._wrap(
        TDRNdb._db().from('teams').insert({ ...data, county: TDRNdb._county }).select().single()
      );
    },

    async update(id, data) {
      return TDRNdb._wrap(
        TDRNdb._db().from('teams').update(data).eq('id', id).select().single()
      );
    },

    async getMembers(teamId) {
      return TDRNdb._wrap(
        TDRNdb._db().from('team_members')
          .select('members(*)')
          .eq('team_id', teamId)
      );
    },

    async assignMember(teamId, memberId) {
      return TDRNdb._wrap(
        TDRNdb._db().from('team_members')
          .upsert({ team_id: teamId, member_id: memberId })
      );
    }
  },

  // ===========================================================================
  // EQUIPMENT
  // ===========================================================================
  equipment: {
    async getAll(filters = {}) {
      let query = TDRNdb._db().from('equipment')
        .select('*')
        .eq('county', TDRNdb._county)
        .order('name');
      if (filters.status) query = query.eq('status', filters.status);
      if (filters.type)   query = query.eq('type', filters.type);
      return TDRNdb._wrap(query);
    },

    async getById(id) {
      return TDRNdb._wrap(
        TDRNdb._db().from('equipment').select('*').eq('id', id).single()
      );
    },

    async create(data) {
      return TDRNdb._wrap(
        TDRNdb._db().from('equipment').insert({ ...data, county: TDRNdb._county }).select().single()
      );
    },

    async update(id, data) {
      return TDRNdb._wrap(
        TDRNdb._db().from('equipment').update(data).eq('id', id).select().single()
      );
    },

    async assign(id, operatorId, location) {
      return TDRNdb._wrap(
        TDRNdb._db().from('equipment')
          .update({ operator_id: operatorId, location, status: 'in_use' })
          .eq('id', id)
          .select().single()
      );
    }
  },

  // ===========================================================================
  // EVENTS
  // ===========================================================================
  events: {
    async getAll(upcoming = false) {
      let query = TDRNdb._db().from('events')
        .select('*, event_attendees(count)')
        .eq('county', TDRNdb._county)
        .order('event_date', { ascending: true });
      if (upcoming) query = query.gte('event_date', new Date().toISOString());
      return TDRNdb._wrap(query);
    },

    async create(data) {
      return TDRNdb._wrap(
        TDRNdb._db().from('events').insert({ ...data, county: TDRNdb._county }).select().single()
      );
    },

    async update(id, data) {
      return TDRNdb._wrap(
        TDRNdb._db().from('events').update(data).eq('id', id).select().single()
      );
    },

    async getAttendees(eventId) {
      return TDRNdb._wrap(
        TDRNdb._db().from('event_attendees')
          .select('members(id, full_name, role, status)')
          .eq('event_id', eventId)
      );
    },

    async register(eventId, memberId) {
      return TDRNdb._wrap(
        TDRNdb._db().from('event_attendees')
          .upsert({ event_id: eventId, member_id: memberId, registered_at: new Date().toISOString() })
      );
    }
  },

  // ===========================================================================
  // CERTIFICATIONS
  // ===========================================================================
  certifications: {
    async getAll(filters = {}) {
      let query = TDRNdb._db().from('member_certifications')
        .select('*, members(full_name, role), cert_types(name, validity_days)')
        .eq('members.county', TDRNdb._county)
        .order('expiry_date', { ascending: true });
      if (filters.memberId)  query = query.eq('member_id', filters.memberId);
      if (filters.certType)  query = query.eq('cert_type_id', filters.certType);
      if (filters.status)    query = query.eq('status', filters.status);
      return TDRNdb._wrap(query);
    },

    async getExpiring(days = 30) {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() + days);
      return TDRNdb._wrap(
        TDRNdb._db().from('member_certifications')
          .select('*, members(full_name, phone, email), cert_types(name)')
          .lte('expiry_date', cutoff.toISOString())
          .gte('expiry_date', new Date().toISOString())
          .order('expiry_date')
      );
    },

    async issue(data) {
      return TDRNdb._wrap(
        TDRNdb._db().from('member_certifications')
          .insert({ ...data, status: 'current', issued_at: new Date().toISOString() })
          .select().single()
      );
    },

    async revoke(id) {
      return TDRNdb._wrap(
        TDRNdb._db().from('member_certifications')
          .update({ status: 'revoked', revoked_at: new Date().toISOString() })
          .eq('id', id)
          .select().single()
      );
    }
  },

  // ===========================================================================
  // INCIDENTS
  // ===========================================================================
  incidents: {
    async getActive() {
      return TDRNdb._wrap(
        TDRNdb._db().from('incidents')
          .select('*, incident_logs(count)')
          .eq('county', TDRNdb._county)
          .eq('status', 'active')
          .order('declared_at', { ascending: false })
      );
    },

    async create(data) {
      return TDRNdb._wrap(
        TDRNdb._db().from('incidents')
          .insert({ ...data, county: TDRNdb._county, status: 'active', declared_at: new Date().toISOString() })
          .select().single()
      );
    },

    async update(id, data) {
      return TDRNdb._wrap(
        TDRNdb._db().from('incidents').update(data).eq('id', id).select().single()
      );
    },

    async addLog(incidentId, entry) {
      return TDRNdb._wrap(
        TDRNdb._db().from('incident_logs')
          .insert({ incident_id: incidentId, ...entry, logged_at: new Date().toISOString() })
          .select().single()
      );
    },

    async close(id) {
      return TDRNdb._wrap(
        TDRNdb._db().from('incidents')
          .update({ status: 'closed', closed_at: new Date().toISOString() })
          .eq('id', id)
          .select().single()
      );
    }
  },

  // ===========================================================================
  // ALERTS
  // ===========================================================================
  alerts: {
    async getActive() {
      return TDRNdb._wrap(
        TDRNdb._db().from('alerts')
          .select('*')
          .eq('county', TDRNdb._county)
          .eq('status', 'active')
          .order('created_at', { ascending: false })
      );
    },

    async create(data) {
      return TDRNdb._wrap(
        TDRNdb._db().from('alerts')
          .insert({ ...data, county: TDRNdb._county, status: 'active', created_at: new Date().toISOString() })
          .select().single()
      );
    },

    async acknowledge(id, userId) {
      return TDRNdb._wrap(
        TDRNdb._db().from('alerts')
          .update({ acknowledged_by: userId, acknowledged_at: new Date().toISOString() })
          .eq('id', id)
          .select().single()
      );
    },

    async dismiss(id) {
      return TDRNdb._wrap(
        TDRNdb._db().from('alerts')
          .update({ status: 'dismissed', dismissed_at: new Date().toISOString() })
          .eq('id', id)
          .select().single()
      );
    }
  },

  // ===========================================================================
  // APPLICANTS
  // ===========================================================================
  applicants: {
    async getAll() {
      return TDRNdb._wrap(
        TDRNdb._db().from('applicants')
          .select('*')
          .eq('county', TDRNdb._county)
          .order('applied_at', { ascending: false })
      );
    },

    async update(id, stage) {
      return TDRNdb._wrap(
        TDRNdb._db().from('applicants')
          .update({ stage, updated_at: new Date().toISOString() })
          .eq('id', id)
          .select().single()
      );
    },

    async approve(id) {
      const { data: applicant } = await TDRNdb._wrap(
        TDRNdb._db().from('applicants').select('*').eq('id', id).single()
      );
      if (!applicant) return { success: false, error: 'Applicant not found' };
      // Create member record from applicant
      const memberResult = await TDRNdb.members.create({
        full_name: applicant.full_name, email: applicant.email,
        phone: applicant.phone, role: applicant.desired_role,
        skills: applicant.skills, status: 'active'
      });
      if (memberResult.success) {
        await TDRNdb._wrap(
          TDRNdb._db().from('applicants')
            .update({ stage: 'approved', member_id: memberResult.data.id, approved_at: new Date().toISOString() })
            .eq('id', id)
        );
      }
      return memberResult;
    },

    async reject(id) {
      return TDRNdb._wrap(
        TDRNdb._db().from('applicants')
          .update({ stage: 'rejected', updated_at: new Date().toISOString() })
          .eq('id', id)
          .select().single()
      );
    }
  },

  // ===========================================================================
  // PARTNERS
  // ===========================================================================
  partners: {
    async getAll(type = null) {
      let query = TDRNdb._db().from('partners')
        .select('*, partner_agreements(*)')
        .eq('county', TDRNdb._county)
        .order('name');
      if (type) query = query.eq('type', type);
      return TDRNdb._wrap(query);
    },

    async create(data) {
      return TDRNdb._wrap(
        TDRNdb._db().from('partners').insert({ ...data, county: TDRNdb._county }).select().single()
      );
    },

    async update(id, data) {
      return TDRNdb._wrap(
        TDRNdb._db().from('partners').update(data).eq('id', id).select().single()
      );
    }
  },

  // ===========================================================================
  // READINESS SCORES
  // ===========================================================================
  readiness: {
    async getScore(countyId = null) {
      return TDRNdb._wrap(
        TDRNdb._db().from('readiness_scores')
          .select('*')
          .eq('county', countyId || TDRNdb._county)
          .order('recorded_at', { ascending: false })
          .limit(1)
          .single()
      );
    },

    async update(countyId, data) {
      return TDRNdb._wrap(
        TDRNdb._db().from('readiness_scores')
          .insert({ county: countyId || TDRNdb._county, ...data, recorded_at: new Date().toISOString() })
          .select().single()
      );
    }
  },

  // ===========================================================================
  // 3. REAL-TIME SUBSCRIPTIONS
  // ===========================================================================
  subscribe: {
    /** Subscribe to live incident updates */
    incidents(callback) {
      const channel = TDRNdb._db()
        .channel('incidents-live')
        .on('postgres_changes', {
          event: '*', schema: 'public', table: 'incidents',
          filter: `county=eq.${TDRNdb._county}`
        }, payload => callback(payload))
        .subscribe();
      TDRNdb._subscriptions['incidents'] = channel;
      return channel;
    },

    /** Subscribe to live alert feed */
    alerts(callback) {
      const channel = TDRNdb._db()
        .channel('alerts-live')
        .on('postgres_changes', {
          event: '*', schema: 'public', table: 'alerts',
          filter: `county=eq.${TDRNdb._county}`
        }, payload => callback(payload))
        .subscribe();
      TDRNdb._subscriptions['alerts'] = channel;
      return channel;
    },

    /** Subscribe to readiness score changes */
    readiness(callback) {
      const channel = TDRNdb._db()
        .channel('readiness-live')
        .on('postgres_changes', {
          event: 'INSERT', schema: 'public', table: 'readiness_scores',
          filter: `county=eq.${TDRNdb._county}`
        }, payload => callback(payload))
        .subscribe();
      TDRNdb._subscriptions['readiness'] = channel;
      return channel;
    }
  },

  /** Unsubscribe from a named channel */
  unsubscribe(channelName) {
    const ch = TDRNdb._subscriptions[channelName];
    if (ch) {
      TDRNdb._db().removeChannel(ch);
      delete TDRNdb._subscriptions[channelName];
    }
  },

  // ===========================================================================
  // 4. AUTH HELPERS
  // ===========================================================================
  auth: {
    async signIn(email, password) {
      return TDRNdb._wrap(
        TDRNdb._db().auth.signInWithPassword({ email, password })
      );
    },

    async signOut() {
      return TDRNdb._wrap(TDRNdb._db().auth.signOut());
    },

    async getUser() {
      const { data } = await TDRNdb._db().auth.getUser();
      return data?.user || null;
    },

    onAuthChange(callback) {
      return TDRNdb._db().auth.onAuthStateChange((event, session) => {
        callback(event, session);
      });
    }
  },

  // ===========================================================================
  // 5. OFFLINE QUEUE (IndexedDB-backed)
  // ===========================================================================
  queue: {
    _DB_NAME: 'tdrn_offline_queue',
    _STORE:   'operations',

    _openDB() {
      return new Promise((resolve, reject) => {
        const req = indexedDB.open(this._DB_NAME, 1);
        req.onupgradeneeded = e => {
          e.target.result.createObjectStore(this._STORE, { autoIncrement: true });
        };
        req.onsuccess = e => resolve(e.target.result);
        req.onerror  = e => reject(e.target.error);
      });
    },

    /** Queue an operation for later execution */
    async add(operation) {
      // operation: { entity, method, args }
      // e.g.: { entity: 'members', method: 'create', args: [{ full_name: 'Jane' }] }
      const db = await this._openDB();
      return new Promise((resolve, reject) => {
        const tx   = db.transaction(this._STORE, 'readwrite');
        const req  = tx.objectStore(this._STORE).add({
          ...operation,
          queued_at: new Date().toISOString()
        });
        req.onsuccess = () => {
          console.log('[TDRNdb.queue] Operation queued:', operation);
          resolve(req.result);
        };
        req.onerror = () => reject(req.error);
      });
    },

    /** Execute all queued operations */
    async flush() {
      if (!navigator.onLine) return;
      const db  = await this._openDB();
      const ops = await new Promise((resolve, reject) => {
        const tx  = db.transaction(this._STORE, 'readonly');
        const req = tx.objectStore(this._STORE).getAll();
        req.onsuccess = () => resolve(req.result);
        req.onerror   = () => reject(req.error);
      });
      if (!ops.length) return;
      console.log(`[TDRNdb.queue] Flushing ${ops.length} queued operations…`);
      for (const op of ops) {
        try {
          if (TDRNdb[op.entity] && TDRNdb[op.entity][op.method]) {
            await TDRNdb[op.entity][op.method](...(op.args || []));
          }
        } catch (e) {
          console.error('[TDRNdb.queue] Failed to execute operation:', op, e);
        }
      }
      // Clear successfully flushed operations
      const clearTx = db.transaction(this._STORE, 'readwrite');
      clearTx.objectStore(this._STORE).clear();
      console.log('[TDRNdb.queue] Queue cleared.');
    },

    /** Return count of pending operations */
    async getCount() {
      const db = await this._openDB();
      return new Promise((resolve, reject) => {
        const tx  = db.transaction(this._STORE, 'readonly');
        const req = tx.objectStore(this._STORE).count();
        req.onsuccess = () => resolve(req.result);
        req.onerror   = () => reject(req.error);
      });
    }
  }
};

// Initialize if SDK already on page
if (window.supabase) TDRNdb._init();

// Export for module environments
if (typeof module !== 'undefined') module.exports = TDRNdb;


/* =============================================================================
   6. SQL SCHEMA
   Run this in: Supabase Dashboard → SQL Editor → New Query
   =============================================================================

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─────────────────────────────────────────────────────────────────
-- USERS (extends Supabase auth.users)
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.users (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  county      TEXT NOT NULL,
  role        TEXT NOT NULL DEFAULT 'read_only', -- national_admin | county_admin | operations_lead | read_only
  full_name   TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
-- RLS: Users can only read/write their own row
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_self" ON public.users
  FOR ALL USING (auth.uid() = id);

-- ─────────────────────────────────────────────────────────────────
-- MEMBERS
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.members (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  county        TEXT NOT NULL,
  full_name     TEXT NOT NULL,
  first_name    TEXT,
  last_name     TEXT,
  email         TEXT UNIQUE,
  phone         TEXT,
  role          TEXT NOT NULL DEFAULT 'volunteer', -- team_leader | operator | volunteer | coordinator
  status        TEXT NOT NULL DEFAULT 'active',   -- active | standby | inactive
  skills        TEXT[],                            -- e.g. ARRAY['chainsaw','medical','logistics']
  address       TEXT,
  join_date     DATE DEFAULT CURRENT_DATE,
  notes         TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_members_county  ON public.members(county);
CREATE INDEX idx_members_status  ON public.members(status);
CREATE INDEX idx_members_name    ON public.members(last_name, first_name);
-- RLS: members in same county can read; county_admin and above can write
ALTER TABLE public.members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members_read" ON public.members
  FOR SELECT USING (county = (SELECT county FROM public.users WHERE id = auth.uid()));
CREATE POLICY "members_write" ON public.members
  FOR ALL USING (
    (SELECT role FROM public.users WHERE id = auth.uid()) IN ('county_admin','national_admin','operations_lead')
    AND county = (SELECT county FROM public.users WHERE id = auth.uid())
  );

-- ─────────────────────────────────────────────────────────────────
-- TEAMS
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.teams (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  county          TEXT NOT NULL,
  name            TEXT NOT NULL,
  leader_id       UUID REFERENCES public.members(id),
  specialization  TEXT,
  status          TEXT DEFAULT 'standby', -- deployed | standby | training
  readiness_pct   INTEGER DEFAULT 100,
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_teams_county ON public.teams(county);
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;
CREATE POLICY "teams_read" ON public.teams
  FOR SELECT USING (county = (SELECT county FROM public.users WHERE id = auth.uid()));
CREATE POLICY "teams_write" ON public.teams
  FOR ALL USING ((SELECT role FROM public.users WHERE id = auth.uid()) IN ('county_admin','national_admin','operations_lead'));

-- ─────────────────────────────────────────────────────────────────
-- TEAM MEMBERS (junction)
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.team_members (
  team_id    UUID REFERENCES public.teams(id)   ON DELETE CASCADE,
  member_id  UUID REFERENCES public.members(id) ON DELETE CASCADE,
  joined_at  TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (team_id, member_id)
);

-- ─────────────────────────────────────────────────────────────────
-- EQUIPMENT
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.equipment (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  county           TEXT NOT NULL,
  name             TEXT NOT NULL,
  type             TEXT NOT NULL, -- heavy_equipment | chainsaw | vehicle | lighting | sanitation | comms
  owner            TEXT,
  operator_id      UUID REFERENCES public.members(id),
  status           TEXT DEFAULT 'operational', -- operational | in_use | maintenance | offline
  location         TEXT,
  serial_number    TEXT,
  daily_rate       NUMERIC(10,2),
  last_inspection  DATE,
  notes            TEXT,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_equipment_county ON public.equipment(county);
CREATE INDEX idx_equipment_status ON public.equipment(status);
ALTER TABLE public.equipment ENABLE ROW LEVEL SECURITY;
CREATE POLICY "equipment_read" ON public.equipment
  FOR SELECT USING (county = (SELECT county FROM public.users WHERE id = auth.uid()));
CREATE POLICY "equipment_write" ON public.equipment
  FOR ALL USING ((SELECT role FROM public.users WHERE id = auth.uid()) IN ('county_admin','national_admin','operations_lead'));

-- ─────────────────────────────────────────────────────────────────
-- EVENTS
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.events (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  county        TEXT NOT NULL,
  title         TEXT NOT NULL,
  type          TEXT NOT NULL, -- training | meeting | deployment | drill
  event_date    DATE NOT NULL,
  start_time    TIME,
  end_time      TIME,
  location      TEXT,
  max_capacity  INTEGER,
  description   TEXT,
  required_certs TEXT[],
  notify_members BOOLEAN DEFAULT TRUE,
  created_by    UUID REFERENCES auth.users(id),
  created_at    TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_events_county ON public.events(county);
CREATE INDEX idx_events_date   ON public.events(event_date);
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "events_read" ON public.events
  FOR SELECT USING (county = (SELECT county FROM public.users WHERE id = auth.uid()));
CREATE POLICY "events_write" ON public.events
  FOR ALL USING ((SELECT role FROM public.users WHERE id = auth.uid()) IN ('county_admin','national_admin','operations_lead','training_coordinator'));

-- ─────────────────────────────────────────────────────────────────
-- EVENT ATTENDEES (junction)
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.event_attendees (
  event_id       UUID REFERENCES public.events(id)   ON DELETE CASCADE,
  member_id      UUID REFERENCES public.members(id)  ON DELETE CASCADE,
  registered_at  TIMESTAMPTZ DEFAULT NOW(),
  attended       BOOLEAN DEFAULT FALSE,
  PRIMARY KEY (event_id, member_id)
);

-- ─────────────────────────────────────────────────────────────────
-- CERTIFICATION TYPES
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.cert_types (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name           TEXT NOT NULL UNIQUE, -- ICS-100, First Aid/CPR, Chainsaw Safety, etc.
  description    TEXT,
  validity_days  INTEGER DEFAULT 730,  -- 2 years default
  issuing_body   TEXT,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────────
-- MEMBER CERTIFICATIONS
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.member_certifications (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  member_id      UUID NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  cert_type_id   UUID NOT NULL REFERENCES public.cert_types(id),
  issued_date    DATE NOT NULL,
  expiry_date    DATE NOT NULL,
  issued_by      TEXT,
  cert_number    TEXT,
  status         TEXT DEFAULT 'current', -- current | expiring_soon | expired | revoked
  issued_at      TIMESTAMPTZ DEFAULT NOW(),
  revoked_at     TIMESTAMPTZ
);
CREATE INDEX idx_certs_member  ON public.member_certifications(member_id);
CREATE INDEX idx_certs_expiry  ON public.member_certifications(expiry_date);
CREATE INDEX idx_certs_status  ON public.member_certifications(status);
ALTER TABLE public.member_certifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "certs_read" ON public.member_certifications
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.members m WHERE m.id = member_id
      AND m.county = (SELECT county FROM public.users WHERE id = auth.uid()))
  );

-- ─────────────────────────────────────────────────────────────────
-- INCIDENTS
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.incidents (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  county          TEXT NOT NULL,
  name            TEXT NOT NULL,
  type            TEXT NOT NULL, -- tornado | flood | fire | medical_mass_casualty | haz_mat | other
  severity        INTEGER CHECK (severity BETWEEN 1 AND 5),
  ics_level       INTEGER CHECK (ics_level BETWEEN 1 AND 5),
  status          TEXT DEFAULT 'active', -- active | monitoring | closed
  incident_commander UUID REFERENCES public.members(id),
  declared_at     TIMESTAMPTZ DEFAULT NOW(),
  closed_at       TIMESTAMPTZ,
  location        TEXT,
  description     TEXT,
  mutual_aid      BOOLEAN DEFAULT FALSE,
  created_by      UUID REFERENCES auth.users(id),
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_incidents_county ON public.incidents(county);
CREATE INDEX idx_incidents_status ON public.incidents(status);
ALTER TABLE public.incidents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "incidents_read" ON public.incidents
  FOR SELECT USING (county = (SELECT county FROM public.users WHERE id = auth.uid()));
CREATE POLICY "incidents_write" ON public.incidents
  FOR ALL USING ((SELECT role FROM public.users WHERE id = auth.uid()) IN ('county_admin','national_admin','operations_lead'));

-- ─────────────────────────────────────────────────────────────────
-- INCIDENT LOGS
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.incident_logs (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  incident_id  UUID NOT NULL REFERENCES public.incidents(id) ON DELETE CASCADE,
  entry_type   TEXT NOT NULL, -- deployment | comms | status | resource | safety
  message      TEXT NOT NULL,
  logged_by    UUID REFERENCES public.members(id),
  logged_by_name TEXT,
  logged_at    TIMESTAMPTZ DEFAULT NOW(),
  location     TEXT,
  attachments  JSONB
);
CREATE INDEX idx_incident_logs_incident ON public.incident_logs(incident_id);
CREATE INDEX idx_incident_logs_time     ON public.incident_logs(logged_at DESC);
ALTER TABLE public.incident_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "logs_read" ON public.incident_logs
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.incidents i WHERE i.id = incident_id
      AND i.county = (SELECT county FROM public.users WHERE id = auth.uid()))
  );

-- ─────────────────────────────────────────────────────────────────
-- ALERTS
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.alerts (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  county           TEXT NOT NULL,
  title            TEXT NOT NULL,
  message          TEXT NOT NULL,
  type             TEXT NOT NULL DEFAULT 'info', -- critical | warning | info
  status           TEXT DEFAULT 'active',        -- active | acknowledged | dismissed
  issued_by        TEXT,
  issued_by_uid    UUID REFERENCES auth.users(id),
  affected_area    TEXT,
  expiry_at        TIMESTAMPTZ,
  acknowledged_by  UUID REFERENCES auth.users(id),
  acknowledged_at  TIMESTAMPTZ,
  dismissed_at     TIMESTAMPTZ,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_alerts_county ON public.alerts(county);
CREATE INDEX idx_alerts_status ON public.alerts(status);
ALTER TABLE public.alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "alerts_read" ON public.alerts
  FOR SELECT USING (county = (SELECT county FROM public.users WHERE id = auth.uid()));
CREATE POLICY "alerts_write" ON public.alerts
  FOR ALL USING ((SELECT role FROM public.users WHERE id = auth.uid()) IN ('county_admin','national_admin','operations_lead'));

-- ─────────────────────────────────────────────────────────────────
-- APPLICANTS
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.applicants (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  county          TEXT NOT NULL,
  full_name       TEXT NOT NULL,
  email           TEXT,
  phone           TEXT,
  desired_role    TEXT,
  skills          TEXT[],
  how_heard       TEXT,
  stage           TEXT DEFAULT 'new_inquiry', -- new_inquiry | application_received | interview_vetting | approved | rejected
  notes           TEXT,
  assigned_reviewer UUID REFERENCES public.members(id),
  member_id       UUID REFERENCES public.members(id), -- set on approval
  applied_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  approved_at     TIMESTAMPTZ
);
CREATE INDEX idx_applicants_county ON public.applicants(county);
CREATE INDEX idx_applicants_stage  ON public.applicants(stage);
ALTER TABLE public.applicants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "applicants_read" ON public.applicants
  FOR SELECT USING (county = (SELECT county FROM public.users WHERE id = auth.uid()));
CREATE POLICY "applicants_write" ON public.applicants
  FOR ALL USING ((SELECT role FROM public.users WHERE id = auth.uid()) IN ('county_admin','national_admin','operations_lead'));

-- ─────────────────────────────────────────────────────────────────
-- PARTNERS
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.partners (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  county            TEXT NOT NULL,
  name              TEXT NOT NULL,
  type              TEXT NOT NULL, -- government | contractor | nonprofit | medical | equipment | mutual_aid
  contact_name      TEXT,
  contact_title     TEXT,
  phone             TEXT,
  email             TEXT,
  services          TEXT[],
  last_contact_date DATE,
  notes             TEXT,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_partners_county ON public.partners(county);
ALTER TABLE public.partners ENABLE ROW LEVEL SECURITY;
CREATE POLICY "partners_read" ON public.partners
  FOR SELECT USING (county = (SELECT county FROM public.users WHERE id = auth.uid()));

-- ─────────────────────────────────────────────────────────────────
-- PARTNER AGREEMENTS
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.partner_agreements (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  partner_id      UUID NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  agreement_type  TEXT NOT NULL, -- MOU | active_contract | standby | informal
  signed_date     DATE,
  expiry_date     DATE,
  services_covered TEXT,
  status          TEXT DEFAULT 'active',
  document_url    TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_partner_agreements_partner ON public.partner_agreements(partner_id);

-- ─────────────────────────────────────────────────────────────────
-- READINESS SCORES
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.readiness_scores (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  county           TEXT NOT NULL,
  overall_score    INTEGER CHECK (overall_score BETWEEN 0 AND 100),
  personnel_score  INTEGER CHECK (personnel_score BETWEEN 0 AND 100),
  equipment_score  INTEGER CHECK (equipment_score BETWEEN 0 AND 100),
  comms_score      INTEGER CHECK (comms_score BETWEEN 0 AND 100),
  logistics_score  INTEGER CHECK (logistics_score BETWEEN 0 AND 100),
  training_score   INTEGER CHECK (training_score BETWEEN 0 AND 100),
  recorded_at      TIMESTAMPTZ DEFAULT NOW(),
  recorded_by      UUID REFERENCES auth.users(id)
);
CREATE INDEX idx_readiness_county ON public.readiness_scores(county);
CREATE INDEX idx_readiness_time   ON public.readiness_scores(recorded_at DESC);
ALTER TABLE public.readiness_scores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "readiness_read" ON public.readiness_scores
  FOR SELECT USING (county = (SELECT county FROM public.users WHERE id = auth.uid()));

*/
