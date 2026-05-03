/* ==========================================================================
   TDRN Core JavaScript Module — tdrn-core.js
   Thrive Disaster Response Network Admin Portal
   Version: 2.0.0 | Phase 1 Foundation
   Pure static JS — no build tools, no dependencies, GHL compatible
   ========================================================================== */

'use strict';

/* --------------------------------------------------------------------------
   TDRN NAMESPACE
   -------------------------------------------------------------------------- */
window.TDRN = window.TDRN || {};

(function (TDRN) {

  /* ========================================================================
     SECTION 1 — CLIENT-SIDE HASH ROUTER
     ======================================================================== */

  TDRN.router = {

    /** Route map: hash fragment → { title, sectionId } */
    routes: {
      '#/dashboard':    { title: 'Dashboard — TDRN',        sectionId: 'page-dashboard' },
      '#/members':      { title: 'Members — TDRN',          sectionId: 'page-members' },
      '#/teams':        { title: 'Teams — TDRN',            sectionId: 'page-teams' },
      '#/equipment':    { title: 'Equipment — TDRN',        sectionId: 'page-equipment' },
      '#/events':       { title: 'Events — TDRN',           sectionId: 'page-events' },
      '#/alerts':       { title: 'Alerts — TDRN',           sectionId: 'page-alerts' },
      '#/counties':     { title: 'Counties — TDRN',         sectionId: 'page-counties' },
      '#/reports':      { title: 'Reports — TDRN',          sectionId: 'page-reports' },
      '#/settings':     { title: 'Settings — TDRN',         sectionId: 'page-settings' },
      '#/training':     { title: 'Training — TDRN',         sectionId: 'page-training' },
    },

    _currentRoute: null,

    /** Initialize router — bind hashchange and handle current hash */
    init: function () {
      window.addEventListener('hashchange', TDRN.router._onHashChange.bind(TDRN.router));
      TDRN.router._onHashChange();
    },

    /** Handle hash change event */
    _onHashChange: function () {
      var hash = window.location.hash || '#/dashboard';

      // Normalize: if no route match, default to dashboard
      if (!TDRN.router.routes[hash]) {
        hash = '#/dashboard';
        window.history.replaceState(null, '', hash);
      }

      var route = TDRN.router.routes[hash];
      TDRN.router._currentRoute = hash;

      // Update document title
      document.title = route.title;

      // Show the correct page section, hide others
      TDRN.router._switchSection(route.sectionId);

      // Update aria-current on nav items
      TDRN.router._updateNavState(hash);

      // Announce to screen readers
      TDRN.accessibility.announceToScreenReader('Navigated to ' + route.title.replace(' — TDRN', ''));

      // Move focus to main content
      var main = document.getElementById('admin-main-content');
      if (main) {
        TDRN.accessibility.manageFocus(main);
      }

      // Persist last route
      TDRN.state.saveState('lastRoute', hash);
    },

    /** Show the target section, hide all other page sections */
    _switchSection: function (targetId) {
      var sections = document.querySelectorAll('[data-page-section]');
      sections.forEach(function (section) {
        if (section.id === targetId) {
          section.removeAttribute('hidden');
          section.setAttribute('aria-hidden', 'false');
        } else {
          section.setAttribute('hidden', '');
          section.setAttribute('aria-hidden', 'true');
        }
      });
    },

    /** Update aria-current="page" on sidebar/mobile nav items */
    _updateNavState: function (activeHash) {
      var navItems = document.querySelectorAll('[data-route]');
      navItems.forEach(function (item) {
        var itemRoute = item.getAttribute('data-route');
        if (itemRoute === activeHash) {
          item.setAttribute('aria-current', 'page');
          item.classList.add('active');
        } else {
          item.removeAttribute('aria-current');
          item.classList.remove('active');
        }
      });
    },

    /** Programmatically navigate to a route */
    navigate: function (hash) {
      window.location.hash = hash;
    },

    /** Get the current active route hash */
    current: function () {
      return TDRN.router._currentRoute;
    }
  };

  /* ========================================================================
     SECTION 2 — ACCESSIBILITY HELPERS
     ======================================================================== */

  TDRN.accessibility = {

    _focusStack: [],
    _announceTimeout: null,
    _trapHandler: null,

    /**
     * Announce a message to screen readers via aria-live region.
     * @param {string} message
     * @param {string} [politeness='polite'] — 'polite' or 'assertive'
     */
    announceToScreenReader: function (message, politeness) {
      var region = document.getElementById('tdrn-announce');
      if (!region) {
        region = document.createElement('div');
        region.id = 'tdrn-announce';
        region.setAttribute('aria-live', politeness || 'polite');
        region.setAttribute('aria-atomic', 'true');
        region.setAttribute('role', 'status');
        region.style.cssText = 'position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;';
        document.body.appendChild(region);
      }

      region.setAttribute('aria-live', politeness || 'polite');

      // Clear and re-inject to ensure re-announcement
      region.textContent = '';
      clearTimeout(TDRN.accessibility._announceTimeout);
      TDRN.accessibility._announceTimeout = setTimeout(function () {
        region.textContent = message;
      }, 50);
    },

    /**
     * Move focus to an element programmatically.
     * @param {HTMLElement} element
     */
    manageFocus: function (element) {
      if (!element) return;
      if (!element.hasAttribute('tabindex')) {
        element.setAttribute('tabindex', '-1');
      }
      element.focus({ preventScroll: false });
    },

    /**
     * Trap keyboard focus within a modal element.
     * @param {HTMLElement} modalElement
     */
    trapFocus: function (modalElement) {
      if (!modalElement) return;

      var focusableSelectors = [
        'a[href]',
        'button:not([disabled])',
        'input:not([disabled])',
        'select:not([disabled])',
        'textarea:not([disabled])',
        '[tabindex]:not([tabindex="-1"])',
        'details > summary'
      ].join(', ');

      var handler = function (e) {
        if (e.key !== 'Tab') return;

        var focusableEls = Array.from(modalElement.querySelectorAll(focusableSelectors))
          .filter(function (el) { return !el.closest('[hidden]') && el.offsetParent !== null; });

        if (focusableEls.length === 0) { e.preventDefault(); return; }

        var first = focusableEls[0];
        var last  = focusableEls[focusableEls.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      };

      // Remove previous trap if any
      TDRN.accessibility.releaseFocusTrap();

      document.addEventListener('keydown', handler);
      TDRN.accessibility._trapHandler = handler;

      // Focus first focusable element
      var els = Array.from(modalElement.querySelectorAll(focusableSelectors))
        .filter(function (el) { return !el.closest('[hidden]') && el.offsetParent !== null; });
      if (els.length > 0) els[0].focus();
    },

    /** Release the current focus trap */
    releaseFocusTrap: function () {
      if (TDRN.accessibility._trapHandler) {
        document.removeEventListener('keydown', TDRN.accessibility._trapHandler);
        TDRN.accessibility._trapHandler = null;
      }
    },

    /**
     * Push current focus element onto stack before opening modal.
     */
    pushFocus: function () {
      TDRN.accessibility._focusStack.push(document.activeElement);
    },

    /**
     * Restore focus to the element that triggered a modal/panel.
     */
    restoreFocus: function () {
      var el = TDRN.accessibility._focusStack.pop();
      if (el && typeof el.focus === 'function') {
        el.focus();
      }
    },

    /**
     * Activate skip links — scroll and focus on target on click.
     */
    initSkipLinks: function () {
      var skipLinks = document.querySelectorAll('.skip-link');
      skipLinks.forEach(function (link) {
        link.addEventListener('click', function (e) {
          e.preventDefault();
          var targetId = link.getAttribute('href').replace('#', '');
          var target = document.getElementById(targetId);
          if (target) {
            target.scrollIntoView();
            TDRN.accessibility.manageFocus(target);
          }
        });
      });
    }
  };

  /* ========================================================================
     SECTION 3 — FOCUS MODE (ADD/ADHD ACCESSIBILITY FEATURE)
     ======================================================================== */

  TDRN.focusMode = {

    /** Toggle focus mode on/off */
    toggle: function () {
      var isActive = document.body.classList.contains('focus-mode');

      if (isActive) {
        TDRN.focusMode.disable();
      } else {
        TDRN.focusMode.enable();
      }
    },

    /** Enable focus/reading mode */
    enable: function () {
      document.body.classList.add('focus-mode');
      TDRN.state.saveState('focusMode', true);
      TDRN.focusMode._updateToggleButton(true);
      TDRN.accessibility.announceToScreenReader('Focus mode enabled. Sidebar hidden, reading layout active.', 'assertive');
    },

    /** Disable focus/reading mode */
    disable: function () {
      document.body.classList.remove('focus-mode');
      TDRN.state.saveState('focusMode', false);
      TDRN.focusMode._updateToggleButton(false);
      TDRN.accessibility.announceToScreenReader('Focus mode disabled. Normal layout restored.', 'assertive');
    },

    /** Update toggle button aria-pressed and label */
    _updateToggleButton: function (isActive) {
      var toggleBtns = document.querySelectorAll('.focus-mode-toggle');
      toggleBtns.forEach(function (btn) {
        btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
        var labelEl = btn.querySelector('.focus-mode-label');
        if (labelEl) {
          labelEl.textContent = isActive ? 'Exit Focus Mode' : 'Focus Mode';
        }
      });
    },

    /** Restore saved focus mode preference on init */
    init: function () {
      var saved = TDRN.state.loadState('focusMode', false);
      if (saved === true) {
        TDRN.focusMode.enable();
      } else {
        TDRN.focusMode._updateToggleButton(false);
      }

      // Bind toggle buttons
      var toggleBtns = document.querySelectorAll('.focus-mode-toggle');
      toggleBtns.forEach(function (btn) {
        btn.addEventListener('click', TDRN.focusMode.toggle.bind(TDRN.focusMode));
      });
    }
  };

  /* ========================================================================
     SECTION 4 — SEARCH AND FILTER
     ======================================================================== */

  TDRN.search = {

    _debounceTimers: {},

    /**
     * Live search — filters visible elements as user types.
     * Debounced 200ms. Announces result count to screen reader.
     * @param {HTMLInputElement} inputEl
     * @param {HTMLElement} containerEl
     * @param {string} selector — CSS selector for filterable items
     */
    liveSearch: function (inputEl, containerEl, selector) {
      if (!inputEl || !containerEl) return;

      var key = inputEl.id || Math.random().toString(36);

      inputEl.addEventListener('input', function () {
        clearTimeout(TDRN.search._debounceTimers[key]);
        TDRN.search._debounceTimers[key] = setTimeout(function () {
          var query = inputEl.value.trim().toLowerCase();
          var items = containerEl.querySelectorAll(selector);
          var visibleCount = 0;

          items.forEach(function (item) {
            var text = item.textContent.toLowerCase();
            var match = query === '' || text.includes(query);
            item.style.display = match ? '' : 'none';
            if (match) visibleCount++;
          });

          // Announce count to screen reader
          var total = items.length;
          var msg = query === ''
            ? 'Showing all ' + total + ' results'
            : visibleCount + ' of ' + total + ' results match \"' + inputEl.value.trim() + '\"';
          TDRN.accessibility.announceToScreenReader(msg);

          // Show/hide empty state
          var emptyState = containerEl.querySelector('.empty-state');
          if (emptyState) {
            emptyState.style.display = visibleCount === 0 ? '' : 'none';
          }
        }, 200);
      });
    },

    /**
     * Filter container items by data-status attribute.
     * @param {HTMLElement} containerEl
     * @param {string} status — value to match, or 'all'
     */
    filterByStatus: function (containerEl, status) {
      if (!containerEl) return;
      var items = containerEl.querySelectorAll('[data-status]');
      var visibleCount = 0;

      items.forEach(function (item) {
        var match = status === 'all' || item.getAttribute('data-status') === status;
        item.style.display = match ? '' : 'none';
        if (match) visibleCount++;
      });

      TDRN.accessibility.announceToScreenReader(
        visibleCount + ' items with status: ' + (status === 'all' ? 'all statuses' : status)
      );
    },

    /**
     * Client-side table sorting.
     * @param {HTMLTableElement} tableEl
     * @param {number} columnIndex — zero-based
     * @param {string} direction — 'asc' or 'desc'
     */
    sortTable: function (tableEl, columnIndex, direction) {
      if (!tableEl) return;

      var tbody = tableEl.querySelector('tbody');
      if (!tbody) return;

      var rows = Array.from(tbody.querySelectorAll('tr'));

      rows.sort(function (a, b) {
        var aCell = a.querySelectorAll('td')[columnIndex];
        var bCell = b.querySelectorAll('td')[columnIndex];
        if (!aCell || !bCell) return 0;

        var aText = aCell.textContent.trim().toLowerCase();
        var bText = bCell.textContent.trim().toLowerCase();

        // Numeric sort if both parse as numbers
        var aNum = parseFloat(aText);
        var bNum = parseFloat(bText);
        if (!isNaN(aNum) && !isNaN(bNum)) {
          return direction === 'asc' ? aNum - bNum : bNum - aNum;
        }

        // String sort
        if (aText < bText) return direction === 'asc' ? -1 : 1;
        if (aText > bText) return direction === 'asc' ? 1 : -1;
        return 0;
      });

      // Re-append sorted rows
      rows.forEach(function (row) { tbody.appendChild(row); });

      // Update aria-sort on headers
      var headers = tableEl.querySelectorAll('thead th');
      headers.forEach(function (th, i) {
        if (i === columnIndex) {
          th.setAttribute('aria-sort', direction === 'asc' ? 'ascending' : 'descending');
        } else {
          th.removeAttribute('aria-sort');
        }
      });

      TDRN.accessibility.announceToScreenReader(
        'Table sorted by column ' + (columnIndex + 1) + ', ' + direction + 'ending'
      );
    },

    /**
     * Bind sortable table headers (th elements with data-sort-col attribute).
     * @param {HTMLTableElement} tableEl
     */
    initSortableTable: function (tableEl) {
      if (!tableEl) return;
      var headers = tableEl.querySelectorAll('thead th[data-sort-col]');
      headers.forEach(function (th) {
        th.style.cursor = 'pointer';
        th.setAttribute('role', 'button');
        th.setAttribute('tabindex', '0');
        th._sortDir = 'asc';

        function doSort() {
          var col = parseInt(th.getAttribute('data-sort-col'), 10);
          TDRN.search.sortTable(tableEl, col, th._sortDir);
          th._sortDir = th._sortDir === 'asc' ? 'desc' : 'asc';
        }

        th.addEventListener('click', doSort);
        th.addEventListener('keydown', function (e) {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); doSort(); }
        });
      });
    }
  };

  /* ========================================================================
     SECTION 5 — FORM VALIDATION
     ======================================================================== */

  TDRN.forms = {

    /** Validation rules applied per field type / data attributes */
    _rules: {
      required: function (val) {
        return val.trim().length > 0;
      },
      email: function (val) {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val.trim());
      },
      phone: function (val) {
        return /^[\d\s\-\+\(\)]{7,20}$/.test(val.trim());
      },
      minLength: function (val, len) {
        return val.trim().length >= parseInt(len, 10);
      },
      maxLength: function (val, len) {
        return val.trim().length <= parseInt(len, 10);
      },
      pattern: function (val, pat) {
        return new RegExp(pat).test(val.trim());
      }
    },

    /**
     * Validate all fields in a form.
     * @param {HTMLFormElement} formEl
     * @returns {boolean}
     */
    validateForm: function (formEl) {
      if (!formEl) return false;
      var inputs = formEl.querySelectorAll('input, select, textarea');
      var valid = true;

      inputs.forEach(function (input) {
        if (!TDRN.forms.validateField(input)) {
          valid = false;
        }
      });

      if (!valid) {
        // Focus first invalid field
        var firstError = formEl.querySelector('.form-input.error, .form-select.error, .form-textarea.error');
        if (firstError) firstError.focus();
        TDRN.accessibility.announceToScreenReader('Form has errors. Please review the highlighted fields.', 'assertive');
      }

      return valid;
    },

    /**
     * Validate a single input field.
     * @param {HTMLInputElement|HTMLSelectElement|HTMLTextAreaElement} inputEl
     * @returns {boolean}
     */
    validateField: function (inputEl) {
      if (!inputEl) return true;

      // Skip hidden/disabled fields
      if (inputEl.disabled || inputEl.type === 'hidden') return true;

      var val = inputEl.value || '';
      var rules = TDRN.forms._rules;

      // Required
      if (inputEl.hasAttribute('required') || inputEl.dataset.required === 'true') {
        if (!rules.required(val)) {
          TDRN.forms.showFieldError(inputEl, inputEl.dataset.errorRequired || 'This field is required.');
          return false;
        }
      }

      // Skip further checks if empty and not required
      if (val.trim() === '') {
        TDRN.forms.clearFieldError(inputEl);
        return true;
      }

      // Email
      if (inputEl.type === 'email' || inputEl.dataset.validate === 'email') {
        if (!rules.email(val)) {
          TDRN.forms.showFieldError(inputEl, inputEl.dataset.errorEmail || 'Please enter a valid email address.');
          return false;
        }
      }

      // Phone
      if (inputEl.type === 'tel' || inputEl.dataset.validate === 'phone') {
        if (!rules.phone(val)) {
          TDRN.forms.showFieldError(inputEl, inputEl.dataset.errorPhone || 'Please enter a valid phone number.');
          return false;
        }
      }

      // Min length
      if (inputEl.dataset.minLength) {
        if (!rules.minLength(val, inputEl.dataset.minLength)) {
          TDRN.forms.showFieldError(inputEl, inputEl.dataset.errorMinlength ||
            'Minimum ' + inputEl.dataset.minLength + ' characters required.');
          return false;
        }
      }

      // Max length
      if (inputEl.dataset.maxLength) {
        if (!rules.maxLength(val, inputEl.dataset.maxLength)) {
          TDRN.forms.showFieldError(inputEl, inputEl.dataset.errorMaxlength ||
            'Maximum ' + inputEl.dataset.maxLength + ' characters allowed.');
          return false;
        }
      }

      // Pattern
      if (inputEl.dataset.pattern) {
        if (!rules.pattern(val, inputEl.dataset.pattern)) {
          TDRN.forms.showFieldError(inputEl, inputEl.dataset.errorPattern || 'Please match the required format.');
          return false;
        }
      }

      TDRN.forms.clearFieldError(inputEl);
      return true;
    },

    /**
     * Display an accessible error message for a field.
     * @param {HTMLInputElement} inputEl
     * @param {string} message
     */
    showFieldError: function (inputEl, message) {
      if (!inputEl) return;
      inputEl.classList.add('error');
      inputEl.setAttribute('aria-invalid', 'true');

      var errorId = (inputEl.id || inputEl.name || 'field') + '-error';
      inputEl.setAttribute('aria-describedby', errorId);

      // Find or create error element
      var errorEl = document.getElementById(errorId);
      if (!errorEl) {
        errorEl = document.createElement('div');
        errorEl.id = errorId;
        errorEl.className = 'form-error';
        errorEl.setAttribute('role', 'alert');
        var parent = inputEl.closest('.form-group');
        if (parent) {
          parent.appendChild(errorEl);
        } else {
          inputEl.insertAdjacentElement('afterend', errorEl);
        }
      }

      errorEl.textContent = message;
      errorEl.style.display = 'flex';
    },

    /**
     * Clear error state from a field.
     * @param {HTMLInputElement} inputEl
     */
    clearFieldError: function (inputEl) {
      if (!inputEl) return;
      inputEl.classList.remove('error');
      inputEl.removeAttribute('aria-invalid');
      inputEl.removeAttribute('aria-describedby');

      var errorId = (inputEl.id || inputEl.name || 'field') + '-error';
      var errorEl = document.getElementById(errorId);
      if (errorEl) {
        errorEl.style.display = 'none';
        errorEl.textContent = '';
      }
    },

    /**
     * Bind real-time validation (blur) to all form fields.
     * @param {HTMLFormElement} formEl
     */
    initLiveValidation: function (formEl) {
      if (!formEl) return;
      var inputs = formEl.querySelectorAll('input, select, textarea');
      inputs.forEach(function (input) {
        input.addEventListener('blur', function () {
          TDRN.forms.validateField(input);
        });
        input.addEventListener('input', function () {
          if (input.classList.contains('error')) {
            TDRN.forms.validateField(input);
          }
        });
      });

      formEl.addEventListener('submit', function (e) {
        e.preventDefault();
        TDRN.forms.validateForm(formEl);
      });
    }
  };

  /* ========================================================================
     SECTION 6 — LOCAL STORAGE STATE
     ======================================================================== */

  TDRN.state = {

    _prefix: 'tdrn_',

    /**
     * Save a value to localStorage.
     * @param {string} key
     * @param {*} value
     */
    saveState: function (key, value) {
      try {
        localStorage.setItem(TDRN.state._prefix + key, JSON.stringify(value));
      } catch (e) {
        // localStorage unavailable (private browsing, storage full)
        console.warn('TDRN: Could not save state for key:', key, e);
      }
    },

    /**
     * Load a value from localStorage.
     * @param {string} key
     * @param {*} defaultValue — returned if key not found or parse fails
     * @returns {*}
     */
    loadState: function (key, defaultValue) {
      try {
        var raw = localStorage.getItem(TDRN.state._prefix + key);
        if (raw === null) return defaultValue;
        return JSON.parse(raw);
      } catch (e) {
        return defaultValue;
      }
    },

    /**
     * Remove a key from localStorage.
     * @param {string} key
     */
    removeState: function (key) {
      try {
        localStorage.removeItem(TDRN.state._prefix + key);
      } catch (e) { /* silent */ }
    },

    /** Clear all TDRN-prefixed state keys */
    clearAll: function () {
      try {
        Object.keys(localStorage).forEach(function (key) {
          if (key.startsWith(TDRN.state._prefix)) {
            localStorage.removeItem(key);
          }
        });
      } catch (e) { /* silent */ }
    }
  };

  /* ========================================================================
     SECTION 7 — DATA MANAGEMENT (MOCK DATA LAYER)
     ======================================================================== */

  TDRN.data = {

    /** 15 sample members */
    members: [
      { id: 'M001', name: 'Marcus Reyes',      role: 'Team Leader',        status: 'operational', phone: '(512) 555-0101', email: 'mreyes@tdrn.org',    certifications: ['ICS-100','ICS-200','CERT'],   county: 'Travis',    joined: '2021-03-15' },
      { id: 'M002', name: 'Denise Okafor',     role: 'Medical Officer',    status: 'operational', phone: '(512) 555-0102', email: 'dokafor@tdrn.org',   certifications: ['EMT-B','ICS-100','CPR'],      county: 'Travis',    joined: '2020-07-22' },
      { id: 'M003', name: 'James Whitfield',   role: 'Logistics Coord.',   status: 'standby',     phone: '(210) 555-0103', email: 'jwhitfield@tdrn.org',certifications: ['ICS-100','FEMA-IS-700'],       county: 'Bexar',     joined: '2022-01-10' },
      { id: 'M004', name: 'Aisha Mohammed',    role: 'Communications',     status: 'operational', phone: '(210) 555-0104', email: 'amohammed@tdrn.org', certifications: ['HAM-Tech','ICS-100','NIMS'],   county: 'Bexar',     joined: '2021-09-05' },
      { id: 'M005', name: 'Travis Buchanan',   role: 'SAR Specialist',     status: 'training',    phone: '(713) 555-0105', email: 'tbuchanan@tdrn.org', certifications: ['USAR','Rope-Rescue'],          county: 'Harris',    joined: '2023-02-14' },
      { id: 'M006', name: 'Priya Nair',        role: 'Shelter Manager',    status: 'operational', phone: '(713) 555-0106', email: 'pnair@tdrn.org',     certifications: ['Red-Cross','ICS-100'],        county: 'Harris',    joined: '2020-11-30' },
      { id: 'M007', name: 'Derek Fontaine',    role: 'Heavy Equipment',    status: 'inactive',    phone: '(214) 555-0107', email: 'dfontaine@tdrn.org', certifications: ['CDL-A','ICS-100'],            county: 'Dallas',    joined: '2019-06-18' },
      { id: 'M008', name: 'Yolanda Cruz',      role: 'Team Leader',        status: 'operational', phone: '(214) 555-0108', email: 'ycruz@tdrn.org',     certifications: ['ICS-200','ICS-300','CERT'],   county: 'Dallas',    joined: '2020-04-27' },
      { id: 'M009', name: 'Nathan Park',       role: 'IT / Comms',         status: 'operational', phone: '(817) 555-0109', email: 'npark@tdrn.org',     certifications: ['CompTIA','HAM-Tech'],         county: 'Tarrant',   joined: '2022-08-01' },
      { id: 'M010', name: 'Latasha Williams',  role: 'Medical Officer',    status: 'standby',     phone: '(817) 555-0110', email: 'lwilliams@tdrn.org', certifications: ['RN','ACLS','ICS-100'],        county: 'Tarrant',   joined: '2021-12-09' },
      { id: 'M011', name: 'Roberto Salinas',   role: 'Logistics Coord.',   status: 'operational', phone: '(361) 555-0111', email: 'rsalinas@tdrn.org',  certifications: ['ICS-100','FEMA-IS-700'],       county: 'Nueces',    joined: '2023-05-20' },
      { id: 'M012', name: 'Karen Johansson',   role: 'Public Information', status: 'training',    phone: '(361) 555-0112', email: 'kjohansson@tdrn.org',certifications: ['NIMS','PIO-Basic'],            county: 'Nueces',    joined: '2023-07-11' },
      { id: 'M013', name: 'Elijah Thompson',   role: 'SAR Specialist',     status: 'critical',    phone: '(915) 555-0113', email: 'ethompson@tdrn.org', certifications: ['USAR','Swift-Water'],          county: 'El Paso',   joined: '2020-02-03' },
      { id: 'M014', name: 'Monique Deveraux',  role: 'Shelter Manager',    status: 'operational', phone: '(915) 555-0114', email: 'mdeveraux@tdrn.org', certifications: ['Red-Cross','ICS-200'],        county: 'El Paso',   joined: '2021-07-16' },
      { id: 'M015', name: 'Carlos Mendez',     role: 'Team Leader',        status: 'operational', phone: '(806) 555-0115', email: 'cmendez@tdrn.org',   certifications: ['ICS-200','ICS-300','CERT'],   county: 'Lubbock',   joined: '2019-11-25' },
    ],

    /** 5 sample teams */
    teams: [
      { id: 'T01', name: 'Alpha Response',  county: 'Travis',  leader: 'Marcus Reyes',   members: 12, status: 'operational', specialty: 'Urban Search & Rescue' },
      { id: 'T02', name: 'Bravo Medical',   county: 'Harris',  leader: 'Priya Nair',     members: 8,  status: 'operational', specialty: 'Medical Support' },
      { id: 'T03', name: 'Delta Comms',     county: 'Dallas',  leader: 'Yolanda Cruz',   members: 6,  status: 'standby',     specialty: 'Communications & IT' },
      { id: 'T04', name: 'Echo Logistics',  county: 'Bexar',   leader: 'James Whitfield', members: 10, status: 'training',    specialty: 'Supply Chain & Logistics' },
      { id: 'T05', name: 'Sierra Rescue',   county: 'El Paso', leader: 'Elijah Thompson', members: 7,  status: 'standby',     specialty: 'Wilderness SAR' },
    ],

    /** 10 sample equipment items */
    equipment: [
      { id: 'EQ001', name: 'Mobile Command Unit',    type: 'Vehicle',    status: 'operational', county: 'Travis',  lastMaint: '2026-03-01', nextMaint: '2026-09-01', quantity: 1 },
      { id: 'EQ002', name: 'Generator — 20kW',       type: 'Power',      status: 'operational', county: 'Travis',  lastMaint: '2026-02-15', nextMaint: '2026-08-15', quantity: 3 },
      { id: 'EQ003', name: 'Water Rescue Boat',      type: 'Watercraft', status: 'standby',     county: 'Harris',  lastMaint: '2025-12-01', nextMaint: '2026-06-01', quantity: 2 },
      { id: 'EQ004', name: 'Defibrillator (AED)',    type: 'Medical',    status: 'operational', county: 'Harris',  lastMaint: '2026-04-01', nextMaint: '2026-10-01', quantity: 8 },
      { id: 'EQ005', name: 'HAM Radio Station',      type: 'Comms',      status: 'operational', county: 'Dallas',  lastMaint: '2026-01-10', nextMaint: '2026-07-10', quantity: 4 },
      { id: 'EQ006', name: 'Rope Rescue Kit',        type: 'Rescue',     status: 'operational', county: 'El Paso', lastMaint: '2026-03-20', nextMaint: '2026-09-20', quantity: 5 },
      { id: 'EQ007', name: '4x4 Response Truck',     type: 'Vehicle',    status: 'maintenance', county: 'Bexar',   lastMaint: '2026-04-28', nextMaint: '2026-05-10', quantity: 1 },
      { id: 'EQ008', name: 'Portable Water Filter',  type: 'Sanitation', status: 'operational', county: 'Nueces',  lastMaint: '2026-02-01', nextMaint: '2026-08-01', quantity: 10 },
      { id: 'EQ009', name: 'Thermal Imaging Camera', type: 'Detection',  status: 'standby',     county: 'Tarrant', lastMaint: '2025-11-15', nextMaint: '2026-05-15', quantity: 2 },
      { id: 'EQ010', name: 'Mass Casualty Trailer',  type: 'Medical',    status: 'operational', county: 'Travis',  lastMaint: '2026-03-10', nextMaint: '2026-09-10', quantity: 1 },
    ],

    /** 5 upcoming events */
    events: [
      { id: 'EV01', name: 'ICS-100 Certification Training', date: '2026-05-10', time: '09:00 CST', location: 'Austin EOC',         county: 'Travis',  type: 'Training',   capacity: 30, registered: 18 },
      { id: 'EV02', name: 'Regional Exercise — Flood Sim',  date: '2026-05-17', time: '07:00 CST', location: 'Brazos River Park',  county: 'Harris',  type: 'Exercise',   capacity: 50, registered: 42 },
      { id: 'EV03', name: 'Equipment Inspection Day',       date: '2026-05-24', time: '10:00 CST', location: 'Dallas Supply Hub',  county: 'Dallas',  type: 'Maintenance',capacity: 20, registered: 20 },
      { id: 'EV04', name: 'CERT Basic Training — Cohort 7', date: '2026-06-07', time: '08:00 CST', location: 'San Antonio CC',    county: 'Bexar',   type: 'Training',   capacity: 25, registered: 11 },
      { id: 'EV05', name: 'State Leadership Summit',        date: '2026-06-21', time: '09:00 CST', location: 'TDRN HQ — Austin',  county: 'Statewide',type: 'Summit',    capacity: 100,registered: 67 },
    ],

    /** 3 active alerts */
    alerts: [
      { id: 'AL01', type: 'critical', icon: '⚠', title: 'Flash Flood Watch',        message: 'Flash flood watch in effect for Travis and Williamson counties through 8 PM CST.', time: '2026-05-02T06:00:00' },
      { id: 'AL02', type: 'warning',  icon: '⏱', title: 'Equipment Cert Expiring',  message: 'Rope Rescue Kit EQ006 certification expires in 14 days. Schedule renewal immediately.', time: '2026-05-01T12:00:00' },
      { id: 'AL03', type: 'info',     icon: 'ℹ', title: 'New Member Pending',       message: '3 new member applications are awaiting review and approval by a Team Leader.', time: '2026-04-30T09:30:00' },
    ]
  };

  /* --- Render Methods ---------------------------------------------------- */

  TDRN.render = {

    /** Status badge HTML helper */
    _statusBadge: function (status) {
      var map = {
        operational: { cls: 'badge-operational', icon: '✓',   label: 'Operational' },
        standby:     { cls: 'badge-standby',     icon: '⏱',   label: 'Standby' },
        inactive:    { cls: 'badge-inactive',    icon: '–',   label: 'Inactive' },
        critical:    { cls: 'badge-critical',    icon: '⚠',   label: 'Critical' },
        training:    { cls: 'badge-training',    icon: '📖',  label: 'Training' },
        maintenance: { cls: 'badge-standby',     icon: '🔧',  label: 'Maintenance' },
      };
      var s = map[status] || map.inactive;
      return '<span class="badge ' + s.cls + '" aria-label="Status: ' + s.label + '">' +
             '<span class="badge-icon" aria-hidden="true">' + s.icon + '</span>' + s.label + '</span>';
    },

    /**
     * Render member cards into a container.
     * @param {HTMLElement} containerEl
     * @param {Array} [data] — defaults to TDRN.data.members
     */
    members: function (containerEl, data) {
      if (!containerEl) return;
      var members = data || TDRN.data.members;

      containerEl.innerHTML = members.map(function (m) {
        var initials = m.name.split(' ').map(function (n) { return n[0]; }).join('');
        var certs = m.certifications.map(function (c) {
          return '<span class="badge badge-cert">' + c + '</span>';
        }).join('');

        return [
          '<article class="member-card" data-status="' + m.status + '" data-member-id="' + m.id + '" aria-label="Member: ' + m.name + '">',
          '  <div class="member-card-header">',
          '    <div class="member-avatar" aria-hidden="true">' + initials + '</div>',
          '    <div class="member-info">',
          '      <div class="member-name">' + m.name + '</div>',
          '      <div class="member-role">' + m.role + ' — ' + m.county + ' County</div>',
          '    </div>',
          '    ' + TDRN.render._statusBadge(m.status),
          '  </div>',
          '  <div class="member-contact">',
          '    <span><a href="tel:' + m.phone + '">' + m.phone + '</a></span>',
          '    <span><a href="mailto:' + m.email + '">' + m.email + '</a></span>',
          '  </div>',
          '  <div class="member-certs">' + certs + '</div>',
          '  <div class="member-card-actions">',
          '    <button class="btn btn-sm btn-secondary" aria-label="View profile for ' + m.name + '">View Profile</button>',
          '    <button class="btn btn-sm btn-ghost" aria-label="Edit record for ' + m.name + '">Edit</button>',
          '  </div>',
          '</article>'
        ].join('\n');
      }).join('\n');
    },

    /**
     * Render equipment cards into a container.
     * @param {HTMLElement} containerEl
     * @param {Array} [data]
     */
    equipment: function (containerEl, data) {
      if (!containerEl) return;
      var items = data || TDRN.data.equipment;

      containerEl.innerHTML = items.map(function (eq) {
        return [
          '<article class="equipment-card" data-status="' + eq.status + '" data-equip-id="' + eq.id + '" aria-label="Equipment: ' + eq.name + '">',
          '  <div class="equipment-card-header">',
          '    <div>',
          '      <div class="equipment-name">' + eq.name + '</div>',
          '      <div class="equipment-id font-mono text-muted">' + eq.id + '</div>',
          '    </div>',
          '    ' + TDRN.render._statusBadge(eq.status),
          '  </div>',
          '  <div class="equipment-details">',
          '    <div><div class="equipment-detail-label">Type</div><div class="equipment-detail-value">' + eq.type + '</div></div>',
          '    <div><div class="equipment-detail-label">County</div><div class="equipment-detail-value">' + eq.county + '</div></div>',
          '    <div><div class="equipment-detail-label">Qty</div><div class="equipment-detail-value">' + eq.quantity + '</div></div>',
          '    <div><div class="equipment-detail-label">Next Maint.</div><div class="equipment-detail-value">' + eq.nextMaint + '</div></div>',
          '  </div>',
          '  <div class="member-card-actions">',
          '    <button class="btn btn-sm btn-secondary" aria-label="View details for ' + eq.name + '">Details</button>',
          '    <button class="btn btn-sm btn-ghost" aria-label="Log maintenance for ' + eq.name + '">Log Maint.</button>',
          '  </div>',
          '</article>'
        ].join('\n');
      }).join('\n');
    },

    /**
     * Render event cards into a container.
     * @param {HTMLElement} containerEl
     * @param {Array} [data]
     */
    events: function (containerEl, data) {
      if (!containerEl) return;
      var items = data || TDRN.data.events;

      containerEl.innerHTML = items.map(function (ev) {
        var d = new Date(ev.date + 'T12:00:00');
        var day   = d.getDate();
        var month = d.toLocaleString('en-US', { month: 'short' }).toUpperCase();
        var pct   = Math.round((ev.registered / ev.capacity) * 100);
        var isFull = ev.registered >= ev.capacity;

        return [
          '<article class="event-card" data-event-id="' + ev.id + '" aria-label="Event: ' + ev.name + '">',
          '  <div class="flex gap-4 items-center">',
          '    <div class="event-card-date" aria-hidden="true">',
          '      <div class="event-date-day">' + day + '</div>',
          '      <div class="event-date-month">' + month + '</div>',
          '    </div>',
          '    <div class="event-card-body">',
          '      <div class="event-name">' + ev.name + '</div>',
          '      <div class="event-meta">',
          '        <span>' + ev.time + '</span>',
          '        <span>' + ev.location + '</span>',
          '        <span>' + ev.county + '</span>',
          '        <span class="badge badge-role">' + ev.type + '</span>',
          '      </div>',
          '    </div>',
          '  </div>',
          '  <div class="progress-bar mt-2" aria-label="Registration: ' + ev.registered + ' of ' + ev.capacity + '">',
          '    <div class="progress-bar-header">',
          '      <span class="progress-bar-label">Registration</span>',
          '      <span class="progress-bar-value">' + ev.registered + ' / ' + ev.capacity + ' (' + pct + '%)</span>',
          '    </div>',
          '    <div class="progress-track">',
          '      <div class="progress-fill ' + (isFull ? 'green' : '') + '" style="width:' + pct + '%" role="progressbar" aria-valuenow="' + ev.registered + '" aria-valuemin="0" aria-valuemax="' + ev.capacity + '"></div>',
          '    </div>',
          '  </div>',
          '  <div class="member-card-actions">',
          '    <button class="btn btn-sm btn-secondary" aria-label="View details for ' + ev.name + '">View Details</button>',
          (isFull ? '    <button class="btn btn-sm btn-ghost" disabled aria-disabled="true">Full</button>' :
                    '    <button class="btn btn-sm btn-primary" aria-label="Register for ' + ev.name + '">Register</button>'),
          '  </div>',
          '</article>'
        ].join('\n');
      }).join('\n');
    },

    /**
     * Render alert strips at top of a container.
     * @param {HTMLElement} containerEl
     * @param {Array} [data]
     */
    alerts: function (containerEl, data) {
      if (!containerEl) return;
      var items = data || TDRN.data.alerts;

      var typeMap = { critical: 'critical', warning: 'warning', info: 'info' };

      containerEl.innerHTML = items.map(function (al) {
        var cls = typeMap[al.type] || 'info';
        return [
          '<div class="alert-strip ' + cls + '" role="alert" data-alert-id="' + al.id + '">',
          '  <div class="alert-strip-text">',
          '    <span aria-hidden="true">' + al.icon + '</span>',
          '    <strong>' + al.title + ':</strong>&nbsp;' + al.message,
          '  </div>',
          '  <button class="btn btn-sm btn-ghost" aria-label="Dismiss alert: ' + al.title + '" onclick="TDRN.render._dismissAlert(this)">✕</button>',
          '</div>'
        ].join('\n');
      }).join('\n');
    },

    /** Dismiss an alert strip */
    _dismissAlert: function (btn) {
      var strip = btn.closest('.alert-strip');
      if (strip) {
        strip.style.maxHeight = strip.offsetHeight + 'px';
        requestAnimationFrame(function () {
          strip.style.transition = 'max-height 0.3s ease, opacity 0.3s ease';
          strip.style.maxHeight = '0';
          strip.style.opacity = '0';
          strip.style.overflow = 'hidden';
          setTimeout(function () { strip.remove(); }, 320);
        });
      }
    }
  };

  /* ========================================================================
     SECTION 8 — REAL-TIME CLOCK
     ======================================================================== */

  TDRN.clock = {

    _interval: null,

    /** Format: 'May 2, 2026 — 01:10 CST' */
    _format: function (date) {
      var months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
      var month = months[date.getMonth()];
      var day   = date.getDate();
      var year  = date.getFullYear();

      var hrs   = String(date.getHours()).padStart(2, '0');
      var mins  = String(date.getMinutes()).padStart(2, '0');
      var secs  = String(date.getSeconds()).padStart(2, '0');

      // Determine timezone abbreviation
      var tzStr = date.toLocaleTimeString('en-US', { timeZoneName: 'short' });
      var tzMatch = tzStr.match(/[A-Z]{2,5}$/);
      var tz = tzMatch ? tzMatch[0] : 'LT';

      return month + ' ' + day + ', ' + year + ' \u2014 ' + hrs + ':' + mins + ':' + secs + ' ' + tz;
    },

    /** Update the #tdrn-clock element */
    update: function () {
      var el = document.getElementById('tdrn-clock');
      if (el) {
        el.textContent = TDRN.clock._format(new Date());
      }
    },

    /** Start the clock interval */
    start: function () {
      TDRN.clock.update(); // immediate first render
      TDRN.clock._interval = setInterval(TDRN.clock.update, 1000);
    },

    /** Stop the clock interval */
    stop: function () {
      if (TDRN.clock._interval) {
        clearInterval(TDRN.clock._interval);
        TDRN.clock._interval = null;
      }
    }
  };

  /* ========================================================================
     SECTION 9 — NOTIFICATION / TOAST SYSTEM
     ======================================================================== */

  TDRN.toast = {

    _container: null,
    _defaults: { duration: 5000 },

    _icons: {
      success: '✓',
      info:    'ℹ',
      warning: '⚠',
      error:   '✕'
    },

    /** Ensure toast container exists in DOM */
    _getContainer: function () {
      if (!TDRN.toast._container || !document.body.contains(TDRN.toast._container)) {
        var c = document.getElementById('toast-container');
        if (!c) {
          c = document.createElement('div');
          c.id = 'toast-container';
          c.setAttribute('aria-live', 'polite');
          c.setAttribute('aria-atomic', 'false');
          c.setAttribute('aria-label', 'Notifications');
          document.body.appendChild(c);
        }
        TDRN.toast._container = c;
      }
      return TDRN.toast._container;
    },

    /**
     * Show a toast notification.
     * @param {string} message
     * @param {string} [type='info'] — 'success'|'info'|'warning'|'error'
     * @param {number} [duration=5000] — ms, 0 for persistent
     * @returns {HTMLElement} the toast element
     */
    show: function (message, type, duration) {
      type     = type     || 'info';
      duration = (duration !== undefined) ? duration : TDRN.toast._defaults.duration;

      var container = TDRN.toast._getContainer();
      var icon = TDRN.toast._icons[type] || 'ℹ';

      var toast = document.createElement('div');
      toast.className = 'toast ' + type;
      toast.setAttribute('role', 'status');
      toast.setAttribute('aria-live', 'polite');
      toast.innerHTML = [
        '<span class="toast-icon" aria-hidden="true">' + icon + '</span>',
        '<div class="toast-body">',
        '  <div class="toast-message">' + message + '</div>',
        '</div>',
        '<button class="toast-dismiss" aria-label="Dismiss notification" onclick="TDRN.toast._dismiss(this.closest(\'[role=status]\'))">✕</button>'
      ].join('');

      container.appendChild(toast);

      // Announce to screen reader
      TDRN.accessibility.announceToScreenReader(type.toUpperCase() + ': ' + message);

      // Auto-dismiss
      if (duration > 0) {
        setTimeout(function () {
          TDRN.toast._dismiss(toast);
        }, duration);
      }

      return toast;
    },

    /** Animate out and remove a toast element */
    _dismiss: function (toastEl) {
      if (!toastEl || !document.body.contains(toastEl)) return;
      toastEl.classList.add('dismissing');
      setTimeout(function () {
        if (toastEl.parentNode) toastEl.parentNode.removeChild(toastEl);
      }, 320);
    },

    // Convenience aliases
    success: function (msg, dur) { return TDRN.toast.show(msg, 'success', dur); },
    info:    function (msg, dur) { return TDRN.toast.show(msg, 'info',    dur); },
    warning: function (msg, dur) { return TDRN.toast.show(msg, 'warning', dur); },
    error:   function (msg, dur) { return TDRN.toast.show(msg, 'error',   dur); }
  };

  // Legacy alias
  TDRN.showToast = function (message, type, duration) {
    return TDRN.toast.show(message, type, duration);
  };

  /* ========================================================================
     SECTION 10 — MODAL SYSTEM
     ======================================================================== */

  TDRN.modal = {

    _activeModal: null,
    _keyHandler:  null,
    _backdropHandler: null,

    /**
     * Open a modal by ID.
     * @param {string} modalId
     */
    open: function (modalId) {
      var modal = document.getElementById(modalId);
      if (!modal) {
        console.warn('TDRN.modal.open: modal not found:', modalId);
        return;
      }

      // Save focus for restoration
      TDRN.accessibility.pushFocus();

      // Show backdrop if needed, or create one
      var backdrop = document.getElementById('tdrn-modal-backdrop');
      if (!backdrop) {
        backdrop = document.createElement('div');
        backdrop.id = 'tdrn-modal-backdrop';
        backdrop.className = 'modal-backdrop';
        backdrop.setAttribute('aria-hidden', 'true');
        document.body.appendChild(backdrop);
      }
      backdrop.style.display = 'flex';
      backdrop.appendChild(modal);

      // Configure modal ARIA
      modal.setAttribute('role', 'dialog');
      modal.setAttribute('aria-modal', 'true');
      modal.removeAttribute('hidden');

      TDRN.modal._activeModal = modal;

      // Body scroll lock
      document.body.style.overflow = 'hidden';

      // Trap focus inside modal
      TDRN.accessibility.trapFocus(modal);

      // Keyboard dismiss
      TDRN.modal._keyHandler = function (e) {
        if (e.key === 'Escape') {
          e.preventDefault();
          TDRN.modal.close(modalId);
        }
      };
      document.addEventListener('keydown', TDRN.modal._keyHandler);

      // Backdrop click dismiss
      TDRN.modal._backdropHandler = function (e) {
        if (e.target === backdrop) {
          TDRN.modal.close(modalId);
        }
      };
      backdrop.addEventListener('click', TDRN.modal._backdropHandler);

      TDRN.accessibility.announceToScreenReader('Dialog opened: ' + (modal.getAttribute('aria-label') || modalId), 'assertive');
    },

    /**
     * Close a modal by ID.
     * @param {string} modalId
     */
    close: function (modalId) {
      var modal = document.getElementById(modalId);
      if (!modal) return;

      // Move modal back to original position if needed
      var backdrop = document.getElementById('tdrn-modal-backdrop');
      if (backdrop) {
        backdrop.style.display = 'none';
      }

      modal.setAttribute('hidden', '');
      modal.removeAttribute('aria-modal');

      // Restore scroll
      document.body.style.overflow = '';

      // Release focus trap
      TDRN.accessibility.releaseFocusTrap();

      // Remove event listeners
      if (TDRN.modal._keyHandler) {
        document.removeEventListener('keydown', TDRN.modal._keyHandler);
        TDRN.modal._keyHandler = null;
      }
      if (backdrop && TDRN.modal._backdropHandler) {
        backdrop.removeEventListener('click', TDRN.modal._backdropHandler);
        TDRN.modal._backdropHandler = null;
      }

      TDRN.modal._activeModal = null;

      // Restore focus
      TDRN.accessibility.restoreFocus();

      TDRN.accessibility.announceToScreenReader('Dialog closed.', 'polite');
    },

    /** Check if any modal is currently open */
    isOpen: function () {
      return TDRN.modal._activeModal !== null;
    }
  };

  // Convenience globals (for inline HTML onclick attributes)
  TDRN.openModal  = function (id) { TDRN.modal.open(id); };
  TDRN.closeModal = function (id) { TDRN.modal.close(id); };

  /* ========================================================================
     SECTION 11 — PRINT HELPER & CSV EXPORT
     ======================================================================== */

  TDRN.print = {

    /**
     * Print a specific section of the page.
     * @param {string} sectionId
     */
    section: function (sectionId) {
      var section = document.getElementById(sectionId);
      if (!section) {
        TDRN.toast.warning('Section not found: ' + sectionId);
        return;
      }

      var printWindow = window.open('', '_blank', 'width=900,height=700');
      if (!printWindow) {
        TDRN.toast.error('Pop-up blocked. Please allow pop-ups and try again.');
        return;
      }

      // Pull in the core stylesheet
      var styles = Array.from(document.querySelectorAll('link[rel="stylesheet"], style'))
        .map(function (el) { return el.outerHTML; }).join('\n');

      printWindow.document.write([
        '<!DOCTYPE html><html lang="en">',
        '<head><meta charset="UTF-8"><title>TDRN Print — ' + document.title + '</title>',
        styles,
        '</head>',
        '<body class="print-mode">',
        section.outerHTML,
        '<script>window.onload=function(){window.print();window.close();}<\/script>',
        '</body></html>'
      ].join(''));
      printWindow.document.close();
    },

    /**
     * Export data array to a downloadable CSV file.
     * @param {Array<Object>} data — array of flat objects
     * @param {string} [filename='tdrn-export.csv']
     */
    exportToCSV: function (data, filename) {
      if (!data || data.length === 0) {
        TDRN.toast.warning('No data to export.');
        return;
      }

      filename = filename || 'tdrn-export.csv';

      var headers = Object.keys(data[0]);

      var csvRows = [
        headers.map(function (h) { return '"' + h + '"'; }).join(',')
      ];

      data.forEach(function (row) {
        var vals = headers.map(function (h) {
          var val = row[h] !== undefined && row[h] !== null ? String(row[h]) : '';
          // Escape quotes and wrap in double-quotes
          return '"' + val.replace(/"/g, '""') + '"';
        });
        csvRows.push(vals.join(','));
      });

      var csvContent = csvRows.join('\n');
      var blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      var url  = URL.createObjectURL(blob);

      var link = document.createElement('a');
      link.href = url;
      link.download = filename;
      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();

      setTimeout(function () {
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      }, 500);

      TDRN.toast.success('Exported ' + data.length + ' records to ' + filename);
      TDRN.accessibility.announceToScreenReader('CSV export complete: ' + filename);
    }
  };

  // Legacy aliases
  TDRN.printSection = function (id)       { TDRN.print.section(id); };
  TDRN.exportToCSV  = function (data, fn) { TDRN.print.exportToCSV(data, fn); };

  /* ========================================================================
     SECTION 12 — KEYBOARD SHORTCUTS
     ======================================================================== */

  TDRN.keyboard = {

    _enabled: true,

    _shortcuts: [
      { key: '/',      ctrl: false, description: 'Focus global search' },
      { key: 'Escape', ctrl: false, description: 'Close modal / clear search' },
      { key: 'f',      ctrl: false, description: 'Toggle Focus Mode (ADD/ADHD)' },
      { key: 'F',      ctrl: false, description: 'Toggle Focus Mode (ADD/ADHD)' },
      { key: 'p',      ctrl: true,  description: 'Print current view' },
      { key: '?',      ctrl: false, description: 'Show keyboard shortcuts' },
    ],

    /** Initialize global keyboard shortcut listener */
    init: function () {
      document.addEventListener('keydown', TDRN.keyboard._handler);
    },

    /** Main keydown handler */
    _handler: function (e) {
      if (!TDRN.keyboard._enabled) return;

      // Skip if user is typing in a form field
      var tag = document.activeElement ? document.activeElement.tagName : '';
      var isTyping = ['INPUT', 'TEXTAREA', 'SELECT'].indexOf(tag) > -1;
      var isContentEditable = document.activeElement && document.activeElement.isContentEditable;

      // '/' — focus search (allow even when typing to intercept)
      if (e.key === '/' && !e.ctrlKey && !e.metaKey && !isTyping && !isContentEditable) {
        e.preventDefault();
        var searchInput = document.querySelector('.topbar-search input, #topbar-search, [data-role="search"]');
        if (searchInput) {
          searchInput.focus();
          searchInput.select();
          TDRN.accessibility.announceToScreenReader('Search focused. Type to search.');
        }
        return;
      }

      // Escape — close modal or clear search
      if (e.key === 'Escape') {
        // Close shortcut overlay first
        var overlay = document.getElementById('shortcut-overlay');
        if (overlay && overlay.classList.contains('active')) {
          TDRN.keyboard.hideShortcuts();
          return;
        }
        // Close active modal
        if (TDRN.modal.isOpen() && TDRN.modal._activeModal) {
          TDRN.modal.close(TDRN.modal._activeModal.id);
          return;
        }
        // Clear search
        var searchEl = document.querySelector('.topbar-search input');
        if (searchEl && document.activeElement === searchEl && searchEl.value !== '') {
          searchEl.value = '';
          searchEl.dispatchEvent(new Event('input'));
          return;
        }
        return;
      }

      // Skip remaining shortcuts if user is typing in a form field
      if (isTyping || isContentEditable) return;

      // 'F' or 'f' — toggle focus mode
      if ((e.key === 'f' || e.key === 'F') && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        TDRN.focusMode.toggle();
        return;
      }

      // Ctrl+P — print current view
      if (e.key === 'p' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        var activePage = document.querySelector('[data-page-section]:not([hidden])');
        if (activePage) {
          TDRN.print.section(activePage.id);
        } else {
          window.print();
        }
        return;
      }

      // '?' — show keyboard shortcuts overlay
      if (e.key === '?' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        TDRN.keyboard.toggleShortcuts();
        return;
      }
    },

    /** Toggle shortcut hints overlay */
    toggleShortcuts: function () {
      var overlay = document.getElementById('shortcut-overlay');
      if (!overlay) {
        TDRN.keyboard._createShortcutOverlay();
        overlay = document.getElementById('shortcut-overlay');
      }
      if (overlay.classList.contains('active')) {
        TDRN.keyboard.hideShortcuts();
      } else {
        TDRN.keyboard.showShortcuts();
      }
    },

    showShortcuts: function () {
      var overlay = document.getElementById('shortcut-overlay');
      if (!overlay) TDRN.keyboard._createShortcutOverlay();
      overlay = document.getElementById('shortcut-overlay');
      overlay.classList.add('active');
      overlay.removeAttribute('hidden');
      TDRN.accessibility.trapFocus(overlay);
      TDRN.accessibility.announceToScreenReader('Keyboard shortcuts overlay opened.');
    },

    hideShortcuts: function () {
      var overlay = document.getElementById('shortcut-overlay');
      if (overlay) {
        overlay.classList.remove('active');
        overlay.setAttribute('hidden', '');
        TDRN.accessibility.releaseFocusTrap();
        TDRN.accessibility.announceToScreenReader('Keyboard shortcuts overlay closed.');
      }
    },

    /** Create the shortcut overlay element if not present in HTML */
    _createShortcutOverlay: function () {
      if (document.getElementById('shortcut-overlay')) return;

      var shortcuts = [
        { keys: ['/'],          desc: 'Focus global search' },
        { keys: ['Esc'],        desc: 'Close modal / clear search' },
        { keys: ['F'],          desc: 'Toggle Focus (Reading) Mode' },
        { keys: ['Ctrl', 'P'], desc: 'Print current view' },
        { keys: ['?'],          desc: 'Show this help overlay' },
      ];

      var items = shortcuts.map(function (s) {
        var keysHtml = s.keys.map(function (k) { return '<kbd>' + k + '</kbd>'; }).join(' + ');
        return '<div class="shortcut-item"><span>' + s.desc + '</span><div class="shortcut-keys">' + keysHtml + '</div></div>';
      }).join('');

      var overlay = document.createElement('div');
      overlay.id = 'shortcut-overlay';
      overlay.setAttribute('role', 'dialog');
      overlay.setAttribute('aria-modal', 'true');
      overlay.setAttribute('aria-label', 'Keyboard shortcuts');
      overlay.setAttribute('hidden', '');
      overlay.innerHTML = [
        '<div class="shortcut-panel">',
        '  <div class="flex justify-between items-center mb-4">',
        '    <h2>Keyboard Shortcuts</h2>',
        '    <button class="btn btn-ghost btn-icon-only" aria-label="Close shortcuts" onclick="TDRN.keyboard.hideShortcuts()">✕</button>',
        '  </div>',
        '  <div class="shortcut-list">' + items + '</div>',
        '</div>'
      ].join('');

      // Close on backdrop click
      overlay.addEventListener('click', function (e) {
        if (e.target === overlay) TDRN.keyboard.hideShortcuts();
      });

      document.body.appendChild(overlay);
    }
  };

  /* ========================================================================
     SECTION 13 — INIT
     ======================================================================== */

  TDRN.init = function () {

    // 1. Initialize accessibility helpers
    TDRN.accessibility.initSkipLinks();

    // 2. Start real-time clock
    TDRN.clock.start();

    // 3. Initialize router (reads current hash or defaults to #/dashboard)
    var lastRoute = TDRN.state.loadState('lastRoute', '#/dashboard');
    if (!window.location.hash) {
      window.location.hash = lastRoute;
    }
    TDRN.router.init();

    // 4. Restore focus mode preference
    TDRN.focusMode.init();

    // 5. Initialize keyboard shortcuts
    TDRN.keyboard.init();

    // 6. Auto-initialize live search inputs (data-live-search attributes)
    document.querySelectorAll('[data-live-search]').forEach(function (input) {
      var containerSelector = input.getAttribute('data-search-container');
      var itemSelector      = input.getAttribute('data-search-items') || '[data-searchable]';
      var container = containerSelector
        ? document.querySelector(containerSelector)
        : input.closest('[data-search-root]');
      if (container) {
        TDRN.search.liveSearch(input, container, itemSelector);
      }
    });

    // 7. Auto-initialize sortable tables
    document.querySelectorAll('.data-table[data-sortable]').forEach(function (table) {
      TDRN.search.initSortableTable(table);
    });

    // 8. Auto-bind modal open buttons ([data-modal-open])
    document.querySelectorAll('[data-modal-open]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        TDRN.modal.open(btn.getAttribute('data-modal-open'));
      });
    });

    // 9. Auto-bind modal close buttons ([data-modal-close])
    document.querySelectorAll('[data-modal-close]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        TDRN.modal.close(btn.getAttribute('data-modal-close'));
      });
    });

    // 10. Auto-bind status filter buttons ([data-filter-status])
    document.querySelectorAll('[data-filter-status]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var containerSelector = btn.getAttribute('data-filter-container');
        var container = containerSelector ? document.querySelector(containerSelector) : null;
        if (container) {
          TDRN.search.filterByStatus(container, btn.getAttribute('data-filter-status'));
          // Update active state on filter buttons
          var siblings = btn.closest('[data-filter-group]');
          if (siblings) {
            siblings.querySelectorAll('[data-filter-status]').forEach(function (b) {
              b.classList.remove('active');
              b.removeAttribute('aria-pressed');
            });
          }
          btn.classList.add('active');
          btn.setAttribute('aria-pressed', 'true');
        }
      });
    });

    // 11. Auto-bind form validation ([data-validate-form])
    document.querySelectorAll('form[data-validate-form]').forEach(function (form) {
      TDRN.forms.initLiveValidation(form);
    });

    // 12. Auto-bind print buttons ([data-print-section])
    document.querySelectorAll('[data-print-section]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        TDRN.print.section(btn.getAttribute('data-print-section'));
      });
    });

    // 13. Auto-render data containers
    var membersContainer   = document.getElementById('render-members');
    var equipmentContainer = document.getElementById('render-equipment');
    var eventsContainer    = document.getElementById('render-events');
    var alertsContainer    = document.getElementById('render-alerts');

    if (membersContainer)   TDRN.render.members(membersContainer);
    if (equipmentContainer) TDRN.render.equipment(equipmentContainer);
    if (eventsContainer)    TDRN.render.events(eventsContainer);
    if (alertsContainer)    TDRN.render.alerts(alertsContainer);

    // 14. Restore filter preferences
    var savedStatusFilter = TDRN.state.loadState('statusFilter', null);
    if (savedStatusFilter) {
      var filterContainer = document.querySelector('[data-filter-root]');
      if (filterContainer) {
        TDRN.search.filterByStatus(filterContainer, savedStatusFilter);
      }
    }

    console.info('TDRN v2.0.0 initialized. \u26A1 Thrive Disaster Response Network');
  };

  /* ========================================================================
     AUTO-INIT ON DOM READY
     ======================================================================== */

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', TDRN.init);
  } else {
    // DOM already ready (script loaded at bottom or deferred)
    TDRN.init();
  }

})(window.TDRN);
