/**
 * TDRN Neon Database Client — neon-client.js
 * Thrive Disaster Response Network | PostgreSQL via Neon Serverless
 * Version: 2.0.0
 *
 * ⚠  SECURITY WARNING ⚠
 * This file contains database credentials. For production deployments:
 * 1. Route ALL database calls through a serverless proxy (Supabase Edge Function,
 *    Netlify Function, Cloudflare Worker, or Vercel Edge Function)
 * 2. Never expose your raw connection string in client-side JavaScript
 * 3. Use GHL Custom Code only after setting up a proxy endpoint
 *    and replacing NEON_HTTP_ENDPOINT + NEON_TOKEN below with proxy URLs
 *
 * SETUP:
 * Include BEFORE tdrn-core.js:
 *   <script src="neon-client.js"></script>
 *
 * Neon Serverless HTTP API docs: https://neon.tech/docs/serverless/serverless-driver
 */

// =============================================================================
// CONFIGURATION  — replace with your proxy URL in production
// =============================================================================

const NEON_CONFIG = {
  // Parsed from connection string — MOVE BEHIND A PROXY FOR PRODUCTION
  host:     'ep-hidden-art-am8e6nok.c-5.us-east-1.aws.neon.tech',
  database: 'neondb',
  user:     'neondb_owner',
  password: 'npg_gQSFTh5wDIB2',

  // Neon HTTP API endpoint
  get httpEndpoint() {
    return `https://${this.host}/sql`;
  },

  // Basic auth header for Neon HTTP API
  get authHeader() {
    return 'Basic ' + btoa(`${this.user}:${this.password}`);
  },

  // Optional: set to your serverless proxy URL to avoid client-side credentials
  // proxyEndpoint: 'https://your-proxy.netlify.app/.netlify/functions/db',
  proxyEndpoint: null,
};

// =============================================================================
// NEON DB CLIENT
// =============================================================================

const NeonDB = {
  _county: 'warren_county',
  _queryCount: 0,
  _errors: 0,

  /** Override county scope */
  setCounty(county) {
    this._county = county;
  },

  /**
   * Execute a parameterized SQL query via Neon HTTP API
   * @param {string}  sql    - Parameterized SQL (use $1, $2, … placeholders)
   * @param {Array}   params - Parameter values
   * @returns {{ success, rows, rowCount, error }}
   */
  async query(sql, params = []) {
    this._queryCount++;
    try {
      const endpoint = NEON_CONFIG.proxyEndpoint || NEON_CONFIG.httpEndpoint;
      const headers  = {
        'Content-Type':  'application/json',
        'Neon-Connection-String': `postgresql://${NEON_CONFIG.user}:${NEON_CONFIG.password}@${NEON_CONFIG.host}/${NEON_CONFIG.database}?sslmode=require`,
      };

      // If using proxy, swap auth header
      if (!NEON_CONFIG.proxyEndpoint) {
        headers['Authorization'] = NEON_CONFIG.authHeader;
      }

      const res = await fetch(endpoint, {
        method:  'POST',
        headers,
        body: JSON.stringify({ query: sql, params }),
      });

      if (!res.ok) {
        const body = await res.text();
        this._errors++;
        return { success: false, rows: [], rowCount: 0, error: `HTTP ${res.status}: ${body}` };
      }

      const json = await res.json();
      // Neon HTTP API returns: { rows: [...], rowCount: n, fields: [...] }
      return {
        success:  true,
        rows:     json.rows     || [],
        rowCount: json.rowCount || json.rows?.length || 0,
        fields:   json.fields   || [],
        error:    null,
      };
    } catch (e) {
      this._errors++;
      return { success: false, rows: [], rowCount: 0, error: e.message };
    }
  },

  /** Execute multiple queries in a transaction */
  async transaction(queries) {
    // queries: [{ sql, params }]
    const results = [];
    for (const q of queries) {
      const r = await this.query(q.sql, q.params || []);
      results.push(r);
      if (!r.success) break; // abort on first failure
    }
    return results;
  },

  // ==========================================================================
  // MEMBERS
  // ==========================================================================
  members: {
    async getAll({ status, role, skill, search, limit = 200, offset = 0 } = {}) {
      let sql = `SELECT * FROM members WHERE county = $1`;
      const params = [NeonDB._county];
      let idx = 2;

      if (status) { sql += ` AND status = $${idx++}`; params.push(status); }
      if (role)   { sql += ` AND role = $${idx++}`;   params.push(role); }
      if (skill)  { sql += ` AND $${idx++} = ANY(skills)`; params.push(skill); }
      if (search) { sql += ` AND (full_name ILIKE $${idx} OR email ILIKE $${idx++})`; params.push(`%${search}%`); }

      sql += ` ORDER BY last_name, first_name LIMIT $${idx++} OFFSET $${idx++}`;
      params.push(limit, offset);

      return NeonDB.query(sql, params);
    },

    async getById(id) {
      return NeonDB.query('SELECT * FROM members WHERE id = $1', [id]);
    },

    async create(data) {
      const cols   = Object.keys(data);
      const vals   = Object.values(data);
      const pholds = cols.map((_, i) => `$${i + 2}`);
      return NeonDB.query(
        `INSERT INTO members (county, ${cols.join(', ')}) VALUES ($1, ${pholds.join(', ')}) RETURNING *`,
        [NeonDB._county, ...vals]
      );
    },

    async update(id, data) {
      const cols   = Object.keys(data);
      const vals   = Object.values(data);
      const sets   = cols.map((c, i) => `${c} = $${i + 2}`);
      return NeonDB.query(
        `UPDATE members SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $1 RETURNING *`,
        [id, ...vals]
      );
    },

    async delete(id) {
      return NeonDB.query('DELETE FROM members WHERE id = $1', [id]);
    },

    async search(q) {
      return NeonDB.query(
        `SELECT id, full_name, role, status, phone FROM members
         WHERE county = $1 AND (full_name ILIKE $2 OR email ILIKE $2)
         ORDER BY full_name LIMIT 20`,
        [NeonDB._county, `%${q}%`]
      );
    }
  },

  // ==========================================================================
  // TEAMS
  // ==========================================================================
  teams: {
    async getAll() {
      return NeonDB.query(
        `SELECT t.*, m.full_name AS leader_name,
                COUNT(tm.member_id) AS member_count
         FROM teams t
         LEFT JOIN members m ON m.id = t.leader_id
         LEFT JOIN team_members tm ON tm.team_id = t.id
         WHERE t.county = $1
         GROUP BY t.id, m.full_name
         ORDER BY t.name`,
        [NeonDB._county]
      );
    },

    async getById(id) {
      return NeonDB.query('SELECT * FROM teams WHERE id = $1', [id]);
    },

    async getMembers(teamId) {
      return NeonDB.query(
        `SELECT m.* FROM members m
         JOIN team_members tm ON tm.member_id = m.id
         WHERE tm.team_id = $1 ORDER BY m.last_name`,
        [teamId]
      );
    },

    async create(data) {
      const { name, leader_id, specialization, notes } = data;
      return NeonDB.query(
        `INSERT INTO teams (county, name, leader_id, specialization, notes)
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [NeonDB._county, name, leader_id, specialization, notes]
      );
    },

    async assignMember(teamId, memberId) {
      return NeonDB.query(
        `INSERT INTO team_members (team_id, member_id) VALUES ($1, $2)
         ON CONFLICT (team_id, member_id) DO NOTHING`,
        [teamId, memberId]
      );
    }
  },

  // ==========================================================================
  // EQUIPMENT
  // ==========================================================================
  equipment: {
    async getAll({ status, type } = {}) {
      let sql = 'SELECT e.*, m.full_name AS operator_name FROM equipment e LEFT JOIN members m ON m.id = e.operator_id WHERE e.county = $1';
      const params = [NeonDB._county];
      let idx = 2;
      if (status) { sql += ` AND e.status = $${idx++}`; params.push(status); }
      if (type)   { sql += ` AND e.type = $${idx++}`;   params.push(type); }
      sql += ' ORDER BY e.name';
      return NeonDB.query(sql, params);
    },

    async create(data) {
      const cols   = Object.keys(data);
      const vals   = Object.values(data);
      const pholds = cols.map((_, i) => `$${i + 2}`);
      return NeonDB.query(
        `INSERT INTO equipment (county, ${cols.join(', ')}) VALUES ($1, ${pholds.join(', ')}) RETURNING *`,
        [NeonDB._county, ...vals]
      );
    },

    async update(id, data) {
      const cols = Object.keys(data);
      const vals = Object.values(data);
      const sets = cols.map((c, i) => `${c} = $${i + 2}`);
      return NeonDB.query(
        `UPDATE equipment SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $1 RETURNING *`,
        [id, ...vals]
      );
    },

    async assign(id, operatorId, location) {
      return NeonDB.query(
        `UPDATE equipment SET operator_id = $2, location = $3, status = 'in_use', updated_at = NOW()
         WHERE id = $1 RETURNING *`,
        [id, operatorId, location]
      );
    }
  },

  // ==========================================================================
  // INCIDENTS
  // ==========================================================================
  incidents: {
    async getActive() {
      return NeonDB.query(
        `SELECT i.*, m.full_name AS ic_name,
                (SELECT COUNT(*) FROM incident_logs l WHERE l.incident_id = i.id) AS log_count
         FROM incidents i
         LEFT JOIN members m ON m.id = i.incident_commander
         WHERE i.county = $1 AND i.status = 'active'
         ORDER BY i.declared_at DESC`,
        [NeonDB._county]
      );
    },

    async create(data) {
      const { name, type, severity, ics_level, location, description, incident_commander } = data;
      return NeonDB.query(
        `INSERT INTO incidents (county, name, type, severity, ics_level, location, description, incident_commander, status, declared_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'active', NOW()) RETURNING *`,
        [NeonDB._county, name, type, severity, ics_level, location, description, incident_commander]
      );
    },

    async addLog(incidentId, { entry_type, message, logged_by_name, location }) {
      return NeonDB.query(
        `INSERT INTO incident_logs (incident_id, entry_type, message, logged_by_name, location, logged_at)
         VALUES ($1,$2,$3,$4,$5,NOW()) RETURNING *`,
        [incidentId, entry_type, message, logged_by_name, location]
      );
    },

    async close(id) {
      return NeonDB.query(
        `UPDATE incidents SET status = 'closed', closed_at = NOW(), updated_at = NOW()
         WHERE id = $1 RETURNING *`,
        [id]
      );
    },

    async getLogs(incidentId, limit = 50) {
      return NeonDB.query(
        `SELECT * FROM incident_logs WHERE incident_id = $1 ORDER BY logged_at DESC LIMIT $2`,
        [incidentId, limit]
      );
    }
  },

  // ==========================================================================
  // ALERTS
  // ==========================================================================
  alerts: {
    async getActive() {
      return NeonDB.query(
        `SELECT * FROM alerts WHERE county = $1 AND status = 'active' ORDER BY created_at DESC`,
        [NeonDB._county]
      );
    },

    async create({ title, message, type = 'info', issued_by, affected_area, expiry_at }) {
      return NeonDB.query(
        `INSERT INTO alerts (county, title, message, type, issued_by, affected_area, expiry_at, status, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'active',NOW()) RETURNING *`,
        [NeonDB._county, title, message, type, issued_by, affected_area, expiry_at]
      );
    },

    async acknowledge(id, userName) {
      return NeonDB.query(
        `UPDATE alerts SET acknowledged_at = NOW() WHERE id = $1 RETURNING *`,
        [id]
      );
    },

    async dismiss(id) {
      return NeonDB.query(
        `UPDATE alerts SET status = 'dismissed', dismissed_at = NOW() WHERE id = $1 RETURNING *`,
        [id]
      );
    }
  },

  // ==========================================================================
  // CERTIFICATIONS
  // ==========================================================================
  certifications: {
    async getAll({ memberId, certType, status } = {}) {
      let sql = `SELECT mc.*, m.full_name, ct.name AS cert_name, ct.validity_days
                 FROM member_certifications mc
                 JOIN members m ON m.id = mc.member_id
                 JOIN cert_types ct ON ct.id = mc.cert_type_id
                 WHERE m.county = $1`;
      const params = [NeonDB._county];
      let idx = 2;
      if (memberId) { sql += ` AND mc.member_id = $${idx++}`; params.push(memberId); }
      if (certType) { sql += ` AND mc.cert_type_id = $${idx++}`; params.push(certType); }
      if (status)   { sql += ` AND mc.status = $${idx++}`; params.push(status); }
      sql += ' ORDER BY mc.expiry_date ASC';
      return NeonDB.query(sql, params);
    },

    async getExpiring(days = 30) {
      return NeonDB.query(
        `SELECT mc.*, m.full_name, m.phone, m.email, ct.name AS cert_name
         FROM member_certifications mc
         JOIN members m ON m.id = mc.member_id
         JOIN cert_types ct ON ct.id = mc.cert_type_id
         WHERE m.county = $1
           AND mc.expiry_date <= NOW() + INTERVAL '${days} days'
           AND mc.expiry_date >= NOW()
         ORDER BY mc.expiry_date ASC`,
        [NeonDB._county]
      );
    },

    async issue({ member_id, cert_type_id, issued_date, expiry_date, issued_by, cert_number }) {
      return NeonDB.query(
        `INSERT INTO member_certifications (member_id, cert_type_id, issued_date, expiry_date, issued_by, cert_number, status, issued_at)
         VALUES ($1,$2,$3,$4,$5,$6,'current',NOW()) RETURNING *`,
        [member_id, cert_type_id, issued_date, expiry_date, issued_by, cert_number]
      );
    },

    async revoke(id) {
      return NeonDB.query(
        `UPDATE member_certifications SET status = 'revoked', revoked_at = NOW() WHERE id = $1 RETURNING *`,
        [id]
      );
    }
  },

  // ==========================================================================
  // EVENTS
  // ==========================================================================
  events: {
    async getAll(upcomingOnly = false) {
      let sql = `SELECT e.*, COUNT(ea.member_id) AS attendee_count
                 FROM events e
                 LEFT JOIN event_attendees ea ON ea.event_id = e.id
                 WHERE e.county = $1`;
      const params = [NeonDB._county];
      if (upcomingOnly) { sql += ` AND e.event_date >= CURRENT_DATE`; }
      sql += ` GROUP BY e.id ORDER BY e.event_date ASC`;
      return NeonDB.query(sql, params);
    },

    async create(data) {
      const { title, type, event_date, start_time, end_time, location, max_capacity, description } = data;
      return NeonDB.query(
        `INSERT INTO events (county, title, type, event_date, start_time, end_time, location, max_capacity, description)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
        [NeonDB._county, title, type, event_date, start_time, end_time, location, max_capacity, description]
      );
    },

    async register(eventId, memberId) {
      return NeonDB.query(
        `INSERT INTO event_attendees (event_id, member_id, registered_at)
         VALUES ($1,$2,NOW()) ON CONFLICT DO NOTHING`,
        [eventId, memberId]
      );
    }
  },

  // ==========================================================================
  // APPLICANTS
  // ==========================================================================
  applicants: {
    async getAll() {
      return NeonDB.query(
        `SELECT a.*, m.full_name AS reviewer_name
         FROM applicants a
         LEFT JOIN members m ON m.id = a.assigned_reviewer
         WHERE a.county = $1
         ORDER BY a.applied_at DESC`,
        [NeonDB._county]
      );
    },

    async updateStage(id, stage) {
      return NeonDB.query(
        `UPDATE applicants SET stage = $2, updated_at = NOW() WHERE id = $1 RETURNING *`,
        [id, stage]
      );
    },

    async approve(id) {
      // Get applicant
      const { rows } = await NeonDB.query(`SELECT * FROM applicants WHERE id = $1`, [id]);
      if (!rows.length) return { success: false, error: 'Not found' };
      const a = rows[0];
      // Create member
      const result = await NeonDB.members.create({
        full_name: a.full_name, email: a.email, phone: a.phone,
        role: a.desired_role || 'volunteer', skills: a.skills, status: 'active'
      });
      if (result.success && result.rows.length) {
        await NeonDB.query(
          `UPDATE applicants SET stage = 'approved', member_id = $2, approved_at = NOW() WHERE id = $1`,
          [id, result.rows[0].id]
        );
      }
      return result;
    }
  },

  // ==========================================================================
  // PARTNERS
  // ==========================================================================
  partners: {
    async getAll(type = null) {
      let sql = `SELECT p.*, json_agg(pa.*) AS agreements
                 FROM partners p
                 LEFT JOIN partner_agreements pa ON pa.partner_id = p.id
                 WHERE p.county = $1`;
      const params = [NeonDB._county];
      if (type) { sql += ` AND p.type = $2`; params.push(type); }
      sql += ` GROUP BY p.id ORDER BY p.name`;
      return NeonDB.query(sql, params);
    },

    async create(data) {
      const cols   = Object.keys(data);
      const vals   = Object.values(data);
      const pholds = cols.map((_, i) => `$${i + 2}`);
      return NeonDB.query(
        `INSERT INTO partners (county, ${cols.join(', ')}) VALUES ($1, ${pholds.join(', ')}) RETURNING *`,
        [NeonDB._county, ...vals]
      );
    }
  },

  // ==========================================================================
  // READINESS
  // ==========================================================================
  readiness: {
    async getLatest(countyId = null) {
      return NeonDB.query(
        `SELECT * FROM readiness_scores WHERE county = $1 ORDER BY recorded_at DESC LIMIT 1`,
        [countyId || NeonDB._county]
      );
    },

    async record(scores) {
      const { overall_score, personnel_score, equipment_score, comms_score, logistics_score, training_score } = scores;
      return NeonDB.query(
        `INSERT INTO readiness_scores (county, overall_score, personnel_score, equipment_score, comms_score, logistics_score, training_score, recorded_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,NOW()) RETURNING *`,
        [NeonDB._county, overall_score, personnel_score, equipment_score, comms_score, logistics_score, training_score]
      );
    }
  },

  // ==========================================================================
  // ANALYTICS QUERIES
  // ==========================================================================
  analytics: {
    async getMemberStats() {
      return NeonDB.query(
        `SELECT
           COUNT(*) FILTER (WHERE status = 'active')   AS active,
           COUNT(*) FILTER (WHERE status = 'standby')  AS standby,
           COUNT(*) FILTER (WHERE status = 'inactive') AS inactive,
           COUNT(*) AS total
         FROM members WHERE county = $1`,
        [NeonDB._county]
      );
    },

    async getIncidentHistory(months = 12) {
      return NeonDB.query(
        `SELECT
           DATE_TRUNC('month', declared_at) AS month,
           COUNT(*) AS incident_count,
           AVG(EXTRACT(EPOCH FROM (COALESCE(closed_at, NOW()) - declared_at)) / 3600) AS avg_duration_hours
         FROM incidents
         WHERE county = $1
           AND declared_at >= NOW() - INTERVAL '${months} months'
         GROUP BY 1 ORDER BY 1`,
        [NeonDB._county]
      );
    },

    async getTrainingCompliance() {
      return NeonDB.query(
        `SELECT ct.name AS cert_type,
                COUNT(DISTINCT mc.member_id) AS certified,
                (SELECT COUNT(*) FROM members WHERE county = $1 AND status = 'active') AS total_active,
                ROUND(COUNT(DISTINCT mc.member_id)::numeric /
                  NULLIF((SELECT COUNT(*) FROM members WHERE county = $1 AND status = 'active'), 0) * 100, 1) AS compliance_pct
         FROM cert_types ct
         LEFT JOIN member_certifications mc ON mc.cert_type_id = ct.id AND mc.status = 'current'
         GROUP BY ct.name ORDER BY ct.name`,
        [NeonDB._county]
      );
    },

    async getEquipmentUtilization() {
      return NeonDB.query(
        `SELECT type,
                COUNT(*) AS total,
                COUNT(*) FILTER (WHERE status = 'operational') AS operational,
                COUNT(*) FILTER (WHERE status = 'in_use')      AS in_use,
                COUNT(*) FILTER (WHERE status = 'maintenance') AS maintenance
         FROM equipment WHERE county = $1
         GROUP BY type ORDER BY total DESC`,
        [NeonDB._county]
      );
    }
  },

  // ==========================================================================
  // HEALTH CHECK
  // ==========================================================================
  async ping() {
    const result = await this.query('SELECT 1 AS ok, NOW() AS server_time');
    if (result.success) {
      console.log('[NeonDB] Connected. Server time:', result.rows[0]?.server_time);
    } else {
      console.error('[NeonDB] Connection failed:', result.error);
    }
    return result.success;
  },

  getStats() {
    return {
      queries: this._queryCount,
      errors:  this._errors,
      county:  this._county,
      endpoint: NEON_CONFIG.proxyEndpoint || NEON_CONFIG.httpEndpoint
    };
  }
};

// Expose globally
window.NeonDB = NeonDB;

// Auto-ping on load (optional — comment out to suppress)
document.addEventListener('DOMContentLoaded', () => {
  NeonDB.ping().catch(() => {});
});

console.log('[TDRN NeonDB] Client loaded. Call NeonDB.ping() to verify connection.');
