<template>
  <div class="container">
    <header class="site-header">
      <h1>Kingshot Rewards — Automatic Gift Code Redemption</h1>
    </header>

    <section class="controls">
      <div class="field">
        <label for="playerId">Player ID(s)</label>
        <input
          id="playerId"
          v-model="playerInput"
          type="text"
          placeholder="Enter one or more Player IDs separated by commas (e.g. 12345678, 23456789)"
          @keyup.enter="registerPlayer"
        />
      </div>

      <div class="buttons">
        <button
          id="startBtn"
          class="btn-primary"
          :disabled="isRegistering"
          @click="registerPlayer"
        >
          {{ isRegistering ? 'Registering...' : 'Register for Auto Redemption' }}
        </button>
      </div>

      <div id="status" v-if="statusMessage" :class="['status', statusType]">{{ statusMessage }}</div>
    </section>

    <section class="info">
      <h2>About</h2>
      <p><strong>What it does:</strong> This service monitors for new Kingshot gift codes and automatically redeems them for you. Whenever a new code appears the website will redeem it on your behalf. No need to manually redeem gift codes anymore!</p>
      <p><strong>How to register:</strong> Simply enter your Player ID(s) and click on the Register button. Once done you will stay registered even after closing the website. You will see new gift code rewards appear in your game mail whenever a new code gets released.</p>
      <p><strong>To find your Player ID:</strong> Open the game → Profile → Info. Your Player ID appears under your name.</p>
      <div class="disclaimer" role="note" aria-label="Disclaimer">
        <!-- Use Material Symbols glyph via CSS pseudo-element (no inline text to select) -->
        <span class="disclaimer-icon material-symbols-outlined" aria-hidden="true"></span>
        <div class="disclaimer-content">
          <div class="disclaimer-title"><strong>Disclaimer</strong></div>
          <p>To respect Kingshot's rate limits we process registrations and redemptions through a queue. During busy times this can cause noticeable delays — please read the points below so you know what to expect.</p>
          <ul>
            <li>Initial registration and any immediate redemptions can take a few minutes.</li>
            <li>When many players are registered, redeeming newly discovered codes may be delayed.</li>
            <li>If the issue grows too big then a known fix will be implemented to deal with this problem.</li>
          </ul>
        </div>
      </div>
    </section>

    <section class="info">
      <h2>Contact</h2>
      <p>If you have any feedback or want your Player ID removed from the redemption list, feel free to contact me at <a href="mailto:contact@ks-rewards.com">contact@ks-rewards.com</a></p>
    </section>

    <section class="live">
      <div class="panel">
        <h3>Gift Codes</h3>
        <div id="codes" :class="['codes-grid', { empty: activeCodes.length === 0 }]">
          <template v-if="activeCodes.length > 0">
            <div v-for="code in activeCodes" :key="code.code" class="code-tile">
              <div class="code-tile-badge">
                <span class="code-tile-code">{{ code.code }}</span>
              </div>
              <div class="code-tile-status">Active</div>
            </div>
          </template>
          <template v-else>
            <div class="empty-message">No active codes yet.</div>
          </template>
        </div>
      </div>

      <div class="panel">
        <h3>Recent Redemptions</h3>
        <div id="redemptions" :class="['redemptions-grid', { empty: redemptions.length === 0 }]">
          <template v-if="redemptions.length > 0">
            <div
              v-for="(redemption, index) in redemptions"
              :key="index"
              class="redemption-tile"
            >
              <img
                v-if="redemption.avatar_url"
                :src="redemption.avatar_url"
                :alt="`${redemption.nickname || 'Player'} avatar`"
                class="redemption-avatar"
                @error="(e) => (e.target as HTMLImageElement).style.display = 'none'"
              />
              <div v-else class="redemption-avatar-placeholder">👤</div>

              <div class="redemption-info">
                <div class="redemption-player">
                  <span class="redemption-nickname">{{ redemption.nickname || 'Player' }}</span>
                  <span v-if="redemption.kingdom" class="redemption-kingdom">(#{{ redemption.kingdom }})</span>
                </div>
                <div class="redemption-details">
                  <span class="redemption-code">{{ redemption.code }}</span>
                  <span class="redemption-separator">•</span>
                  <span class="redemption-time">{{ formatTime(redemption.redeemed_at) }}</span>
                </div>
              </div>
            </div>
          </template>
          <template v-else>
            <div class="empty-message">No redemptions yet.</div>
          </template>
        </div>
      </div>
    </section>

    <footer>
      <small>Made by player <strong>adaja</strong> (Kingdom 847). Automatic redemption logic adapted from <a href="https://github.com/justncodes" target="_blank" rel="noopener noreferrer">justncodes</a>.</small>
    </footer>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useHead } from '#imports'

// Type definitions
interface GiftCode {
  code: string;
  validation_status: string;
  date_discovered: string;
}

interface Redemption {
  fid: string;
  code: string;
  status: string;
  nickname?: string;
  kingdom?: string;
  avatar_url?: string;
  redeemed_at: string;
}

interface CodesStats {
  total: number;
  validated: number;
  pending: number;
  invalid: number;
  expired: number;
}

interface CodesResponse {
  success: boolean;
  codes?: GiftCode[];
  stats?: CodesStats;
}

interface RedemptionsResponse {
  success: boolean;
  redemptions?: Redemption[];
}

interface RegisterResponse {
  success: boolean;
  redeemedCount?: number;
  alreadyRegistered?: boolean;
  error?: string;
}

// Reactive state
const statusMessage = ref('');
const statusType = ref('');
const playerInput = ref('');
const isRegistering = ref(false);
const codes = ref<GiftCode[]>([]);
const redemptions = ref<Redemption[]>([]);
const codesStats = ref<CodesStats>({
  total: 0,
  validated: 0,
  pending: 0,
  invalid: 0,
  expired: 0
});

// Add SEO meta tags and structured data for the homepage
useHead({
   title: 'Kingshot Rewards — Automatic Gift Code Redemption',
   meta: [
    { name: 'description', content: 'Kingshot Rewards monitors Kingshot gift codes and automatically redeems them for registered Player IDs. Register your Player ID to let the site redeem codes for you.' },
    { name: 'keywords', content: 'kingshot gift codes, kingshot codes, kingshot rewards, auto redeem, giftcodes' },
    { name: 'robots', content: 'index,follow' },
    { property: 'og:title', content: 'Kingshot Rewards — Automatic Gift Code Redemption' },
    { property: 'og:description', content: 'Monitor Kingshot gift codes and have them redeemed automatically for your registered Player IDs.' },
    { property: 'og:type', content: 'website' },
    { property: 'og:url', content: 'https://ks-rewards.com/' },
    { property: 'og:image', content: 'https://ks-rewards.com/favicon.ico' },
    { name: 'twitter:card', content: 'summary' },
    { name: 'twitter:title', content: 'Kingshot Rewards — Automatic Gift Code Redemption' },
    { name: 'twitter:description', content: 'Monitor Kingshot gift codes and have them redeemed automatically for your registered Player IDs.' }
  ],
  link: [
    // Preconnect and stylesheet for Google Material Symbols
    { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
    { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' },
    // Variable icon font (recommended): provides axes ranges so icons can be tuned via CSS
    { rel: 'stylesheet', href: 'https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&icon_names=info' },
    // Static icon font fallback (loads a single instance of the icon glyphs with fixed axes)
    { rel: 'stylesheet', href: 'https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@24,400,0,0&icon_names=info' },
    { rel: 'canonical', href: 'https://ks-rewards.com/' }
  ],
  script: [
    ({
      type: 'application/ld+json',
      children: JSON.stringify({
        "@context": "https://schema.org",
        "@type": "WebSite",
        "name": "Kingshot Rewards",
        "url": "https://ks-rewards.com/",
        "description": "Automatically discovers and redeems Kingshot gift codes for registered Player IDs.",
        "potentialAction": {
          "@type": "SearchAction",
          "target": "https://ks-rewards.com/?q={search_term_string}",
          "query-input": "required name=search_term_string"
        }
      })
    } as any),
    ({
      type: 'application/ld+json',
      children: JSON.stringify({
        "@context": "https://schema.org",
        "@type": "Organization",
        "name": "Kingshot Rewards",
        "url": "https://ks-rewards.com/",
        "contactPoint": [{
          "@type": "ContactPoint",
          "email": "contact@ks-rewards.com",
          "contactType": "customer support"
        }]
      })
    } as any)
  ]
})

// Filter codes to only show validated (active) codes
const activeCodes = computed(() => {
  return codes.value.filter(code => code.validation_status === 'validated');
});

// Helper functions
const formatTime = (time: string) => {
  return new Date(time).toLocaleTimeString();
};

// API functions
let abortController: AbortController | null = null;

async function fetchCodes() {
  try {
    // Cancel any pending request
    if (abortController) {
      abortController.abort();
    }
    abortController = new AbortController();

    const response = await $fetch<CodesResponse>('/api/codes', {
      signal: abortController.signal
    });
    if (response.success) {
      codes.value = response.codes || [];
      codesStats.value = response.stats || codesStats.value;
    }
  } catch (error: any) {
    // Ignore abort errors (they're expected when we cancel requests)
    if (error.name !== 'AbortError') {
      console.error('Error fetching codes:', error);
    }
  }
}

async function fetchRedemptions() {
  try {
    const response = await $fetch<RedemptionsResponse>('/api/codes/recent-redemptions');
    if (response.success) {
      redemptions.value = response.redemptions || [];
    }
  } catch (error: any) {
    // Ignore abort errors
    if (error.name !== 'AbortError') {
      console.error('Error fetching redemptions:', error);
    }
  }
}

async function registerPlayer() {
  const input = playerInput.value.trim();
  if (!input) {
    statusMessage.value = 'Please enter at least one player ID';
    statusType.value = 'error';
    return;
  }

  // Split by comma and clean up
  const fids = input.split(',').map(f => f.trim()).filter(f => f);

  if (fids.length === 0) {
    statusMessage.value = 'Please enter at least one valid player ID';
    statusType.value = 'error';
    return;
  }

  // Validate all are numeric
  for (const fid of fids) {
    if (!/^\d+$/.test(fid)) {
      statusMessage.value = `Invalid player ID: ${fid}. Player IDs must be numeric.`;
      statusType.value = 'error';
      return;
    }
  }

  isRegistering.value = true;
  statusMessage.value = `Registering ${fids.length} player ID(s)... - This may take a few minutes`;
  statusType.value = '';

  let successCount = 0;
  let failCount = 0;
  const results: string[] = [];

  try {
    for (const fid of fids) {
      try {
        const response = await $fetch<RegisterResponse>('/api/users/register', {
          method: 'POST',
          body: { fid }
        });

        if (response.success) {
          if (response.alreadyRegistered) {
            results.push(`${fid}: Already registered`);
          } else if (response.redeemedCount) {
            results.push(`${fid}: Registered, successfully redeemed ${response.redeemedCount} code${response.redeemedCount !== 1 ? 's' : ''}`);
          } else {
            results.push(`${fid}: Registered`);
          }
          successCount++;
        } else {
          results.push(`${fid}: Failed - ${response.error || 'Unknown error'}`);
          failCount++;
        }
      } catch (error: any) {
        results.push(`${fid}: Error - ${error.message || String(error)}`);
        failCount++;
      }
    }

    if (successCount > 0) {
      statusType.value = 'success';
      playerInput.value = ''; // Clear input on success

      // Wait a moment to let immediate redemptions complete, then refresh
      statusMessage.value += ' Refreshing redemptions...';
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Refresh data
      await fetchCodes();
      await fetchRedemptions();

      // Show a concise summary plus the per-fid results so users see what happened
      const summary = `✅ ${successCount} player(s) registered successfully`;
      statusMessage.value = results.length > 0 ? `${summary}: [${results.join(', ')}]` : summary;
    } else {
      statusType.value = 'error';
    }
  } catch (error: any) {
    statusMessage.value = `Registration error: ${error.message || String(error)}`;
    statusType.value = 'error';
  } finally {
    isRegistering.value = false;
  }
}

// Polling for updates
let redemptionsInterval: NodeJS.Timeout;
let codesInterval: NodeJS.Timeout;

onMounted(() => {
  // Initial fetch
  fetchCodes();
  fetchRedemptions();

  // Start polling
  redemptionsInterval = setInterval(() => {
    fetchRedemptions();
  }, 5000);

  // Fetch codes less frequently
  codesInterval = setInterval(() => {
    fetchCodes();
  }, 10000);
});

onUnmounted(() => {
  if (redemptionsInterval) clearInterval(redemptionsInterval);
  if (codesInterval) clearInterval(codesInterval);
  if (abortController) abortController.abort();
});
</script>

<style scoped>
/* Light-only theme for Kingshot Rewards frontend */
:root {
  /* Medieval-inspired palette (light) */
  --primary-dark: #8B6F47; /* Leather Brown */
  --primary-medium: #A0826D; /* Wood Brown */
  --primary-gold: #D4A574; /* Royal Gold */
  --primary-light: #F5E6D3; /* Parchment Cream */

  /* parchment-only backdrop (no dark brown top) */
  --bg: linear-gradient(135deg, #F3ECE0 0%, #E9DFC8 100%);
  --card-bg: rgba(255,255,255,0.98);
  --panel-bg: #FFF8EF;

  --text: #5C4A35;
  --muted-text: #8B7355;
  --accent: var(--primary-gold);
  --border: rgba(92,74,53,0.08);

  --success: #6B8E23;
  --danger: #E06A6A;

  --shadow-sm: 0 2px 6px rgba(0,0,0,0.06);
  --shadow-md: 0 6px 18px rgba(0,0,0,0.09);
}

/* Base styles */
* {
  box-sizing: border-box;
}

.container {
  max-width: 980px;
  margin: 0 auto;
  padding: 20px;
  min-height: 100vh;
  background: var(--bg);
  color: var(--text);
  font-family: system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial;
}

.site-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
  padding: 12px;
  border-radius: 10px;
  background: linear-gradient(90deg, #6b472c 0%, #7b5a36 60%);
  border: 1px solid rgba(92,74,53,0.08);
  box-shadow: var(--shadow-md);
}

.site-header h1 {
  font-family: 'Cinzel', serif;
  font-weight: 700;
  font-size: 20px;
  margin: 0;
  color: var(--primary-light);
  letter-spacing: 0.2px;
  text-shadow: 0 2px 6px rgba(0,0,0,0.20);
}

.controls {
  background: var(--card-bg);
  padding: 14px;
  border-radius: 10px;
  box-shadow: var(--shadow-sm);
  margin-bottom: 16px;
  border: 1px solid var(--border);
}

.field {
  margin-bottom: 12px;
}

label {
  display: block;
  font-weight: 700;
  margin-bottom: 6px;
  color: var(--muted-text);
}

input[type=text] {
  width: 100%;
  padding: 10px 12px;
  border-radius: 8px;
  border: 1px solid rgba(0,0,0,0.06);
  background: transparent;
  color: var(--text);
  font-size: 14px;
}

input[type=text]:focus {
  outline: none;
  box-shadow: 0 0 0 6px rgba(212,165,116,0.06);
  border-color: rgba(212,165,116,0.24);
}

.buttons {
  display: flex;
  gap: 8px;
}

.btn-primary {
  background: linear-gradient(180deg, #7FD45C 0%, #4CAF50 50%, #2E7D32 100%);
  color: #ffffff;
  padding: 6px 12px;
  border: 2px solid #29491a;
  border-radius: 10px;
  font-size: 13px;
  font-weight: 700;
  text-shadow: 0 1px 1px rgba(0,0,0,0.35);
  cursor: pointer;
  box-shadow: 0 3px 0 #1B4D20, 0 5px 8px rgba(0, 0, 0, 0.20), inset 0 1px 0 rgba(255, 255, 255, 0.10);
  position: relative;
  transition: none;
}

.btn-primary:hover,
.btn-primary:active {
  transform: none !important;
  box-shadow: 0 3px 0 #1B4D20, 0 5px 8px rgba(0,0,0,0.20), inset 0 1px 0 rgba(255,255,255,0.10) !important;
  background: linear-gradient(180deg, #7FD45C 0%, #4CAF50 50%, #2E7D32 100%) !important;
}

.btn-primary:focus-visible {
  outline: 4px solid rgba(212,165,116,0.30);
  outline-offset: 4px;
}

.btn-primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  filter: grayscale(0.05);
}

.status {
  margin-top: 10px;
  color: var(--muted-text);
  font-size: 13px;
}

.info {
  background: var(--panel-bg);
  padding: 14px;
  border-radius: 10px;
  margin-bottom: 16px;
  border: 1px solid var(--border);
}

.info h2 {
  margin-top: 0;
  color: var(--text);
}

.info p {
  margin: 8px 0;
  color: var(--text);
}

.info a {
  color: var(--primary-dark);
  text-decoration: none;
  border-bottom: 1px solid rgba(139, 111, 71, 0.2);
  transition: border-color 0.2s ease;
}

.info a:hover {
  text-decoration: none;
  border-bottom-color: var(--primary-dark);
}

.live {
  display: grid;
  grid-template-columns: 1fr 360px;
  gap: 12px;
}

.panel {
  background: var(--card-bg);
  padding: 12px;
  border-radius: 10px;
  min-height: 140px;
  border: 1px solid var(--border);
  box-shadow: var(--shadow-sm);
}

.panel h3 {
  margin-top: 0;
  color: var(--text);
  position: relative;
  padding-bottom: 6px;
}

.panel h3:after {
  content: '';
  position: absolute;
  left: 0;
  bottom: 0;
  height: 3px;
  width: 48px;
  background: linear-gradient(90deg, var(--accent), rgba(0,0,0,0));
  border-radius: 2px;
}


/* Gift Codes Grid */
.codes-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 12px;
  padding: 8px;
  max-height: 360px;
  overflow: auto;
}

.codes-grid.empty {
  display: block;
  padding: 20px;
  text-align: center;
}

.empty-message {
  color: var(--muted-text);
  font-style: italic;
  text-align: center;
  padding: 20px;
}

.code-tile {
  background: linear-gradient(135deg, rgba(212,165,116,0.1) 0%, rgba(212,165,116,0.05) 100%);
  border: 2px solid rgba(212,165,116,0.3);
  border-radius: 12px;
  padding: 16px 12px;
  text-align: center;
  transition: all 0.3s ease;
  box-shadow: 0 2px 4px rgba(0,0,0,0.05);
}

.code-tile:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(212,165,116,0.2);
  border-color: var(--accent);
}

.code-tile-badge {
  margin-bottom: 8px;
}

.code-tile-code {
  font-family: monospace;
  font-size: 16px;
  font-weight: 700;
  color: var(--primary-dark);
  letter-spacing: 0.5px;
  display: block;
  padding: 8px;
  background: rgba(255,255,255,0.6);
  border-radius: 8px;
  word-break: break-all;
}

.code-tile-status {
  font-size: 11px;
  text-transform: uppercase;
  font-weight: 700;
  color: #4CAF50;
  letter-spacing: 1px;
  margin-bottom: 4px;
}


/* Redemptions Grid */
.redemptions-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 12px;
  padding: 8px;
  max-height: 360px;
  overflow: auto;
}

.redemptions-grid.empty {
  display: block;
  padding: 20px;
  text-align: center;
}

.redemption-tile {
  background: linear-gradient(135deg, rgba(107,142,35,0.12) 0%, rgba(107,142,35,0.06) 100%);
  border: 2px solid rgba(107,142,35,0.25);
  border-radius: 12px;
  padding: 10px;
  transition: all 0.3s ease;
  box-shadow: 0 2px 4px rgba(0,0,0,0.05);
  display: flex;
  align-items: center;
  gap: 10px;
}

.redemption-tile:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(107,142,35,0.25);
  border-color: rgba(107,142,35,0.4);
}

.redemption-avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  object-fit: cover;
  flex-shrink: 0;
  border: 2px solid rgba(107,142,35,0.3);
}

.redemption-avatar-placeholder {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: rgba(107,142,35,0.15);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  flex-shrink: 0;
  border: 2px solid rgba(107,142,35,0.3);
}

.redemption-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.redemption-player {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-wrap: wrap;
}

.redemption-nickname {
  font-weight: 600;
  color: var(--primary-dark);
  font-size: 13px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.redemption-kingdom {
  color: var(--muted-text);
  font-size: 11px;
  font-weight: 500;
}

.redemption-details {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
}

.redemption-code {
  font-family: monospace;
  font-size: 12px;
  font-weight: 700;
  color: #4CAF50;
  letter-spacing: 0.5px;
  background: rgba(255,255,255,0.7);
  padding: 2px 6px;
  border-radius: 4px;
}

.redemption-separator {
  color: var(--muted-text);
  opacity: 0.5;
  font-size: 10px;
}

.redemption-time {
  color: var(--muted-text);
  font-size: 10px;
  white-space: nowrap;
}


footer {
  margin-top: 12px;
  padding: 0 12px;
  color: var(--muted-text);
  font-size: 13px;
  text-align: left;
}

footer a {
  color: var(--primary-dark);
  text-decoration: none;
  border-bottom: 1px solid rgba(139, 111, 71, 0.2);
  transition: border-color 0.2s ease;
}

footer a:hover {
  text-decoration: none;
  border-bottom-color: var(--primary-dark);
}

/* Responsive */
@media (max-width: 900px) {
  .live {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 768px) {
  .container {
    padding: 12px;
  }

  .site-header h1 {
    font-size: 16px;
    text-align: center;
  }

  .controls {
    padding: 12px;
  }

  .field label {
    font-size: 13px;
  }

  input[type=text] {
    font-size: 16px; /* Prevents zoom on iOS */
  }

  .btn-primary {
    width: 100%;
    padding: 10px 12px;
    font-size: 14px;
  }

  .info {
    padding: 12px;
  }

  .info h2 {
    font-size: 18px;
  }

  .info p {
    font-size: 14px;
  }

  .panel {
    padding: 10px;
  }

  .panel h3 {
    font-size: 16px;
  }

  .codes-grid {
    grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
    gap: 10px;
    max-height: 300px;
  }

  .code-tile {
    padding: 12px 10px;
  }

  .code-tile-code {
    font-size: 14px;
  }

  .redemptions-grid {
    grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
    gap: 10px;
    max-height: 300px;
  }

  .redemption-tile {
    padding: 8px;
    gap: 8px;
  }

  .redemption-avatar,
  .redemption-avatar-placeholder {
    width: 36px;
    height: 36px;
  }

  .redemption-nickname {
    font-size: 12px;
  }

  .redemption-code {
    font-size: 11px;
    padding: 2px 5px;
  }


  footer {
    font-size: 12px;
    text-align: center;
    padding: 12px;
  }
}

@media (max-width: 480px) {
  .container {
    padding: 8px;
  }

  .site-header {
    padding: 10px;
    margin-bottom: 12px;
  }

  .site-header h1 {
    font-size: 14px;
    line-height: 1.4;
  }

  .controls,
  .info,
  .panel {
    margin-bottom: 12px;
  }

  .codes-grid {
    grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
    gap: 8px;
    max-height: 250px;
    padding: 6px;
  }

  .code-tile {
    padding: 10px 8px;
  }

  .code-tile-code {
    font-size: 13px;
    padding: 6px;
  }

  .redemptions-grid {
    grid-template-columns: 1fr;
    gap: 8px;
    max-height: 250px;
    padding: 6px;
  }

  .redemption-tile {
    padding: 8px;
    gap: 8px;
  }

  .redemption-avatar,
  .redemption-avatar-placeholder {
    width: 32px;
    height: 32px;
    font-size: 16px;
  }

  .redemption-nickname {
    font-size: 11px;
  }

  .redemption-kingdom {
    font-size: 10px;
  }

  .redemption-code {
    font-size: 10px;
    padding: 2px 4px;
  }

  .redemption-time {
    font-size: 9px;
  }
}

.disclaimer {
  display: flex;
  gap: 12px;
  align-items: flex-start;
  background: linear-gradient(180deg, rgba(212,165,116,0.06), rgba(255,255,255,0.02));
  border-left: 4px solid var(--primary-gold);
  padding: 12px 14px;
  border-radius: 8px;
  color: var(--text);
  box-shadow: var(--shadow-sm);
}

.material-symbols-outlined {
  font-family: 'Material Symbols Outlined', system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
  /* Use the axes the variable-font request exposes: adjust these values to tune appearance */
  font-variation-settings: 'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24;
}

.disclaimer-icon {
  /* visual sizing & layout only; font family and axes come from .material-symbols-outlined */
  font-size: 28px; /* visible glyph size */
  line-height: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 36px;
  color: var(--primary-dark);
  opacity: 0.95;
  margin-top: 2px;
  /* Prevent the icon text from being selected/copyable (avoids partial selections like "in") */
  -webkit-user-select: none; /* Safari */
  -moz-user-select: none;
  -ms-user-select: none;
  user-select: none;
  /* Disable iOS tap-and-hold menu for the icon */
  -webkit-touch-callout: none;
  /* Prevent pointer events so selection/dragging won't start from the icon */
  pointer-events: none;
}

/* Render the icon glyph via CSS pseudo-element so there's no real text node to select */
.disclaimer-icon::before {
  /* Use the 'info' icon codepoint so there's no selectable word fragments; codepoint: e88e */
  content: "\e88e";
  display: inline-block;
  /* inherit the font and variation settings from the parent class */
  font-family: inherit;
  font-variation-settings: inherit;
  font-size: inherit;
  line-height: inherit;
  /* ensure the pseudo-element cannot be selected or copied */
  -webkit-user-select: none;
  -moz-user-select: none;
  -ms-user-select: none;
  user-select: none;
}

.disclaimer-content {
  font-size: 14px;
  color: var(--text);
}

.disclaimer-title {
  margin-bottom: 6px;
  color: var(--primary-dark);
}

.disclaimer-content p {
  margin: 0 0 8px 0;
  color: var(--muted-text);
}

.disclaimer-content ul {
  margin: 0;
  padding-left: 18px;
  color: var(--muted-text);
}

.disclaimer-content li {
  margin-bottom: 6px;
}
</style>
